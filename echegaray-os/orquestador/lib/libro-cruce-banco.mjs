// EL EXTRACTO COMO TESTIGO DE TODO EL LIBRO — no sólo de la nómina.
//
// ═══ EL DEFECTO (17/08/2026, el dueño textual) ═══
//
// *"«deuda atrasada y del mes» estando a 17 de agosto, no puede ser ese el monto, tenés q revisar
// todas las pestañas y todos los conceptos para ver si están pagados"*.
//
// CAJA publicaba `DEUDA ATRASADA Y DEL MES = $84.348.269` — 25 filas de `_MOVIMIENTOS` con estado
// COMPROMETIDO/VENCIDO y vencimiento hasta el 31/08. Dos de esas filas el banco ya las había pagado:
//
//   · `F931 · nómina de jul-26`, $7.074.772, vencía el 10/08. El extracto tiene UN pago de servicios
//     AFIP en todo agosto: **$8.235.741,96 el 11/08** (`_BANCO_RAW` f373). El patrón se repite todos
//     los meses (08/06 $8.974.572 · 20/07 $4.859.763).
//   · `Banco` (rubro Financiero), $1.282.811, vencía el 07/08. El extracto tiene un débito de
//     naturaleza "Préstamo prendario" de **$1.281.778,17 el 07/08** (f366) — el mismo día.
//
// La causa raíz es una sola y se ve en `libro-movimientos-pestana.mjs`: el objeto `extracto`
// (débitos + corte + usados) se le pasaba ÚNICAMENTE a los tres extractores de nómina. Las cargas
// sociales, los impuestos y el financiero decidían "pagado" sólo por lo que dijera su pestaña de
// origen — y cuando nadie marcó la pestaña, la plata figura debiéndose aunque el banco la haya
// pagado once días antes. Un dato que falta se convertía otra vez en un HECHO económico.
//
// ═══ POR QUÉ UNA PASADA SOBRE EL LIBRO Y NO SIETE EXTRACTORES TOCADOS ═══
//
// La alternativa era pasarle `extracto` a cada extractor, como ya hace la nómina. Se descartó: son
// siete puertas, cada una con su propia idea de qué prueba un débito, y ése es exactamente el
// defecto que este repo ya pagó — dos modelos de la misma realidad. Acá el cruce corre UNA vez,
// sobre el libro ya armado y deduplicado, igual que `chequesCubiertosPorBanco`. Un solo lugar
// decide, un solo lugar se audita.
//
// ═══ LO QUE ESTE MÓDULO NO TOCA, Y ES DELIBERADO ═══
//
// Los jornales (`jornales-testigos.mjs`), los cheques emitidos (`chequesCubiertosPorBanco`) y la
// tarjeta (`cubiertaPorResumen`) YA tienen su cruce, con reglas propias que conocen su fuente. Este
// módulo los marca `OTRO_DUENO` y no los mira: cruzarlos dos veces con criterios distintos haría que
// el mismo débito pague dos obligaciones, que es la forma exacta en que se pierde plata.
//
// NÚCLEO PURO. No lee Google, no escribe, no toca la base.

import { NAT } from './banco-santander.mjs'
import { combinacionUnica } from './jornales-testigos.mjs'
import { isoDeSerial } from './libro-extractores-fechas.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
const centavos = (v) => Math.round(v * 100)
const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

/**
 * CUÁNTOS DÍAS ALREDEDOR DEL VENCIMIENTO SE ACEPTA UN DÉBITO COMO EL PAGO DE ESTA OBLIGACIÓN.
 *
 * DIEZ, y el número no es una preferencia: **tiene que ser menor que medio mes**. Todas las
 * obligaciones que este módulo cruza son mensuales (el F931, la cuota del prendario, el IVA), así
 * que con una holgura de 15 días o más el pago de un mes alcanzaría al vencimiento del mes
 * siguiente y el módulo podría cancelar la obligación equivocada sin dar un solo error. Con 10, dos
 * vencimientos consecutivos (~30 días) no se tocan.
 *
 * Medido sobre el extracto vivo: el F931 vencía el 10/08 y se debitó el 11/08 (+1); el prendario
 * vencía el 07/08 y se debitó el 07/08 (0).
 */
export const HOLGURA_MENSUAL = 10

/** Cómo se prueba que un débito pagó una obligación. Cada naturaleza declara el suyo — ninguna se
 *  empareja "como salga". */
export const MODO = Object.freeze({
  /** Un subconjunto de los débitos del día suma EXACTO el importe, y es el único que lo hace. */
  exacto: 'EXACTO',
  /** El organismo cobra en BLOQUE: un débito contiene todas las obligaciones de su naturaleza que ya
   *  vencían cuando se debitó. Es la regla que `cubiertaPorResumen` ya aplica a la tarjeta. */
  agregado: 'AGREGADO',
  /** Una cuota recurrente: un solo débito y una sola obligación, el MISMO día. */
  cuota: 'CUOTA',
})

/**
 * EL MODO DE CADA NATURALEZA, DECLARADO.
 *
 * ═══ POR QUÉ AFIP ES "AGREGADO" Y NO "EXACTO" ═══
 *
 * Porque el importe NO da exacto y no puede darlo: la obligación del libro ($7.074.772) es la
 * PROYECCIÓN que calcula la cadena de `Cargas Sociales`, y el débito ($8.235.741,96) es lo que
 * ARCA cobró de verdad — un pago a ARCA agrupa conceptos que la cadena no proyecta. Exigir suma
 * exacta contra una proyección es exigir que la proyección haya acertado al centavo, que es
 * justamente lo que una proyección no hace.
 *
 * **Lo que este módulo afirma NO es la composición del VEP** —eso no se puede saber sin el detalle
 * del pago, y fabricarlo estaría prohibido— sino algo más débil y verificable: *el banco pagó a ARCA
 * más de lo que el libro dice que se le debía, así que esta obligación no puede seguir publicándose
 * como "falta pagar"*. El excedente que ninguna obligación explica se REPORTA (ver `sobrantes`), que
 * es donde aparece el concepto que falta cargar.
 *
 * ═══ POR QUÉ EL PRENDARIO ES "CUOTA" ═══
 *
 * Un préstamo prendario no se cobra en bloque: es una cuota, un acreedor, una fecha. El débito
 * ($1.281.778,17) es $1.033 MENOR que la cuota proyectada, así que la regla de "el pago la contiene"
 * ni siquiera aplicaría. Lo que sí es verificable es que hay UNA obligación y UN débito de esa
 * naturaleza el MISMO día: no es "el que más se parece", es el único de cada lado.
 */
export const MODO_DE_NATURALEZA = Object.freeze({
  [NAT.afip]: MODO.agregado,
  [NAT.prendario]: MODO.cuota,
  [NAT.transferencias]: MODO.exacto,
  [NAT.debitosAuto]: MODO.exacto,
})

/**
 * LAS NATURALEZAS QUE YA TIENEN SU PROPIO CRUCE. Este módulo no las toca y dice por qué.
 *
 * No es una exclusión por comodidad: cada una de estas fuentes sabe algo que el libro ya no tiene
 * (la columna "Banco" de la quincena, el número del cheque, el ciclo del resumen). Un segundo cruce
 * con menos información no mejora nada y puede reclamar un débito que el primero ya usó.
 */
export const OTRO_DUENO = Object.freeze({
  [NAT.sueldos]: 'la nómina la cruza jornales-testigos.mjs contra la columna «Banco» de la quincena',
  [NAT.cheques]: 'los cheques los cruza chequesCubiertosPorBanco por importe exacto y conteo',
  [NAT.tarjeta]: 'la tarjeta la cruza cubiertaPorResumen contra el débito del resumen',
})

/** Los veredictos. Cada uno dice QUIÉN habló — nunca "no sé" sin nombre. */
export const VEREDICTO_CRUCE = Object.freeze({
  banco: 'BANCO',                     // el extracto lo prueba: la obligación ya salió de la cuenta
  contradice: 'CONTRADICE',           // hay movimiento del banco en esa naturaleza y no lo explica
  sinTestigo: 'SIN_TESTIGO',          // el banco no muestra nada de esa naturaleza en la ventana
  futuro: 'FUTURO',                   // todavía no vence: no hay nada que probar
  fueraDeVentana: 'FUERA_DE_VENTANA', // el extracto no llega a esa fecha
  sinNaturaleza: 'SIN_NATURALEZA',    // ningún débito del banco puede ser la contraparte de esto
  otroDueno: 'OTRO_CRUCE',            // ya lo prueba otro módulo (ver OTRO_DUENO)
})

/** Los que hay que GRITAR: el banco y la pestaña dicen cosas distintas, o falta un testigo que
 *  debería estar. `SIN_NATURALEZA` y `OTRO_CRUCE` no gritan: son decisiones, no problemas. */
export const GRITAN_CRUCE = Object.freeze([VEREDICTO_CRUCE.contradice, VEREDICTO_CRUCE.sinTestigo])

/**
 * NÚCLEO PURO: qué naturaleza del extracto tendría que respaldar a este movimiento.
 *
 * El mapa va del RUBRO del libro (taxonomía única de `rubro-caja.mjs`) a la naturaleza que escribe
 * el importador (`banco-santander.mjs`), que es la MISMA correspondencia que
 * `COBERTURA_NATURALEZA` ya declara en sentido inverso. Un test verifica que toda naturaleza que se
 * usa acá exista en `NAT`: el rótulo es un contrato, y un filtro que no encuentra filas devuelve
 * cero sin dar un error.
 *
 * DEVOLVER `null` ES UNA RESPUESTA, NO UNA FALLA. Dos casos reales medidos el 17/08:
 *   · `Nómina · Gremiales` — los cobran FCL, UOCRA, IERIC y FODECO por transferencia, NO ARCA.
 *     Mandarlos a AFIP haría que el VEP de ARCA "pagara" $1.632.798 de obligación sindical.
 *   · `Impuestos` con contraparte DGR San Juan — el IIBB provincial entra al extracto como "Compra
 *     con tarjeta de débito - Dgr san juan" (f361), que es otra naturaleza y otro importe.
 * Los dos quedan `SIN_NATURALEZA`: visibles, nombrados, y sin emparejar.
 */
export function naturalezaEsperada({ rubro, contraparte, instrumento } = {}) {
  const r = txt(rubro)
  const c = txt(contraparte).toLowerCase()
  // El instrumento manda sobre el rubro: una compra pagada con cheque la prueba el cruce de cheques,
  // sea cual sea el rubro de su factura.
  if (/^(cheque|echeq)$/.test(txt(instrumento))) return NAT.cheques
  if (txt(instrumento) === 'tarjeta') return NAT.tarjeta
  if (r === 'Nómina · Jornales de obra' || r === 'Nómina · Sueldos administración') return NAT.sueldos
  if (r === 'Cheques emitidos') return NAT.cheques
  // ARCA es la única contraparte que se paga como AFIP. El rubro solo no alcanza: "Impuestos" tiene
  // adentro el IVA (ARCA) y el IIBB (DGR San Juan), y son dos organismos distintos.
  if (r === 'Nómina · Cargas sociales' || r === 'Impuestos') return c === 'arca' ? NAT.afip : null
  if (r === 'Financiero') return /banco|prendario|credito prendario/.test(c) ? NAT.prendario : null
  return null
}

/** ¿Este movimiento es una obligación que el extracto podría probar? Egreso, y todavía no probado. */
const esCandidato = (m) => m?.signo === -1 && m?.estado !== 'REAL'

/**
 * NÚCLEO PURO: el veredicto que no depende de ningún débito — el que sale de la fecha sola.
 *
 * Se resuelve ANTES de buscar respaldo porque cambia el significado del "no encontré nada": sobre un
 * vencimiento futuro, o anterior al extracto, la ausencia de un débito no prueba absolutamente nada,
 * y publicarlo como deuda sin probar sería inventar en la otra dirección.
 */
function porLaFechaSola(fecha, { corte, desdeExtracto, holgura }) {
  if (Number.isFinite(corte) && fecha - holgura > corte) {
    return { veredicto: VEREDICTO_CRUCE.futuro, motivo: 'todavía no vence: no hay nada que probar' }
  }
  if (Number.isFinite(desdeExtracto) && fecha + holgura < desdeExtracto) {
    return {
      veredicto: VEREDICTO_CRUCE.fueraDeVentana,
      motivo: `el extracto empieza el ${isoDeSerial(desdeExtracto)}: sobre esta fecha no puede opinar`,
    }
  }
  return null
}

/**
 * NÚCLEO PURO: EL PAGO AGREGADO — un débito contiene todo lo de su naturaleza que ya vencía.
 *
 * ES LA MITAD CONSERVADORA LA QUE IMPORTA: si la suma de las obligaciones EXCEDE al débito, no se
 * cubre NINGUNA. Con dos F931 pendientes y un pago que alcanza para uno, no hay forma de saber cuál
 * pagó — y elegir "el más viejo" sería inventar un criterio para no quedarse sin respuesta. Decir
 * "pagado" de más es el error que rompe una tesorería.
 */
function emparejarAgregado(grupo, debitos, ctx, salida) {
  for (const d of debitos) {
    const alcanza = grupo.filter((c) => !salida.veredictos.has(c.i)
      && c.m.fecha <= d.fecha && c.m.fecha >= d.fecha - ctx.holgura)
    if (!alcanza.length) continue
    const suma = alcanza.reduce((a, c) => a + c.m.importe, 0)
    if (centavos(suma) > centavos(d.importe)) {
      salida.avisos.push(`libro-cruce-banco: el débito de ${pesos(d.importe)} (${d.naturaleza}, `
        + `${isoDeSerial(d.fecha)}) NO alcanza para las ${alcanza.length} obligación(es) de ${pesos(suma)} `
        + 'que vencían — no sé cuál pagó, no cubro ninguna.')
      for (const c of alcanza) {
        salida.veredictos.set(c.i, veredicto(VEREDICTO_CRUCE.contradice, {
          motivo: `el banco pagó ${pesos(d.importe)} de ${d.naturaleza} el ${isoDeSerial(d.fecha)} y no `
            + `alcanza para las ${alcanza.length} obligaciones de esa naturaleza (${pesos(suma)})`,
        }))
      }
      continue
    }
    ctx.usados.add(d.fila)
    for (const c of alcanza) {
      salida.veredictos.set(c.i, veredicto(VEREDICTO_CRUCE.banco, {
        fecha: d.fecha, cubierto: c.m.importe, filas: [d.fila],
        motivo: `pago agregado de ${pesos(d.importe)} a ${d.naturaleza} el ${isoDeSerial(d.fecha)}: `
          + 'contiene esta obligación, que ya vencía',
      }))
    }
    const sobrante = Math.round((d.importe - suma) * 100) / 100
    if (sobrante > 0) salida.sobrantes.push({ fila: d.fila, fecha: d.fecha, naturaleza: d.naturaleza, sobrante })
  }
}

/**
 * NÚCLEO PURO: LA CUOTA — uno de cada lado, el MISMO día.
 *
 * La fecha tiene que ser IDÉNTICA, no "cerca": con una ventana, la cuota de un mes podría explicar
 * la del otro. Y con dos obligaciones el mismo día no hay 1:1 y no se empareja ninguna.
 *
 * SE CIERRA POR EL IMPORTE DEL BANCO, NO POR EL DE LA PLANILLA. La cuota de Compras es una previsión
 * ($1.282.811) y el débito es el hecho ($1.281.778,17): entre los dos manda el hecho, y la
 * diferencia de $1.033 es la previsión corrigiéndose, no plata que quede debiéndose.
 */
function emparejarCuota(grupo, debitos, ctx, salida) {
  for (const d of debitos) {
    const mismoDia = grupo.filter((c) => !salida.veredictos.has(c.i) && c.m.fecha === d.fecha)
    if (!mismoDia.length) continue
    const otrosDebitos = debitos.filter((x) => x.fecha === d.fecha && !ctx.usados.has(x.fila))
    if (mismoDia.length > 1 || otrosDebitos.length > 1) {
      const motivo = `${otrosDebitos.length} débito(s) de ${d.naturaleza} y ${mismoDia.length} obligación(es) `
        + `el ${isoDeSerial(d.fecha)}: no hay uno de cada lado y no empareje`
      salida.avisos.push(`libro-cruce-banco: ${motivo}`)
      for (const c of mismoDia) salida.veredictos.set(c.i, veredicto(VEREDICTO_CRUCE.contradice, { motivo }))
      continue
    }
    const c = mismoDia[0]
    ctx.usados.add(d.fila)
    salida.veredictos.set(c.i, veredicto(VEREDICTO_CRUCE.banco, {
      fecha: d.fecha, cubierto: d.importe, filas: [d.fila],
      motivo: `única cuota de ${d.naturaleza} el ${isoDeSerial(d.fecha)} y único débito: ${pesos(d.importe)}`,
    }))
    const dif = Math.round((c.m.importe - d.importe) * 100) / 100
    if (dif !== 0) {
      salida.avisos.push(`libro-cruce-banco: «${c.m.concepto}» estaba previsto en ${pesos(c.m.importe)} y el `
        + `banco debitó ${pesos(d.importe)} el ${isoDeSerial(d.fecha)} (${pesos(Math.abs(dif))} de `
        + `${dif > 0 ? 'menos' : 'más'}). Manda el banco.`)
    }
  }
}

/**
 * NÚCLEO PURO: EL EXACTO — un subconjunto de los débitos del día suma el importe, y es el único.
 *
 * Reusa `combinacionUnica` de `jornales-testigos.mjs`, que ya cuenta por MULTICONJUNTO de importes
 * (catorce débitos de $260.000 dan UNA forma de armar $3.640.000, no 3.003) y devuelve `unica:false`
 * cuando hay más de una. Escribir un segundo emparejador exacto sería tener dos modelos de la misma
 * realidad, que es el defecto que este repo ya pagó.
 */
function emparejarExacto(grupo, debitos, ctx, salida) {
  const porDia = new Map()
  for (const d of debitos) {
    if (!porDia.has(d.fecha)) porDia.set(d.fecha, [])
    porDia.get(d.fecha).push(d)
  }
  for (const c of grupo) {
    if (salida.veredictos.has(c.i)) continue
    const hits = []
    for (const [fecha, ds] of porDia) {
      if (Math.abs(fecha - c.m.fecha) > ctx.holgura) continue
      const libres = ds.filter((d) => !ctx.usados.has(d.fila))
      const u = combinacionUnica(libres.map((d) => d.importe), c.m.importe)
      if (u.unica) hits.push({ fecha, filas: u.indices.map((k) => libres[k].fila), motivo: u.motivo })
    }
    if (hits.length !== 1) continue
    for (const f of hits[0].filas) ctx.usados.add(f)
    salida.veredictos.set(c.i, veredicto(VEREDICTO_CRUCE.banco, {
      fecha: hits[0].fecha, cubierto: c.m.importe, filas: hits[0].filas,
      motivo: `${hits[0].filas.length} débito(s) suman exacto el ${isoDeSerial(hits[0].fecha)}`,
    }))
  }
}

const veredicto = (v, extra = {}) => ({ veredicto: v, fecha: null, cubierto: 0, filas: [], motivo: '', ...extra })

const EMPAREJADOR = { [MODO.agregado]: emparejarAgregado, [MODO.cuota]: emparejarCuota, [MODO.exacto]: emparejarExacto }

/**
 * NÚCLEO PURO: el veredicto de CADA obligación del libro, cruzada contra el extracto.
 *
 * @param {Array} movimientos el libro ya armado y deduplicado (se lee, no se muta)
 * @param {Array<{fecha:number, importe:number, naturaleza:string, fila:number}>} debitos de
 *        `debitosDelExtracto` — importe en MAGNITUD positiva
 * @param {{corte:number, usados?:Set<number>, desdeExtracto?:number, holgura?:number}} ctx `usados`
 *        son las filas de `_BANCO_RAW` ya reclamadas por otro cruce: un débito respalda a UNO solo.
 * @returns {{veredictos:Map<number,object>, avisos:string[], sobrantes:Array}} índice del movimiento
 *          en `movimientos` → su veredicto
 */
export function cruzarLibroContraBanco(movimientos = [], debitos = [], ctxEntrada = {}) {
  const ctx = {
    corte: num(ctxEntrada.corte),
    desdeExtracto: num(ctxEntrada.desdeExtracto),
    holgura: num(ctxEntrada.holgura) ?? HOLGURA_MENSUAL,
    usados: ctxEntrada.usados ?? new Set(),
  }
  const salida = { veredictos: new Map(), avisos: [], sobrantes: [] }
  const porNaturaleza = new Map()

  movimientos.forEach((m, i) => {
    if (!esCandidato(m)) return
    const nat = naturalezaEsperada(m)
    if (OTRO_DUENO[nat]) {
      salida.veredictos.set(i, veredicto(VEREDICTO_CRUCE.otroDueno, { motivo: OTRO_DUENO[nat] }))
      return
    }
    if (!nat || !MODO_DE_NATURALEZA[nat]) {
      salida.veredictos.set(i, veredicto(VEREDICTO_CRUCE.sinNaturaleza, {
        motivo: `ningún movimiento del banco es la contraparte natural de «${m.rubro}»`,
      }))
      return
    }
    const porFecha = porLaFechaSola(m.fecha, ctx)
    if (porFecha) { salida.veredictos.set(i, veredicto(porFecha.veredicto, { motivo: porFecha.motivo })); return }
    if (!porNaturaleza.has(nat)) porNaturaleza.set(nat, [])
    porNaturaleza.get(nat).push({ i, m })
  })

  for (const [nat, grupo] of porNaturaleza) {
    const suyos = debitos
      .filter((d) => d.naturaleza === nat && !ctx.usados.has(d.fila))
      .sort((a, b) => a.fecha - b.fecha)
    EMPAREJADOR[MODO_DE_NATURALEZA[nat]](grupo, suyos, ctx, salida)
    // LO QUE QUEDÓ SIN EMPAREJAR NO ES "IMPAGO": es que ninguna fuente lo probó, y se dice así.
    for (const c of grupo) {
      if (salida.veredictos.has(c.i)) continue
      salida.veredictos.set(c.i, veredicto(VEREDICTO_CRUCE.sinTestigo, {
        motivo: suyos.length
          ? `hay ${suyos.length} débito(s) de ${nat} en el extracto y ninguno explica esta obligación`
          : `el extracto no tiene ningún débito de ${nat} en la ventana`,
      }))
    }
  }
  return salida
}

/**
 * NÚCLEO PURO: los movimientos que el cruce prueba pagados, listos para reemplazar a los suyos.
 *
 * Se devuelve una LISTA NUEVA y no se muta el libro: `movimiento()` congela cada fila a propósito, y
 * una mutación en el medio de la pasada haría que el emparejamiento vea un libro distinto del que
 * empezó a recorrer.
 *
 * EL IMPORTE PASA A SER EL DEL BANCO. Es la misma regla que ya aplica la nómina: entre la previsión
 * de la planilla y el débito del extracto, manda el débito.
 */
export function aplicarCruce(movimientos = [], { veredictos } = { veredictos: new Map() }) {
  return movimientos.map((m, i) => {
    const v = veredictos.get(i)
    if (!v || v.veredicto !== VEREDICTO_CRUCE.banco || !v.cubierto) return m
    return Object.freeze({
      ...m,
      fecha: v.fecha,
      importe: v.cubierto,
      estado: 'REAL',
      concepto: `${m.concepto} · ${v.motivo}`,
    })
  })
}
