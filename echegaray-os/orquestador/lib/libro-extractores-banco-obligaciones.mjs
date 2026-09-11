// EL EXTRACTO COMO FUENTE DE LAS OBLIGACIONES QUE YA SE PAGARON — no sólo como testigo.
//
// ═══ POR QUÉ EXISTE (11/09/2026, orden del dueño) ═══
//
// El dueño va a vaciar de la pestaña Compras todo lo que no sea Civil, Estructura o Mantenimiento.
// Hoy cinco grupos de plata entran al libro SÓLO por filas TIPEADAS en Compras: el F931 pagado, los
// gremiales pagados, las cuotas de planes de ARCA, los impuestos y la cuota del prendario. Medido en
// `docs/engineering/COMPRAS-LIMPIEZA-2026-09-11.md`: $94,1 M de REAL y $17,3 M de FUTURO. Si esas
// filas se vacían sin darle a cada grupo una fuente propia, el Cash Flow los pierde enteros.
//
// La REALIDAD ÚNICA que resuelve esto es simple de decir: **el REAL sale del banco, el FUTURO de su
// fuente propia, y nada se cuenta dos veces**. Este módulo es la primera mitad — el REAL.
//
// ═══ QUÉ CAMBIA RESPECTO DE `deBancoCargos` ═══
//
// `deBancoCargos` emite sólo los cargos del banco SIN factura (impuesto al cheque, comisiones,
// intereses). El resto del extracto no se emitía por una regla que cuidó mucha plata: *el saldo del
// banco ya contiene sus movimientos, y las compras pagadas por transferencia ya entran por Compras*.
// Esa regla sigue en pie — lo que cambia es su premisa. Cuando una obligación dejó de tener fila en
// Compras, el débito que la pagó ya no entra «por otro lado»: no entra por ninguno.
//
// ═══ EL DEDUPE TRANSICIONAL: LA PARTE QUE NO PUEDE FALLAR ═══
//
// Las filas se van a vaciar por lotes, a lo largo de días, y el libro se regenera cada hora. Así que
// durante la transición las dos fuentes conviven y el mismo pago puede estar en las dos. La regla:
//
//   **si Compras todavía lleva esa obligación, el REAL sale de Compras y este módulo NO emite.**
//
// No se decide por `usados` sino por la PRESENCIA de la obligación en Compras (mismo rubro, importe
// al peso, dentro de la ventana). El motivo es de orden: `usados` lo llena el cruce contra el banco,
// que corre DESPUÉS de que este módulo tiene que haber hablado (la cadena de cargas necesita saber
// qué meses pagó el banco antes de proyectar). Mirar la fuente de origen no depende de ningún orden.
//
// El sesgo es deliberado y es el conservador: ante la duda NO se emite. Una plata que falta la
// muestra el control de cobertura y la simulación de `libro-simular-sin-compras.mjs`; una plata
// contada dos veces infla la caja y no se ve en ninguna parte.
//
// ═══ LO QUE ESTE MÓDULO NO EMITE, Y POR QUÉ (es la mitad que importa) ═══
//
// · **Los débitos AFIP que no se aparean con nada.** La naturaleza `AFIP` mete en la misma bolsa el
//   F931, el VEP de IVA, el de Ganancias y la cuota de plan: el concepto del extracto no los
//   distingue (`banco-santander.mjs:703`). Y el IVA/IIBB NO viene de Compras — lo emite la pestaña
//   «Impuestos y Financieros» con su vencimiento real, y al débito que lo paga lo retira el cruce
//   (`libro-cruce-banco.mjs`). Emitir acá un REAL por cada débito AFIP sin aparear contaría el IVA
//   dos veces: una como COMPROMETIDO de esa pestaña y otra como REAL del banco. Se avisa y no se
//   emite; el grito ya existe y es el `sobrantes` del cruce.
// · **Los débitos a DGR San Juan.** Mismo caso: el IIBB lo emite «Impuestos y Financieros». Acá el
//   defecto es del CRUCE, que con `naturalezaEsperada` devuelve `null` para DGR y por eso nunca
//   retira ese COMPROMETIDO. Enseñarle la naturaleza al cruce es el arreglo correcto; emitir un REAL
//   paralelo sería taparlo con un doble conteo.
// · **El Colegio de Ingenieros.** `banco-santander.mjs` no tiene ninguna regla que lo reconozca: sin
//   naturaleza no hay apareo posible, y adivinar por el texto del concepto es fabricar.
//
// NÚCLEO PURO: recibe los débitos ya leídos y las filas de Compras; no lee Google, no toca la base.

import { movimiento, SALE } from './libro-movimientos.mjs'
import { isoDeSerial, serialDe } from './libro-extractores-fechas.mjs'
import { NAT } from './banco-santander.mjs'
import { columnasDeCompras, estaPagada, estaAnulada } from './libro-extractores-compras.mjs'
import { aparearImporte, TOLERANCIA_APAREO } from './cargas-pagos-banco.mjs'
import { RUBRO_CARGAS, RUBRO_GREMIALES, RUBRO_PLANES, mesDeSerial, serie } from './libro-extractores-cargas.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const dosDecimales = (v) => Math.round(v * 100) / 100
const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/** El rubro del prendario y de los cargos del banco. Mismo texto que `rubro-caja.mjs`: taxonomía única. */
export const RUBRO_FINANCIERO = 'Financiero'

/** El `origen.pestana` de las cuotas futuras del prendario. No es una pestaña: es el archivo de datos
 *  que las declara, y se nombra así para que `cash-flow-cobertura.mjs` pueda declararlo como fuente. */
export const PESTANA_PRENDARIO = 'prestamo-prendario.json'

/**
 * CUÁNTOS DÍAS PUEDE SEPARARSE UN DÉBITO DE LA FILA DE COMPRAS QUE REGISTRA EL MISMO PAGO.
 *
 * 31 días, y es ancho a propósito. La «Fecha de caja» de Compras la tipea una persona: el pago del
 * F931 de agosto debitado el 07/09 puede estar cargado con la fecha del vencimiento (10/09), con la
 * del devengado o con la del día en que lo cargó. Una ventana angosta haría que la fila de Compras
 * y el débito no se reconozcan como el mismo hecho, y entonces el libro tendría los dos — que es
 * exactamente el defecto que este módulo no puede introducir.
 */
export const VENTANA_COMPRAS = 31

/**
 * CUÁNTOS DÍAS PUEDE SEPARARSE EL DÉBITO DE ARCA DEL VENCIMIENTO DE LA OBLIGACIÓN QUE PAGA.
 *
 * 31 también: el F931 de agosto venció el 10/09 y se debitó el 07/09 (tres días ANTES), y un pago
 * atrasado puede caer quince días después. Lo que prueba el apareo es la coincidencia de importe al
 * centavo, única en la ventana; la ventana sólo evita atribuirle a agosto un pago de marzo.
 */
export const VENTANA_VENCIMIENTO = 31

/** Un día en seriales de Sheets es 1: la ventana se compara en días, no en milisegundos. */
const dentroDe = (a, b, dias) => Math.abs(a - b) <= dias

/**
 * NÚCLEO PURO: las obligaciones que la pestaña Compras TODAVÍA lleva, por rubro.
 *
 * Es la lista contra la que se mide el dedupe transicional. Incluye las PAGADAS y las PENDIENTES: las
 * dos ocupan el lugar del débito en el libro (la pagada como REAL, la pendiente como COMPROMETIDO), y
 * emitir el débito encima de cualquiera de las dos duplica.
 *
 * LAS ANULADAS NO CUENTAN, y es el corazón de la transición: la fila que el dueño marcó «ELIMINADO»
 * ya no emite ningún movimiento (`deCompras` la saltea), así que su plata quedó vacante y es
 * justamente la que este módulo tiene que reponer desde el banco.
 *
 * @param {Array<Array>} filas Compras entera, UNFORMATTED_VALUE
 * @param {Set<string>|Array<string>} rubros los rubros que interesan
 * @returns {Array<{fila:number, rubro:string, fecha:number, total:number, pagada:boolean}>}
 */
export function obligacionesDeCompras(filas = [], rubros = []) {
  const quiero = rubros instanceof Set ? rubros : new Set(rubros)
  if (!filas.length) return []
  const c = columnasDeCompras(filas)
  const out = []
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const rubro = txt(f[c.rubro])
    if (!quiero.has(rubro)) continue
    if (estaAnulada(f[c.estado])) continue
    const fecha = num(f[c.fechaCaja])
    const total = num(f[c.importe])
    if (fecha === null || !total) continue
    out.push({ fila: i + 1, rubro, fecha, total: Math.abs(total), pagada: estaPagada(f[c.estado]) })
  }
  return out
}

/**
 * NÚCLEO PURO: ¿alguna fila de Compras ya lleva este débito? Devuelve la fila que lo explica, o null.
 *
 * El criterio es (rubro · importe al peso · ventana). NO se mira el proveedor: la fila de Compras del
 * F931 puede decir «ARCA», «AFIP» o «931 agosto», y el concepto del extracto dice
 * «Imp.afip 2686 5827», así que compararlos descartaría pares verdaderos.
 */
export function explicadoPorCompras(debito, rubro, obligaciones = [], { ventana = VENTANA_COMPRAS } = {}) {
  return obligaciones.find((o) => o.rubro === rubro
    && Math.abs(o.total - debito.importe) <= TOLERANCIA_APAREO
    && dentroDe(o.fecha, debito.fecha, ventana)) ?? null
}

/** Un movimiento REAL nacido de un débito del extracto. La referencia del banco es su identidad. */
function movDeDebito(d, { rubro, concepto, contraparte }) {
  return movimiento({
    fecha: d.fecha,
    signo: SALE,
    importe: d.importe,
    concepto,
    contraparte,
    rubro,
    estado: 'REAL',
    instrumento: 'debito',
    // El crudo de la celda C es NEGATIVO en un débito y `debitosDelExtracto` lo devuelve positivo:
    // se reconstruye el signo para que la clave sea LA MISMA que armaría `deBancoCargos` sobre la
    // misma fila. Dos claves distintas para el mismo débito lo dejarían entrar dos veces.
    referenciaBanco: `${d.fecha}|${txt(d.concepto)}|${-d.importe}`,
    origen: { pestana: '_BANCO_RAW', fila: d.fila },
  })
}

/**
 * NÚCLEO PURO: el período del F931 que paga cada débito de ARCA, y cuánto paga.
 *
 * El apareo es por IMPORTE contra el TOTAL DECLARADO de la DDJJ —el dato exacto al centavo que ya
 * publica la pestaña «Cargas Sociales» en `CARGAS_MES_F931_DECLARADO`— dentro de la ventana del
 * vencimiento. Es la misma prueba que `libro-cruce-banco.mjs` acepta como `MODO.exacto` y la misma
 * que `cargas-pagos-banco.mjs` usa para la boleta de UOCRA: o coincide dentro del peso de redondeo, o
 * la combinación de débitos es única. Nunca «el más parecido».
 *
 * NO SE APAREA CONTRA LA PROYECCIÓN. Un débito que coincide con un importe proyectado no prueba nada:
 * la proyección es un número redondeado por el método, y darle el valor de una DDJJ sería convertir
 * una estimación en un hecho.
 */
function aparearF931({ debitos, usados, declarado, fechas, avisos }) {
  const D = serie(declarado)
  const F = serie(fechas)
  const porPeriodo = new Map()
  const emitir = []
  for (let i = 0; i < F.length; i++) {
    const vence = num(F[i])
    const obligacion = num(D[i])
    if (vence === null || !obligacion) continue
    const enVentana = debitos.filter((d) => dentroDe(d.fecha, vence, VENTANA_VENCIMIENTO))
    const r = aparearImporte(enVentana, obligacion, usados)
    if (!r) continue
    const devengado = `${anioDevengado(vence, i + 1)}-${String(i + 1).padStart(2, '0')}`
    const cubierto = dosDecimales(r.elegidos.reduce((a, d) => a + d.importe, 0))
    porPeriodo.set(devengado, {
      periodo: devengado,
      declarado: obligacion,
      cubierto: Math.min(obligacion, cubierto),
      fecha: Math.max(...r.elegidos.map((d) => d.fecha)),
      filas: r.elegidos.map((d) => d.fila),
      motivo: r.motivo,
      debitos: r.elegidos,
    })
    avisos.push(`libro-extractores-banco-obligaciones: el F931 de ${devengado} (DDJJ ${pesos(obligacion)}) `
      + `lo pagó el banco — ${r.motivo}.`)
    emitir.push({ devengado, vence, elegidos: r.elegidos })
  }
  return { porPeriodo, emitir }
}

/** El año del mes DEVENGADO: si la salida cae en un mes anterior al devengado, cruzó el año. */
const anioDevengado = (serial, mesDevengado) => {
  const a = Number(isoDeSerial(serial).slice(0, 4))
  const mesSalida = Number(isoDeSerial(serial).slice(5, 7))
  return mesSalida >= mesDevengado ? a : a - 1
}

/**
 * EL EXTRACTO → los movimientos REAL de las obligaciones que dejaron de tener fila en Compras.
 *
 * @param {object} e
 * @param {Array} e.debitos           los de `debitosDelExtracto(banco)`
 * @param {Set<number>} e.usados      el Set compartido: un débito respalda a UNA obligación
 * @param {Array<Array>} e.compras    Compras entera (para el dedupe transicional)
 * @param {Array} e.declaradoF931     `CARGAS_MES_F931_DECLARADO` tal como se leyó
 * @param {Array} e.fechasCargas      `CARGAS_MES_FECHAS` (el vencimiento de cada mes devengado)
 * @param {{porPeriodo:Map}|null} e.pagosGremiales lo que ya apareó `pagosGremialesDelBanco`
 * @param {{cuota_conocida:number}|null} e.planes  el contenido de `datos/planes-arca.json`
 * @returns {{movimientos:Array, pagosF931:Map<string,object>, avisos:string[]}}
 *          `pagosF931` viaja con la clave `${devengado}·${rubro}` que espera `deCargasSociales`: el
 *          mes que el banco pagó lo apaga la cadena con el mecanismo que ya existe para gremiales.
 */
export function deBancoObligaciones({
  debitos = [], usados = new Set(), compras = [], declaradoF931 = [], fechasCargas = [],
  pagosGremiales = null, planes = null,
} = {}) {
  const avisos = []
  const movimientos = []
  const obligaciones = obligacionesDeCompras(compras,
    [RUBRO_FINANCIERO, RUBRO_CARGAS, RUBRO_GREMIALES, RUBRO_PLANES])
  /** Emite si —y sólo si— Compras no lleva ya esa obligación. Devuelve true si emitió. */
  const emitirSiLibre = (d, { rubro, concepto, contraparte }) => {
    const ya = explicadoPorCompras(d, rubro, obligaciones)
    if (ya) {
      avisos.push(`libro-extractores-banco-obligaciones: el débito de ${pesos(d.importe)} del `
        + `${isoDeSerial(d.fecha)} (_BANCO_RAW f${d.fila}) ya lo lleva Compras f${ya.fila} `
        + `(${ya.pagada ? 'pagada' : 'pendiente'}) — no lo emito: mientras la fila exista, el REAL sale de Compras.`)
      return false
    }
    movimientos.push(movDeDebito(d, { rubro, concepto, contraparte }))
    usados.add(d.fila)
    return true
  }

  // ── EL PRENDARIO: naturaleza propia, una cuota por mes, ninguna ambigüedad ──────────────────────
  for (const d of debitos.filter((x) => txt(x.naturaleza) === NAT.prendario)) {
    if (usados.has(d.fila)) continue
    emitirSiLibre(d, {
      rubro: RUBRO_FINANCIERO,
      concepto: `Cuota préstamo prendario · ${isoDeSerial(d.fecha).slice(0, 7)}`,
      contraparte: 'Banco Santander · préstamo prendario',
    })
  }

  // ── LOS GREMIALES: SE REUSA EL APAREO QUE YA EXISTE, no se hace otro ────────────────────────────
  //
  // `pagosGremialesDelBanco` ya decide qué débito paga qué boleta (UOCRA por DEBIN al CUIT, Fondo de
  // Cese por el período que el banco escribe en el concepto, IERIC/FODECO contra sus boletas) y ya
  // consumió esos débitos en `usados`. Hasta hoy ese apareo sólo RESTABA la obligación proyectada: no
  // existía ningún movimiento REAL con rubro `Nómina · Gremiales`, así que el pago salía del saldo del
  // banco y de ningún renglón del cuadro. Acá se le pone el renglón, sin volver a decidir nada.
  for (const p of pagosGremiales?.porPeriodo?.values() ?? []) {
    for (const det of p.detalle ?? []) {
      for (const fila of det.filas ?? []) {
        const d = debitos.find((x) => x.fila === fila)
        if (!d) continue
        const ya = explicadoPorCompras(d, RUBRO_GREMIALES, obligaciones)
        if (ya) {
          avisos.push(`libro-extractores-banco-obligaciones: el pago de ${det.organismo} de ${p.periodo} `
            + `(${pesos(d.importe)}, f${d.fila}) ya lo lleva Compras f${ya.fila} — no lo emito.`)
          continue
        }
        movimientos.push(movDeDebito(d, {
          rubro: RUBRO_GREMIALES,
          concepto: `${det.organismo} · nómina de ${p.periodo}`,
          contraparte: det.organismo,
        }))
      }
    }
  }

  // ── ARCA: PRIMERO EL F931 DECLARADO, DESPUÉS LA CUOTA DE PLAN, Y NADA MÁS ───────────────────────
  const afip = debitos.filter((x) => txt(x.naturaleza) === NAT.afip)
  const f931 = aparearF931({
    debitos: afip, usados, declarado: declaradoF931, fechas: fechasCargas, avisos,
  })
  const pagosF931 = new Map()
  for (const e of f931.emitir) {
    const p = f931.porPeriodo.get(e.devengado)
    // EL DEDUPE SE DECIDE POR PERÍODO, NO POR DÉBITO: el F931 puede salir en dos VEP y la fila de
    // Compras es una sola. Si Compras lleva el mes, no se emite NINGUNO de los dos débitos.
    const ya = e.elegidos.map((d) => explicadoPorCompras(d, RUBRO_CARGAS, obligaciones)).find(Boolean)
    if (ya) {
      avisos.push(`libro-extractores-banco-obligaciones: el F931 de ${e.devengado} ya lo lleva `
        + `Compras f${ya.fila} — no lo emito, y la cadena sigue decidiendo por Compras.`)
      continue
    }
    for (const d of e.elegidos) {
      movimientos.push(movDeDebito(d, {
        rubro: RUBRO_CARGAS,
        concepto: `F931 · nómina de ${e.devengado}`,
        contraparte: 'ARCA',
      }))
      usados.add(d.fila)
    }
    // La clave es la que `deCargasSociales` busca: `${devengado}·${rubro}`. Con esto la cadena no
    // vuelve a emitir como COMPROMETIDO un mes que el banco ya pagó — y sin fila en Compras.
    pagosF931.set(`${e.devengado}·${RUBRO_CARGAS}`, { ...p, fueraDelDeclarado: 0 })
  }

  // LA CUOTA DE PLAN: el único importe que el OS conoce. Sin cronograma no se proyecta nada (Fase 4).
  const cuota = num(planes?.cuota_conocida)
  if (cuota) {
    for (const d of afip) {
      if (usados.has(d.fila)) continue
      if (Math.abs(d.importe - cuota) > TOLERANCIA_APAREO) continue
      emitirSiLibre(d, {
        rubro: RUBRO_PLANES,
        concepto: `Cuota plan de facilidades ARCA · ${isoDeSerial(d.fecha).slice(0, 7)}`,
        contraparte: 'ARCA',
      })
    }
  }

  // LO QUE QUEDÓ SIN APAREAR SE NOMBRA Y NO SE EMITE (ver la cabecera: el IVA entra por su pestaña).
  const sueltos = afip.filter((d) => !usados.has(d.fila))
  for (const d of sueltos) {
    avisos.push(`libro-extractores-banco-obligaciones: AFIP sin aparear — ${pesos(d.importe)} el `
      + `${isoDeSerial(d.fecha)} (_BANCO_RAW f${d.fila}). No lo emito: la naturaleza AFIP mezcla F931, `
      + 'VEP de IVA/Ganancias y cuotas de plan, y el IVA ya entra por «Impuestos y Financieros». '
      + 'Para atribuirlo hace falta el detalle del VEP, que ninguna fuente del OS lee.')
  }
  const dgr = debitos.filter((d) => /dgr/i.test(txt(d.concepto)) && !usados.has(d.fila))
  for (const d of dgr) {
    avisos.push(`libro-extractores-banco-obligaciones: DGR San Juan ${pesos(d.importe)} el `
      + `${isoDeSerial(d.fecha)} (f${d.fila}) — no lo emito: el IIBB lo emite «Impuestos y Financieros» `
      + 'y el cruce no lo retira porque `naturalezaEsperada` devuelve null para DGR. Lo que falta es '
      + 'enseñarle esa naturaleza al cruce, no un REAL paralelo que lo contaría dos veces.')
  }

  return { movimientos, pagosF931, avisos }
}

/**
 * LA CUOTA FUTURA DEL PRENDARIO — la fuente propia, no Compras.
 *
 * ═══ EL IMPORTE NO ESTÁ EN EL ARCHIVO DE DATOS, Y ES A PROPÓSITO ═══
 *
 * Las tres cuotas medidas de 2026 son distintas entre sí ($1.275.316,65 · $1.281.778,17 ·
 * $1.282.810,54): el préstamo ajusta. Un número fijo en el JSON se quedaría viejo sin gritar, que es
 * la trampa de todo dato tipeado. La proyección usa **el último débito real que el extracto muestra**
 * en esta misma corrida: si el banco sube la cuota, la proyección sube con él, y si el extracto no
 * llega, no hay proyección (se avisa y no se inventa).
 *
 * ═══ Y NO SE PROYECTA MÁS ALLÁ DE LA ÚLTIMA CUOTA ═══
 *
 * La 26 vence en diciembre de 2026. Proyectar enero sería cobrarle a la empresa una cuota que ya
 * terminó de pagar — el error simétrico del que este módulo vino a arreglar.
 *
 * @param {{debitos:Array, plan:object, corte:number|null, compras:Array<Array>}} e
 * @returns {{movimientos:Array, avisos:string[]}}
 */
export function dePrendarioFuturo({ debitos = [], plan = null, compras = [] } = {}) {
  const avisos = []
  if (!plan?.dia_de_debito || !plan?.ultima_cuota?.periodo) {
    avisos.push('libro-extractores-banco-obligaciones: sin `datos/prestamo-prendario.json` no proyecto '
      + 'ninguna cuota: el cronograma no se adivina.')
    return { movimientos: [], avisos }
  }
  const reales = debitos.filter((d) => txt(d.naturaleza) === NAT.prendario).sort((a, b) => a.fecha - b.fecha)
  const ultimo = reales[reales.length - 1] ?? null
  if (!ultimo) {
    avisos.push('libro-extractores-banco-obligaciones: el extracto no muestra ningún débito de '
      + '«Préstamo prendario», así que no sé cuánto vale la cuota de hoy. NO proyecto: un importe '
      + 'inventado en la línea Financiero es peor que una línea vacía que el control de cobertura grita.')
    return { movimientos: [], avisos }
  }
  const obligaciones = obligacionesDeCompras(compras, [RUBRO_FINANCIERO])
  const [anioFin, mesFin] = plan.ultima_cuota.periodo.split('-').map(Number)
  const movimientos = []
  // Se arranca en el mes SIGUIENTE al último débito real: ese mes ya está pagado y emitirlo otra vez
  // como proyectado es el defecto histórico de la proyección de jornales (contar dos veces el mismo mes).
  let anio = Number(isoDeSerial(ultimo.fecha).slice(0, 4))
  let mes = Number(isoDeSerial(ultimo.fecha).slice(5, 7)) + 1
  if (mes > 12) { mes = 1; anio += 1 }
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    const fecha = serialDe(anio, mes, plan.dia_de_debito)
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`
    const ya = obligaciones.find((o) => o.rubro === RUBRO_FINANCIERO
      && !o.pagada && mesDeSerial(o.fecha) === periodo)
    if (ya) {
      avisos.push(`libro-extractores-banco-obligaciones: la cuota del prendario de ${periodo} ya está `
        + `pendiente en Compras f${ya.fila} (${pesos(ya.total)}) — no la proyecto.`)
    } else {
      movimientos.push(movimiento({
        fecha,
        signo: SALE,
        importe: ultimo.importe,
        concepto: `Cuota préstamo prendario · ${periodo}`,
        contraparte: plan.contraparte ?? 'Banco Santander · préstamo prendario',
        rubro: RUBRO_FINANCIERO,
        // PROYECTADO, nunca COMPROMETIDO: la cuota futura es cierta en su existencia y estimada en su
        // importe. Llamarla comprometida afirmaría que su monto ya está determinado, y no lo está.
        estado: 'PROYECTADO',
        instrumento: 'debito',
        actividad: 'financiacion',
        // La identidad es el PERÍODO, no una fila: las doce cuotas salen del mismo archivo de datos y
        // con `origen.fila` fijo la clave de dedupe las colapsaría en una sola.
        origen: { pestana: PESTANA_PRENDARIO, fila: periodo },
      }))
    }
    mes += 1
    if (mes > 12) { mes = 1; anio += 1 }
  }
  if (movimientos.length) {
    avisos.push(`libro-extractores-banco-obligaciones: ${movimientos.length} cuota(s) del prendario `
      + `proyectada(s) a ${pesos(ultimo.importe)} — el último débito real (${isoDeSerial(ultimo.fecha)}). `
      + 'El importe sigue al banco en cada corrida; no hay ningún número tipeado.')
  }
  return { movimientos, avisos }
}
