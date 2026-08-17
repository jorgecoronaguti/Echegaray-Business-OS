// LOS EXTRACTORES DEL LIBRO CANÓNICO — de cada pestaña de origen, a Movimiento[].
//
// ═══ EL CONTRATO ═══
//
// Núcleo PURO: cada extractor recibe las filas YA LEÍDAS de su pestaña (con UNFORMATTED_VALUE, que es
// la única lectura donde una fecha es un número y un importe no es un string) y devuelve movimientos.
// No lee Google, no escribe, no toca la base. El que orquesta las lecturas es el script de la pestaña
// `_MOVIMIENTOS`; acá vive la lógica, que es lo que se prueba en frío.
//
// ═══ POR QUÉ LAS COLUMNAS SE RESUELVEN POR ENCABEZADO ═══
//
// Una columna fija ya rompió en silencio (memoria del proyecto: "ubicarCaja() por rótulo — columna
// fija rompía en silencio"). Cada extractor recibe el encabezado y resuelve por nombre, con
// `resolverColumnas`, la misma función que ya usa todo el repo. Si un rótulo no está, el extractor
// FALLA CERRADO nombrándolo — una fila de origen que se lee corrida un lugar produce movimientos
// plausibles y equivocados, que es el peor resultado posible.
//
// ═══ QUÉ FUENTE CUBRE CADA UNO, Y POR QUÉ ESA PUERTA ═══
//
// · Compras           → los PAGOS (reales y proyectados) y su estado. Es el registro maestro del
//                       egreso con factura; los rubros salen de su columna "Rubro de caja" (AC), que
//                       escribe rubro-caja-sheet.mjs con la taxonomía única.
// · Cobranzas         → los COBROS: cobrado (real) y esperado (proyectado), con la fecha que manda.
// · Cheques Emitidos  → el COMPROMETIDO SIN FACTURA: firmado y entregado, no debitado, y que Compras
//                       no tiene. El que sí está en Compras entra por ahí (con su cheque como
//                       instrumento) y el debitado no entra por ningún lado — ya está en el saldo.
// · Tarjeta de Credito→ lo mismo para la cuota de tarjeta sin factura cargada.
// · Jornales/Oficina/ → la nómina, desde la planilla y NO desde Compras. Vive en
//   Dirección            libro-extractores-nomina.mjs, con el por qué medido en pesos.
// · Impuestos y       → el IVA y el IIBB a pagar, que no están en Compras: los calcula esa pestaña y
//   Financieros          el libro los LEE, con el vencimiento a fin de mes + 20 días.
// · _CHEQUES_RAW      → la CARTERA: los valores de terceros que todavía no son caja. Es lo único que
//                       ENTRA además de Cobranzas.
// · _BANCO_RAW        → NO emite movimientos de caja. Es deliberado y es la regla que más plata
//                       cuidó: el saldo del banco YA CONTIENE sus movimientos. El banco entra al
//                       libro sólo como (a) verificación de estado —un cheque debitado, un pago que
//                       pasó a real— y (b) los cargos sin factura (comisiones, impuesto al cheque)
//                       que ninguna otra pestaña registra. Duplicar el resto inventó $9,9M una vez.
//
// ═══ QUÉ FUENTES SABEN DE QUÉ CLIENTE ES CADA MOVIMIENTO (06/08/2026) ═══
//
// Sólo TRES: Compras (columna J, "Cliente / Asignación"), Cobranzas (G, "Obra / Cliente") y
// `_CHEQUES_RAW` (K, "Obra"). Las demás NO lo saben y no se les inventa:
//
// · Cheques Emitidos tiene "Unidad de Negocio", que dice Civil (101 filas) o Mantenimiento (4) — es
//   la línea de negocio, no el cliente. Mapearla sería fabricar una asignación que nadie hizo.
// · Tarjeta, banco, IVA/IIBB y la nómina son gasto de estructura o de empresa: no tienen cliente
//   porque no lo tienen, y forzarlos a uno repartiría a mano un costo indirecto.
//
// Todo lo que queda sin cliente cae en el residuo VISIBLE de la vista ("Otros y sin asignar"), que se
// despeja por diferencia contra el subtotal. Son $179,3M reales y $187,9M proyectados medidos el
// 06/08: es la cifra más grande del bloque, y esconderla sería el peor resultado de todos.

import { movimiento, ENTRA, SALE, estadoContraCorte } from './libro-movimientos.mjs'
import { clienteCanonico } from './libro-clientes.mjs'
import { instrumentoDePago, estadoDeEgreso } from './caja-canales.mjs'
import { rubroDeCaja, SIN_CLASIFICAR } from './rubro-caja.mjs'
import { columnasObligatorias } from './compras-columnas.mjs'
// EL LADO "COMPRAS" COMO FUENTE vive aparte desde el 06/08: sus rótulos los leen DOS consumidores
// (este extractor y el cruce cheque↔factura) y tipearlos dos veces deja a uno leyendo índices viejos.
import { columnasDeCompras, estaPagada, esFacturaCargada, pendienteDeCompra, cuotasEnCheque, fechaDeCajaDeCompra } from './libro-extractores-compras.mjs'
import { INSTRUMENTOS, colMesDelAnio } from './cash-flow-lineas.mjs'
import { cubiertaPorResumen } from './libro-respaldo-banco.mjs'
// El default de `deChequesEmitidos` era un 20 escrito a mano y el registro se movió a la 27. El
// llamador real (libro-movimientos-pestana) pasa el ancla viva; el default es para todos los demás.
import { FILA_DATO0 as FILA_DATO0_CHEQUES } from './cheques-emitidos-geometria.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
import { mismaMarca } from './glifos.mjs'
import { EN_CARTERA } from './cartera-cheques.mjs'
import { vencimientoIva, vencimientoIibb, serialDe } from './vencimientos-fiscales.mjs'
import { COL as COL_RAW, FILA0 as FILA0_RAW, PESTAÑA as PESTANA_RAW } from '../scripts/cheques-raw-pestana.mjs'
import { RUBRO_JORNALES, RUBRO_ADMINISTRACION } from './libro-extractores-nomina.mjs'
import { cubiertaPorLaCadena } from './libro-extractores-cargas.mjs'

export { deJornalesQuincenas, deOficina, deDireccion } from './libro-extractores-nomina.mjs'
// LA CADENA DE CARGAS SOCIALES, con su precedencia contra Compras. Vive aparte por el mismo motivo
// que la nómina: es una fuente con reglas propias, y el que la lee tiene que poder probarla en frío.
export {
  deCargasSociales, mesesCubiertos, cargasEnCompras, reemplazadasPorLaCadena, NOMBRES_CARGAS,
} from './libro-extractores-cargas.mjs'
// Se re-exportan para no romper a quien ya los importaba de acá; su casa es el módulo de Compras.
export { pendienteDeCompra, comprasPagadasConCheque, NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'
// Ídem Cobranzas: se mudó el 06/08 porque este archivo tocaba el techo de 500 líneas y el extractor
// que crecía era ése (ahora cruza contra `_CHEQUES_RAW` para ver los valores endosados).
export { deCobranzas } from './libro-extractores-cobranzas.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
/** Letra de columna → índice 0-based. 'A'→0, 'BB'→53. Las coordenadas del archivo son letras. */
export const indiceDeColumna = (letra) => String(letra).toUpperCase().split('')
  .reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/**
 * COMPRAS → movimientos de egreso.
 *
 * El estado sale de "Estado pago": Pagado = REAL (con su fecha real de pago), lo demás = PROYECTADO
 * contra la fecha estimada — y `estadoContraCorte` lo convierte en VENCIDO si la fecha ya pasó.
 *
 * ═══ LA COMPRA PAGADA CON CHEQUE SÍ ENTRA POR ACÁ (05/08) ═══
 *
 * Hasta hoy se salteaba, razonando que la emitía "Cheques Emitidos" como COMPROMETIDO. Era falso de
 * los dos lados y dejaba un agujero: el calendario de CAJA suma Compras entera con un SUMIFS por rubro
 * y fecha, SIN mirar el tipo de pago, y del lado de los cheques suma únicamente los marcados "⚠ FALTA
 * cargar la factura" (`formulaChequesSinFactura`, que existe porque sumar los cheques enteros contaba
 * $43.380.472 dos veces). O sea: la factura pagada con cheque la cuenta Compras, y el cheque sin
 * factura lo cuenta su pestaña. Las dos puertas son COMPLEMENTARIAS por la marca, no por el tipo de
 * pago — y salteando acá, esa plata no estaba en el libro por ninguna de las dos.
 *
 * NO SE LE PONE `numeroCheque` a propósito: la clave de esta fila es (CUIT, comprobante, signo) y la
 * del cheque sin factura es (instrumento, número, signo). Son universos disjuntos y no colisionan.
 *
 * ═══ UNA COMPRA A MEDIO PAGAR DEBE POR EL SALDO, NO POR EL TOTAL (06/08) ═══
 *
 * Compras lleva "Total o Parcial", "Monto Pagado" y "Monto Parcial 1" (el saldo, en negativo). El
 * extractor leía sólo "Total", así que una factura de $2.300.000 con $1.000.000 ya entregado entraba
 * al libro por los $2.300.000 enteros — y de ahí a CAJA COMPROMETIDA, que decía que había que cubrir
 * plata que ya había salido. Medido en vivo: dos filas abiertas (Gerson Castro, PEDRO TELLO) inflaban
 * la tarjeta en $1.300.000. La parte pagada no aparece por ningún lado como REAL, así que no es que
 * estuviera contada dos veces: estaba contada UNA vez y del lado equivocado.
 *
 * SÓLO SOBRE LA FILA ABIERTA. Si la fila está "Pagado", el instrumento se entregó por el total y el
 * saldo es cero por construcción: restar ahí borraría el movimiento y volvería a abrir el agujero de
 * la compra pagada con cheque que todavía no debitó (ver el bloque de arriba).
 *
 * @param {Array<Array>} filas todas las filas de Compras (fila 1 = título), UNFORMATTED_VALUE
 * @param {number} corte serial de hoy/corte para vencidos
 * ═══ LA CADENA DE CARGAS SOCIALES LE GANA A LA FILA PLANA (06/08) ═══
 *
 * Mismo problema que la nómina y misma cura, con una diferencia: acá la precedencia es CONDICIONAL.
 * Las cargas del mes se proyectan en "Cargas Sociales" desde los jornales —medido: $8.569.345 en
 * agosto contra los $8.000.000 redondos tipeados en Compras— así que para los meses que esa cadena
 * cubre, la fila plana no entra. Pero si la cadena no publica sus rangos con nombre, `cargasCubiertas`
 * llega vacío y Compras vuelve a entrar ENTERO: un rango con nombre falla devolviendo vacío, y ese
 * modo de falla no puede significar "borrá la proyección de cargas del cash flow". Las filas PAGADAS
 * entran siempre — una salida real no se descarta nunca. Ver `libro-extractores-cargas.mjs`.
 *
 * @param {{aviso?:(m:string)=>void, cargasCubiertas?:Set<string>}} [opciones] `aviso` recibe las
 *        contradicciones de la planilla; `cargasCubiertas`, los meses ('YYYY-MM') que publica la cadena
 */
export function deCompras(filas = [], corte = null, { aviso = (m) => console.warn(m), cruce = null, cargasCubiertas = null } = {}) {
  const c = columnasDeCompras(filas) // fila 3: el encabezado real (1 título, 2 agrupador)
  const out = []
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    const cargada = num(f[c.fechaCaja])
    if (importe === null || cargada === null) continue // sin importe o sin fecha de caja no hay movimiento
    // Se tolera decoración alrededor de la palabra ("✅ Pagado"): se compara sólo lo alfabético.
    const pagado = estaPagada(f[c.estado])
    const tipo = txt(f[c.tipoPago]).toLowerCase()
    const rubro = txt(f[c.rubro])
    // UNA CUOTA DE PLAN DE ARCA CARGADA EN FIN DE SEMANA SE DEBITA EL DÍA HÁBIL DEL CALENDARIO DEL
    // ORGANISMO. Se corrige acá, al leer, y nunca en Compras: la carga del dueño no se toca.
    const fecha = fechaDeCajaDeCompra({ serial: cargada, rubro, pagado },
      (m) => aviso(`libro-extractores(Compras) fila ${i + 1}: ${m}`))
    // LA NÓMINA NO SALE DE ACÁ, Y NO ES UNA PREFERENCIA: son $30,5M de jornales tipeados a mano como
    // estimación y cinco sueldos de administración cargados en Compras que la planilla ya trae. El
    // CUADRO del cash flow lo resuelve poniendo esa línea en un grupo con `signo: 0` (memo); el libro,
    // que cuenta cada movimiento UNA vez, lo resuelve no emitiéndola. Ver libro-extractores-nomina.mjs.
    if (rubro === RUBRO_JORNALES || rubro === RUBRO_ADMINISTRACION) continue
    // LA PRECEDENCIA DECLARADA, NO UN BORRADO: la fila sigue en Compras y sigue siendo la previsión
    // que alguien cargó a mano; lo que se decide acá es cuál de las dos fuentes cuenta en el libro.
    if (cubiertaPorLaCadena({ rubro, fecha, pagada: pagado }, cargasCubiertas)) continue
    const instrumento = instrumentoDePago(tipo)
    // ═══ "PAGADO CON CHEQUE" NO ES "LA PLATA SALIÓ" (06/08) ═══
    //
    // Medido en vivo: cuatro filas por $2.569.676 netos marcadas "Pagado" con echeq/cheque y fecha de
    // caja POSTERIOR al corte del extracto salían de acá como REAL. Un REAL no lo mira ninguna de las
    // tres vistas de proyección (CAJA COMPROMETIDA, CAJA PROYECTADA 30 DÍAS, la escalera) porque se
    // asume que ya está en el saldo — y no estaba: el extracto termina en el corte y el cheque no
    // debitó. Tampoco lo restaba la línea de posteriores, que mira sólo Transferencia y Débito. Esa
    // plata no existía en ninguna parte del cuadro.
    //
    // La regla vive en `caja-canales.mjs` junto con la lista de medios que SÍ pegan al banco en el
    // día, importada de la fórmula viva de CAJA — para que no puedan discrepar.
    //
    // Y LA FILA NO PAGADA TAMPOCO ES SIEMPRE UN PLAN: si tiene número de comprobante y el estado dice
    // "Pendiente", es una factura que alguien tiene que pagar. `esFacturaCargada` lo decide mirando
    // la fila —no una lista de proveedores— y de ahí sale el COMPROMETIDO en vez del PROYECTADO.
    const facturada = esFacturaCargada({ estado: f[c.estado], comprobante: f[c.comprobante] })
    const estadoBase = estadoDeEgreso({ instrumento, pagado, fecha, corte, facturada })
    const base = {
      // Una NOTA DE CRÉDITO viene con importe negativo: es plata que VUELVE. El signo del movimiento
      // se invierte y la magnitud queda positiva — la clave de dedup ya distingue nota de factura.
      signo: importe < 0 ? ENTRA : SALE,
      concepto: txt(f[c.proveedor]),
      contraparte: txt(f[c.proveedor]),
      rubro: rubro || rubroDeCaja({}) || SIN_CLASIFICAR,
      obra: txt(f[c.obra]),
      cliente: txt(f[c.cliente]),
      instrumento,
    }
    const debe = Math.abs(pendienteDeCompra({ importe, pagado, montoPagado: num(f[c.montoPagado]) },
      (m) => aviso(`libro-extractores(Compras) fila ${i + 1}: ${m}`)))
    // ═══ EL CHEQUE VIVO PARTE LA FILA EN DOS (06/08) ═══
    //
    // El cruce sólo actúa donde la fila iba a salir como REAL: es ahí donde el compromiso desaparece
    // de las tres vistas de proyección. Si ya es COMPROMETIDO o PROYECTADO, la escalera la ve igual y
    // partirla no agregaría nada — sí agregaría una diferencia de criterio entre dos casos gemelos.
    const enCheques = estadoBase === 'REAL' ? cruce?.porCompra?.get(i + 1) : null
    const enVuelo = Math.min(debe, enCheques?.vivo ?? 0)
    if (enVuelo > 0) {
      out.push(...cuotasEnCheque(base, enCheques.cuotas, corte, { fila: i + 1, comprobante: txt(f[c.comprobante]) }))
    }
    const yaSalio = Math.round((debe - enVuelo) * 100) / 100
    if (yaSalio > 0) {
      out.push({
        ...movimiento({
          ...base,
          fecha,
          importe: yaSalio,
          cuit: txt(f[c.cuit]),
          comprobante: txt(f[c.comprobante]),
          estado: estadoContraCorte(estadoBase, fecha, corte),
          origen: { pestana: 'Compras', fila: i + 1 },
        }),
        // El importe de esta fila ¿ES el saldo puro Total−Pagado? Sólo entonces la celda C puede ir
        // como fórmula viva (un parcial cargado por el dueño descuenta la COMPROMETIDA en el acto).
        // Una fila partida por cheques en vuelo lleva debe−enVuelo y NO puede ir viva: pisaría lo
        // que ya viaja en las cuotas. Ver libro-estado-vivo.mjs · celdaImporte.
        saldoVivo: enVuelo === 0,
      })
    }
  }
  return out
}

/**
 * CHEQUES EMITIDOS → el COMPROMETIDO **SIN FACTURA CARGADA**.
 *
 * Un cheque firmado y entregado salió de tus manos, no de tu cuenta: es la definición de
 * COMPROMETIDO. El ya DEBITADO no se emite —está en el saldo del banco, y restarlo otra vez fue el
 * error de los $12.188.441—. La fecha del movimiento es la FECHA DE PAGO del cheque (cuándo va a
 * golpear la cuenta), no la de emisión.
 *
 * ═══ SÓLO LOS MARCADOS "FALTA LA FACTURA", Y ESE FILTRO VALE $43.380.472 ═══
 *
 * El cheque es el INSTRUMENTO y la factura es la OBLIGACIÓN. Si la factura está en Compras, esa plata
 * ya viaja por la puerta de Compras: emitir además el cheque la contaría dos veces —es exactamente lo
 * que dice `caja-calendario.mjs` sobre por qué el calendario suma `formulaChequesSinFactura` y no los
 * cheques enteros—. La marca la escribe `cheques-cobertura` fila por fila cruzando el número de
 * comprobante normalizado; acá se LEE, no se rehace la normalización ("0001-000036" vs "1-36").
 *
 * LA COLUMNA DE LA MARCA VA POR ÍNDICE Y NO POR RÓTULO, a propósito: su encabezado lleva la fecha de
 * la última corrida ("Estado en el OS · al 05/08"), así que no se puede matchear por texto. El índice
 * se importa de `INSTRUMENTOS.cheques.colMarca`, que es la MISMA constante que usan el que marca y el
 * que suma — declarada una vez justamente porque escrita tres veces se desincronizaba en silencio.
 *
 * ═══ Y DESDE EL 06/08, EL QUE YA SE CRUZÓ CONTRA SU FACTURA TAMPOCO ═══
 *
 * La marca de la columna M es una FOTO vieja y sólo sabe decir "el número de esta fila no está en
 * Compras". El cruce formal (`lib/cruce-cheque-factura.mjs`) sabe más: empareja también los que no
 * traen número, y cuando empareja, esa plata sale por la puerta de Compras con su rubro y su cliente
 * reales. Emitirla además acá la contaría dos veces. La decisión de qué puerta le toca a cada cheque
 * NO se toma en este archivo ni en el otro: se toma en `puertaDeCheque`, una sola vez, y los dos
 * extractores la leen. Sin `cruce`, este extractor se comporta exactamente como antes.
 */
export function deChequesEmitidos(filas = [], { fila0 = FILA_DATO0_CHEQUES, colMarca = INSTRUMENTOS.cheques.colMarca, cruce = null } = {}) {
  const enc = filas[fila0 - 2] ?? [] // el encabezado del registro, una fila arriba del primer dato
  // El encabezado real del registro: "Nro" es el número
  // del cheque, "Monto" el importe, y hay DOS columnas de fecha de pago — "fecha de pago" (la fecha)
  // y "fecha pago" (el mes en texto). resolverColumnas matchea exacto, así que no se confunden.
  const c = columnasObligatorias(enc, {
    tipo: 'Tipo', numero: 'Nro', proveedor: 'Proveedor', importe: 'Monto',
    fechaPago: 'fecha de pago', debitado: 'DEBITADO',
  }, 'Cheques Emitidos')
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    if (importe === null || importe === 0) continue
    if (/^si$/i.test(txt(f[c.debitado]))) continue // ya está en el saldo del banco
    // `mismaMarca` y no `!==`: la fila publicada con el glifo viejo es la MISMA marca, y descartarla
    // acá saca un compromiso real del libro sin que nada dé error. Ver `ALERTA_HEREDADA`.
    if (!mismaMarca(txt(f[colMarca]), MARCAS.falta)) continue // con factura, ya entró por Compras
    if (cruce?.porCheque?.has(i + 1)) continue // cruzado: su plata sale por la puerta de Compras
    const esEcheq = /echeq/i.test(txt(f[c.tipo]))
    out.push(movimiento({
      // Sin fecha de pago cargada el cheque existe igual: cae al corte para que pese YA — un
      // compromiso sin fecha no es un compromiso que no vence, es uno que puede vencer mañana.
      fecha: num(f[c.fechaPago]) ?? 0,
      signo: SALE,
      importe,
      concepto: txt(f[c.proveedor]),
      contraparte: txt(f[c.proveedor]),
      rubro: 'Cheques emitidos',
      estado: 'COMPROMETIDO',
      instrumento: esEcheq ? 'echeq' : 'cheque',
      numeroCheque: txt(f[c.numero]),
      origen: { pestana: 'Cheques Emitidos', fila: i + 1 },
    }))
  }
  return out
}

/**
 * _BANCO_RAW → SÓLO los cargos sin factura.
 *
 * El resto del extracto NO se emite: el saldo del banco ya lo contiene, y las compras pagadas por
 * transferencia ya entran por Compras. Lo único que ninguna otra pestaña registra son los cargos que
 * el banco debita solo — impuesto al cheque, comisiones, intereses del descubierto ($2.504.655
 * medidos—: sin esta puerta, esa plata es "una diferencia sin causa" para siempre.
 *
 * @param {Array<Array>} filas de _BANCO_RAW: A fecha · B concepto · C importe · E signo · F naturaleza
 */
export function deBancoCargos(filas = [], { fila0 = 4 } = {}) {
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const fecha = num(f[0])
    const importe = num(f[2])
    const naturaleza = txt(f[5]).toLowerCase()
    if (fecha === null || importe === null || importe === 0) continue
    // La naturaleza la clasifica banco-santander.mjs al importar. Sólo pasan los cargos del banco.
    if (!/impuesto|comisi[oó]n|inter[eé]s|descubierto|cargo/.test(naturaleza)) continue
    out.push(movimiento({
      fecha,
      signo: importe < 0 ? SALE : ENTRA,
      importe: Math.abs(importe),
      concepto: txt(f[1]),
      contraparte: 'Banco Santander',
      rubro: 'Financiero',
      estado: 'REAL',
      instrumento: 'debito',
      referenciaBanco: `${fecha}|${txt(f[1])}|${importe}`,
      origen: { pestana: '_BANCO_RAW', fila: i + 1 },
    }))
  }
  return out
}

/**
 * TARJETA DE CRÉDITO → la cuota SIN FACTURA cargada, con el mismo criterio que el cheque.
 *
 * Misma puerta y mismo filtro que "Cheques Emitidos" (la marca del cruce + no debitada); cambia sólo
 * dónde están las columnas, y eso ya vive declarado en `INSTRUMENTOS.tarjeta`: monto E, fecha H,
 * debitado J, marca L, y el encabezado del registro en la fila 31 —no en la 2, que era la banda de la
 * pestaña y hacía que las marcas se estamparan encima del subtítulo—.
 *
 * ═══ Y LA CUOTA QUE EL RESUMEN YA PAGÓ NO SIGUE COMPROMETIDA (06/08) ═══
 *
 * La marca DEBITADO la pone una persona, cuota por cuota, y se atrasa. El extracto no: cuando el
 * banco debita el resumen, TODO lo que vencía en ese período ya salió de la cuenta. Medido en vivo:
 * "Tarjeta de Credito" f46 (Pinturería Córdoba, cuota 1/3, $263.813,91, vence 02/08) seguía
 * COMPROMETIDA con el resumen ya debitado el 03/08 por $1.384.664,47 — y como su fecha ya pasó,
 * engordaba el tramo "Vencido" de la escalera a −$487.814 cuando el vencido real son los $224.000 de
 * PEDRO TELLO. La regla y su lado conservador viven en `libro-respaldo-banco.mjs`.
 *
 * SIN `pagos` NO CAMBIA NADA: el que no pasa el extracto obtiene el comportamiento de antes, que es
 * el correcto cuando no hay testigo.
 *
 * @param {Array<Array>} filas la pestaña "Tarjeta de Credito" entera, UNFORMATTED_VALUE
 * @param {{filaCab?:number, pagos?:Array}} opciones `pagos` = los débitos de resumen del extracto
 */
export function deTarjetaSinFactura(filas = [], { filaCab = INSTRUMENTOS.tarjeta.filaCab, pagos = [] } = {}) {
  const T = INSTRUMENTOS.tarjeta
  const iMonto = indiceDeColumna(T.colMonto)
  const iFecha = indiceDeColumna(T.colFecha)
  const iDeb = indiceDeColumna(T.colDebitado)
  const out = []
  for (let i = filaCab; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[iMonto])
    if (!importe) continue
    if (/^si$/i.test(txt(f[iDeb]))) continue
    if (!mismaMarca(txt(f[T.colMarca]), MARCAS.falta)) continue
    // Sin fecha cargada la cuota cae al serial 0 y pesa YA, igual que el cheque sin fecha: un
    // compromiso sin fecha no es uno que no vence, es uno que puede vencer mañana. Y sin fecha
    // tampoco hay vencimiento contra el que medir el resumen: `cubiertaPorResumen` devuelve null.
    const fecha = num(f[iFecha]) ?? 0
    const debitada = cubiertaPorResumen(fecha, pagos)
    out.push(movimiento({
      // Cuando el resumen ya se pagó, la fecha del movimiento es la del DÉBITO y no la del
      // vencimiento: es el día en que la plata salió de la cuenta, que es lo que el libro registra.
      fecha: debitada ?? fecha,
      signo: SALE,
      importe,
      concepto: txt(f[indiceDeColumna(T.colComprobante)]) || 'Cuota de tarjeta sin factura',
      contraparte: 'Tarjeta de crédito',
      rubro: 'Cheques y tarjeta sin factura cargada',
      estado: debitada ? 'REAL' : 'COMPROMETIDO',
      instrumento: 'tarjeta',
      origen: { pestana: T.pestaña, fila: i + 1 },
    }))
  }
  return out
}

/**
 * IMPUESTOS Y FINANCIEROS → el IVA y el IIBB a pagar. La salida que Compras NO tiene.
 *
 * `impuestos-pestana.mjs` lo dice sin ambigüedad: *"En Compras no hay UNA SOLA fila de IVA ni de
 * IIBB"*. El neto a pagar lo calcula esa pestaña mes por mes y el resto del archivo lo LEE —no lo
 * recalcula, que es la regla de una sola fuente—. Sin esta puerta el calendario proyecta ~$13,18M
 * anuales de IVA que nadie ve salir.
 *
 * ═══ EL VENCIMIENTO ES FIN DE MES DEL PERÍODO + 20 DÍAS ═══
 *
 * Es exactamente el `EOMONTH(DATE(anio;m;1);0)+20` de `formulaCalendarioImpuestosSemana`: el IVA de un
 * período se paga al mes siguiente, alrededor del día 20. En percibido lo que importa es cuándo sale
 * la plata, no cuándo se devengó — y el caso que un `mes+1` ingenuo rompe es diciembre, que vence el
 * 20/01 del año SIGUIENTE.
 *
 * LA IDENTIDAD DE ESTE MOVIMIENTO ES UNA CELDA, NO UNA FILA. Los doce meses viven en la misma fila
 * (B..M); con la fila sola, la clave de dedup —que cae en `origen:pestaña:fila` cuando no hay
 * comprobante— colapsaría los doce en uno y quedaría un mes de IVA en todo el año.
 *
 * @param {Array<Array>} filas la pestaña entera, UNFORMATTED_VALUE
 * @param {{filaIva:number, filaIibb:number}} filasCal filas ubicadas POR RÓTULO (1-based)
 * @param {number} anio el año de la grilla
 * @param {number|null} corte serial del corte: un vencimiento ya pasado es VENCIDO, no proyectado
 */
export function deImpuestosCalendario(filas = [], { filaIva, filaIibb } = {}, anio, corte = null) {
  if (!filaIva || !filaIibb || !anio) {
    throw new Error('libro-extractores(Impuestos y Financieros): necesito las filas del IVA y del IIBB '
      + 'ubicadas por rótulo y el año. Una fila muerta devolvería $0 sin un solo error.')
  }
  const out = []
  for (const [clave, fila] of [['IVA', filaIva], ['IIBB', filaIibb]]) {
    const f = filas[fila - 1] ?? []
    for (let m = 1; m <= 12; m++) {
      const importe = num(f[m]) // B..M = índices 1..12 = meses 1..12
      if (!importe) continue
      // ═══ LA FECHA DE VENCIMIENTO REAL, NO "FIN DE MES + 20" (06/08) ═══
      //
      // El +20 era la ÚNICA noción de vencimiento fiscal de todo el OS, repetida en tres archivos, y
      // no distinguía impuesto ni terminación de CUIT. Ahora el calendario existe y está verificado
      // contra ARCA para el IVA (terminación 3 → día 19, con cuatro corrimientos que ninguna regla
      // reproduce) y declarado como supuesto para el IIBB de San Juan (día 16, la moda de las seis
      // presentaciones reales de _IIBB_RAW).
      //
      // A escala mensual el cambio es neutro —el +20 y las fechas reales (16 a 21) caen siempre en el
      // mismo mes, así que ninguna conciliación mensual se mueve— pero el calendario semanal de CAJA
      // y el "próximo vencimiento" del hero pasan a apuntar al día correcto en vez de al día 20.
      const periodo = `${anio}-${String(m).padStart(2, '0')}`
      const fecha = serialDe((clave === 'IVA' ? vencimientoIva(periodo) : vencimientoIibb(periodo)).fecha)
      out.push(movimiento({
        fecha,
        signo: SALE,
        importe,
        concepto: `${clave} a pagar · período ${String(m).padStart(2, '0')}/${anio}`,
        contraparte: clave === 'IVA' ? 'ARCA' : 'DGR San Juan',
        rubro: 'Impuestos',
        estado: estadoContraCorte('PROYECTADO', fecha, corte),
        origen: { pestana: 'Impuestos y Financieros', fila: `${colMesDelAnio(m)}${fila}` },
      }))
    }
  }
  return out
}

/**
 * _CHEQUES_RAW → LA CARTERA: los valores de terceros que todavía NO son caja.
 *
 * Es la única fuente de ENTRA además de Cobranzas, y la condición es la misma que la fórmula viva de
 * `cartera-cheques.mjs`: **tipo "recibido" Y estado "En custodia"**. Depositado, rechazado o endosado
 * ya no es cartera. La fecha que decide es la de PAGO del valor: es cuándo se vuelve plata.
 *
 * POR QUÉ COMPROMETIDO Y NO REAL: el valor está en la mano, con fecha, pero la plata no está en la
 * cuenta hasta que se acredita. Es la misma categoría que el cheque emitido, del otro lado del signo.
 *
 * UN VALOR SIN FECHA DE PAGO NO SE EMITE. No cae en ningún tramo del calendario tampoco, y meterlo con
 * fecha 0 lo pondría en un tramo donde CAJA no lo tiene. Ese caso ya lo grita el canario de la pestaña
 * de cartera ("⚠ hay un valor en cartera sin fecha de pago"), que es donde corresponde verlo.
 *
 * LA ESPECIE (físico o eCHEQ) NO ESTÁ EN LA RÉPLICA: su columna "Tipo" dice recibido/emitido. Se
 * declara `cheque` salvo que el texto diga echeq, y la clave no depende de eso porque el signo ya
 * separa el 514 que me dieron del 514 que libré.
 */
export function deCartera(filas = [], { fila0 = FILA0_RAW } = {}) {
  const i = (letra) => indiceDeColumna(letra)
  const out = []
  for (let r = fila0 - 1; r < filas.length; r++) {
    const f = filas[r] ?? []
    const tipo = txt(f[i(COL_RAW.tipo)]).toLowerCase()
    if (tipo !== 'recibido') continue
    if (txt(f[i(COL_RAW.estado)]).toLowerCase() !== EN_CARTERA.toLowerCase()) continue
    const importe = num(f[i(COL_RAW.importe)])
    const fecha = num(f[i(COL_RAW.fechaPago)])
    if (!importe || fecha === null) continue
    out.push(movimiento({
      fecha,
      signo: ENTRA,
      importe,
      concepto: txt(f[i(COL_RAW.librador)]) || txt(f[i(COL_RAW.contraparte)]),
      contraparte: txt(f[i(COL_RAW.librador)]),
      cuit: txt(f[i(COL_RAW.libradorCuit)]),
      obra: txt(f[i(COL_RAW.obra)]),
      // La columna "Obra" de la réplica es donde el propio archivo asigna el valor a un cliente
      // ("MESSINA"); el librador es el respaldo para cuando esa celda viene vacía. Se prueba la
      // asignación PRIMERO porque es una decisión del dueño: la razón social del librador puede no
      // decir a qué cliente pertenece el cheque ("Alimentos Del Sur SA" por LA ESTRELLA).
      cliente: clienteCanonico(txt(f[i(COL_RAW.obra)])) || txt(f[i(COL_RAW.librador)]),
      rubro: 'Valores en cartera',
      estado: 'COMPROMETIDO',
      instrumento: /echeq/i.test(tipo) ? 'echeq' : 'cheque',
      numeroCheque: txt(f[i(COL_RAW.numero)]),
      origen: { pestana: PESTANA_RAW, fila: r + 1 },
    }))
  }
  return out
}
