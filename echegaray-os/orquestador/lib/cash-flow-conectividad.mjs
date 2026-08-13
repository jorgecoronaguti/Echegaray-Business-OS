// ¿CADA MOVIMIENTO DEL LIBRO CAE EN UNA FILA Y UNA COLUMNA DE LAS DOS VISTAS, O HAY PLATA SIN CELDA?
//
// ═══ POR QUÉ EXISTE (06/08/2026) ═══
//
// El dueño pidió verificar que Compras —con sus distintos MÉTODOS DE PAGO— y Cobranzas estén
// conectadas a "Cash Flow Semanal" y "Cash Flow Mensual", CON IMPACTO EN LOS SALDOS.
//
// `caja-canales.mjs` ya contesta esa pregunta para CAJA: qué línea del bloque de disponibilidades
// absorbe cada método. Pero CAJA es un STOCK a una fecha y las dos vistas son una MATRIZ: un
// movimiento puede estar perfectamente clasificado en el libro y aun así no aparecer en ningún lado
// del cuadro, porque su FECHA cae fuera de la última columna. El veredicto de CAJA no lo ve, y el
// cuadro tampoco: una columna que no existe no da #REF!, simplemente no suma.
//
// ═══ LO QUE ESTE ARCHIVO MIDE, Y POR QUÉ CADA COSA ═══
//
//   1. LA PARTICIÓN.  Cada movimiento contra la rejilla de ventanas. Un movimiento cuya fecha queda
//      antes de la primera columna o desde la última en adelante NO ESTÁ EN EL CUADRO. Medido el
//      06/08: $23.358.443 de jornales e impuestos PROYECTADOS de 2027 que el Mensual 2026 no puede
//      mostrar. No es un error de fórmula: es plata comprometida que ninguna celda contiene.
//
//   2. LA FILA.  En qué sub-línea cae — y si cae en "· Otros", que es la fila donde un rubro se
//      esconde. "Otros" no es un hueco (se despeja del subtotal, así que la plata está), pero un
//      rubro entero escondido ahí sí es un defecto de taxonomía. Fue este control el que midió las
//      notas de crédito de proveedores presentadas como ingreso — el defecto que el neteo del 06/08
//      cerró (`cash-flow-rubros.esDevolucion`). Desde entonces esta cuenta tiene que dar vacía para
//      ese caso: si vuelve a listarlas, es que el neteo se rompió.
//
//   3. EL DOBLE CONTEO CONTRA EL ANCLA.  El saldo inicial del período ancla es
//      `CAJA_TOTAL_DISPONIBLE − REAL[inicio, CAJA_FECHA_SALDO+1)`. Pero CAJA_TOTAL_DISPONIBLE **no
//      está acotado por esa fecha**: su línea "Movimientos posteriores al corte" incluye TODO lo
//      real posterior al corte del extracto, sin techo. Así que un REAL fechado DESPUÉS de
//      CAJA_FECHA_SALDO está dentro del saldo declarado, el término del ancla no lo resta, y la
//      columna de su propia fecha lo vuelve a contar. Es el único de los tres que mueve el SALDO
//      FINAL de todas las columnas siguientes.
//
//   4. EL MISMO VALOR POR DOS PUERTAS.  Un echeq de un cliente entra al libro por Cobranzas (rubro
//      "Cobranzas") y otra vez por `_CHEQUES_RAW` (rubro "Valores en cartera"). Las dos filas tienen
//      claves de deduplicación distintas —Cobranzas no trae el número del cheque— así que
//      `deduplicar` no las puede colapsar y las dos suman en "Ingresos proyectados".
//
// ═══ NO SE VALIDA CONTRA LO QUE PRODUCE ═══
//
// Ninguna de las cuatro le pregunta al cuadro si el cuadro está bien. Las cuatro parten del LIBRO y
// de la GEOMETRÍA declarada (`cash-flow-matriz`), y el script que las corre las confronta contra las
// celdas vivas y contra las pestañas de origen — que son productores independientes.
//
// NÚCLEO PURO: no lee Google, no escribe nada. Todo se prueba en frío.

import {
  COL, ventanas, conceptosDe, filaDeConcepto, letra, serialDeFecha,
} from './cash-flow-matriz.mjs'
import { OTROS, claveSub, rubrosDeApertura, ladoDe } from './cash-flow-rubros.mjs'

/** Los estados que van a la línea "proyectado". Espejo de ESTADOS_PENDIENTES, en forma de test. */
const PENDIENTE = new Set(['PROYECTADO', 'VENCIDO', 'COMPROMETIDO'])

/** La rejilla de una vista, ya en SERIALES: es la unidad en la que el libro guarda las fechas. */
export function rejilla(tipo, anio) {
  return ventanas(tipo, { anio }).map((v, i) => ({
    i, desde: serialDeFecha(v.desde), hasta: serialDeFecha(v.hasta), col: COL.tiempo0 + i,
  }))
}

/**
 * NÚCLEO PURO: la MEDIDA a la que pertenece un movimiento — la fila de subtotal que lo contiene.
 *
 * Es la traducción exacta del filtro que escribe `formulasDeMedida`: lado + grupo de estados. Si esto
 * y aquello se separaran, el veredicto diría que un movimiento está en una fila donde no está.
 *
 * EL LADO NO ES EL SIGNO desde el 06/08: una nota de crédito de proveedor ENTRA (signo +1) con un
 * rubro de egreso y RESTA del egreso de ese rubro, no suma en ingresos. Quién decide eso es `ladoDe`,
 * una sola vez, en la taxonomía — el mismo lugar del que sale el filtro de la celda.
 */
export function medidaDe(mov = {}) {
  const real = mov.estado === 'REAL'
  if (!real && !PENDIENTE.has(mov.estado)) return null // un estado que ninguna medida mira
  return ladoDe(mov) === 1
    ? (real ? 'ingresoReal' : 'ingresoProyectado')
    : (real ? 'egresoReal' : 'egresoProyectado')
}

/**
 * NÚCLEO PURO: EN QUÉ FILA Y EN QUÉ COLUMNA de la vista cae un movimiento. Es la tabla que el dueño
 * pidió: canal → fila/columna → estado.
 *
 * `columna: null` es el veredicto que importa: la plata existe en el libro y no está en el cuadro.
 * `enOtros: true` no es un hueco —el subtotal la contiene y "Otros" se despeja de la resta— pero
 * marca un rubro que la taxonomía no nombra, que es como un canal entero se vuelve invisible.
 *
 * @param {object} mov un movimiento del libro
 * @param {'semana'|'mes'} tipo
 * @param {Array} grilla la salida de `rejilla(tipo, anio)`
 */
export function ubicar(mov = {}, tipo, grilla = []) {
  const medida = medidaDe(mov)
  if (!medida) return { medida: null, fila: null, columna: null, enOtros: false, motivo: 'estado que ninguna medida mira' }
  // La apertura de la medida, no la del signo: bajo "Ingresos reales" no hay sub-línea de cartera, así
  // que un "Valores en cartera" REAL cae en "· Otros" — que es exactamente lo que se quiere ver.
  const propio = rubrosDeApertura(ladoDe(mov), mov.estado === 'REAL').includes(mov.rubro)
  const clave = claveSub(medida, propio ? mov.rubro : OTROS)
  const v = grilla.find((w) => mov.fecha >= w.desde && mov.fecha < w.hasta)
  return {
    medida,
    fila: filaDeConcepto(tipo, clave),
    // El rótulo sale de la MISMA lista de conceptos que genera la pestaña: si mañana cambia el texto
    // de una sub-línea, el veredicto lo dice con el texto nuevo y no con una copia envejecida.
    rotulo: conceptosDe(tipo).find((c) => c.clave === clave)?.rotulo ?? null,
    columna: v ? letra(v.col) : null,
    enOtros: !propio,
    motivo: v ? null : 'la fecha queda fuera de toda columna del ejercicio',
  }
}

/** Suma con signo. Es lo que decide: contar filas no distingue $0 de $40M. */
const neto = (a) => a.reduce((x, m) => x + (Number(m.signo) || 0) * (Number(m.importe) || 0), 0)

/**
 * NÚCLEO PURO: LA PLATA QUE NO ESTÁ EN NINGUNA COLUMNA, agrupada por origen para poder actuar.
 *
 * Se agrupa por pestaña de origen y no por rubro porque lo que hay que hacer con el hallazgo es ir a
 * una pestaña: "tres filas de Jornales por Quincena con fecha 2027" se resuelve; "$21M de nómina"
 * no se resuelve en ningún lado.
 *
 * @returns {{filas:number, neto:number, porOrigen:Array, movimientos:Array}}
 */
export function plataSinColumna(movimientos = [], tipo, anio) {
  const grilla = rejilla(tipo, anio)
  const fuera = movimientos.filter((m) => Number.isFinite(m.fecha)
    && !grilla.some((w) => m.fecha >= w.desde && m.fecha < w.hasta))
  const g = new Map()
  for (const m of fuera) {
    const k = `${m.origen ?? '?'}|${m.estado}`
    const a = g.get(k) ?? { origen: String(m.origen ?? '?'), estado: m.estado, filas: 0, neto: 0 }
    a.filas++
    a.neto += (Number(m.signo) || 0) * (Number(m.importe) || 0)
    g.set(k, a)
  }
  return {
    filas: fuera.length,
    neto: neto(fuera),
    porOrigen: [...g.values()].sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto)),
    movimientos: fuera,
  }
}

/**
 * NÚCLEO PURO: LO QUE EL SALDO DECLARADO YA CONTIENE Y LA COLUMNA VUELVE A CONTAR.
 *
 * ═══ LA ARITMÉTICA, EN TRES RENGLONES ═══
 *
 *     saldo inicial del ancla = CAJA_TOTAL_DISPONIBLE − REAL[inicio del período , fechaSaldo]
 *     CAJA_TOTAL_DISPONIBLE   = extracto al corte + TODO lo real posterior al corte  (sin techo)
 *     ⇒ un REAL con fecha > fechaSaldo está en el saldo Y en su propia columna.
 *
 * Por eso la condición es `fecha > fechaSaldo` y no `fecha > corte`: la ventana que el término del
 * ancla NO alcanza a restar empieza justo después de `CAJA_FECHA_SALDO`.
 *
 * NO INCLUYE EL SIGNO EN UNA SOLA CIFRA POR CASUALIDAD: un cobro de más y un pago de más se cancelan
 * en el neto y los dos siguen estando mal, así que se devuelven las dos magnitudes por separado.
 *
 * @param {Array} movimientos el libro
 * @param {number} fechaSaldo el serial de CAJA_FECHA_SALDO
 * @returns {{filas:number, neto:number, entra:number, sale:number, movimientos:Array}}
 */
export function dobleConteoDelAncla(movimientos = [], fechaSaldo) {
  if (!Number.isFinite(fechaSaldo)) {
    throw new Error('cash-flow-conectividad: sin CAJA_FECHA_SALDO no hay ancla y no se puede decidir '
      + 'qué está adentro del saldo declarado. Un default silencioso daría cero huecos sobre un hueco.')
  }
  const ms = movimientos.filter((m) => m.estado === 'REAL' && Number.isFinite(m.fecha) && m.fecha > fechaSaldo)
  return {
    filas: ms.length,
    neto: neto(ms),
    entra: ms.filter((m) => m.signo === 1).reduce((a, m) => a + m.importe, 0),
    sale: ms.filter((m) => m.signo === -1).reduce((a, m) => a + m.importe, 0),
    movimientos: ms,
  }
}

/** Los instrumentos que son un VALOR en la mano: entran por dos puertas distintas del libro. */
const VALORES = new Set(['cheque', 'echeq'])
/** El rubro con el que `deCartera` emite la réplica de cheques. Se compara, no se reescribe. */
export const RUBRO_CARTERA = 'Valores en cartera'

/**
 * NÚCLEO PURO: EL MISMO VALOR CONTADO POR DOS PUERTAS.
 *
 * ═══ EL CASO MEDIDO (06/08) ═══
 *
 *     Cobranzas f37   · LA ESTRELLA · Echeq · $10.000.000 · fecha 46234 · estado "Pendiente"
 *     _CHEQUES_RAW f10· echeq 90020099 · Alimentos Del Sur · $10.000.000 · fecha de pago 46234
 *
 * Es el MISMO e-cheque. En el libro son dos movimientos con claves distintas —`origen:cobranzas:37`
 * y `echeq:90020099:E`, porque Cobranzas no trae el número del cheque— así que `deduplicar` no los
 * puede colapsar. Los dos son ingreso no-real, y los dos suman: "Ingresos proyectados" muestra
 * $10.000.000 de más en la semana del 27/07 y en julio.
 *
 * EL EMPAREJAMIENTO ES POR (importe, fecha) Y ESO ES UNA HEURÍSTICA, NO UNA CLAVE. Se declara acá y
 * no se disimula: el dato que identificaría el valor sin ambigüedad —el número del cheque— no está
 * en Cobranzas. Por eso esto REPORTA y no deduplica: colapsar dos cobros que casualmente coincidan
 * en monto y día haría desaparecer plata real, que es peor que contarla dos veces y verlo.
 *
 * @returns {Array<{importe:number, fecha:number, cobranzas:object, cartera:object}>}
 */
export function valorPorDosPuertas(movimientos = []) {
  const cartera = movimientos.filter((m) => m.rubro === RUBRO_CARTERA && m.signo === 1)
  const cobros = movimientos.filter((m) => m.rubro !== RUBRO_CARTERA && m.signo === 1
    && VALORES.has(m.instrumento))
  const out = []
  for (const c of cobros) {
    const par = cartera.find((v) => v.fecha === c.fecha && Math.round(v.importe) === Math.round(c.importe))
    if (par) out.push({ importe: c.importe, fecha: c.fecha, cobranzas: c, cartera: par })
  }
  return out
}

/**
 * NÚCLEO PURO: los rubros que la taxonomía de la vista NO nombra y que terminan en "· Otros".
 *
 * "Otros" se despeja del subtotal, así que la plata está en el cuadro — pero un rubro entero ahí
 * adentro es invisible para decidir.
 *
 * EL CASO QUE ESTE CONTROL DESTAPÓ Y QUE YA NO PUEDE VOLVER: el SIGNO CRUZADO. Una nota de crédito de
 * proveedor entra (signo +1) con un rubro de egreso, y hasta el 06/08 caía en "Ingresos reales ·
 * Otros" — $833k presentados como si la empresa los hubiera cobrado. Ahora netea el egreso de su
 * propio rubro y este control deja de listarla: si vuelve a aparecer acá, es que el neteo se rompió.
 *
 * @returns {Array<{signo:number, rubro:string, filas:number, monto:number}>}
 */
export function rubrosEnOtros(movimientos = []) {
  const g = new Map()
  for (const m of movimientos) {
    if (!medidaDe(m)) continue
    if (rubrosDeApertura(ladoDe(m), m.estado === 'REAL').includes(m.rubro)) continue
    const k = `${m.signo}|${m.rubro}`
    const a = g.get(k) ?? { signo: m.signo, rubro: m.rubro, filas: 0, monto: 0 }
    a.filas++
    a.monto += Number(m.importe) || 0
    g.set(k, a)
  }
  return [...g.values()].sort((a, b) => b.monto - a.monto)
}

/**
 * NÚCLEO PURO: QUÉ MOVIMIENTOS DEL AÑO VECINO TOCAN LAS SEMANAS ISO DEL CUADRO.
 *
 * Las columnas del semanal son las semanas ISO que contienen al año calendario, así que la primera
 * arranca en diciembre del anterior y la última termina en enero del siguiente. Esta función lista los
 * movimientos que caen en ese derrame.
 *
 * ═══ QUÉ SIGNIFICABA ANTES Y QUÉ SIGNIFICA AHORA (13/08/2026) ═══
 *
 * Nació el 06/08 para probar que las dos columnas TOTAL "no tenían por qué coincidir" — medía
 * $11.259.575 de nómina proyectada de enero de 2027 que estaban en el TOTAL del semanal y no en el del
 * mensual, y eso se dio por inevitable. NO ERA INEVITABLE: la semana cae en algún lado, pero lo que la
 * columna SUMA se recorta en el borde del año (`cash-flow-borde-anio.mjs`). Desde entonces ninguna
 * columna suma esos movimientos y las dos vistas tienen que dar igual — lo verifica `cash-flow-cuadre`.
 *
 * LO QUE ESTO MIDE HOY: cuánta plata del año vecino queda a la vista en el rango de fechas del cuadro
 * pero fuera de sus totales. No es un error —pertenece al otro ejercicio— pero es lo primero que hay
 * que mirar si alguien pregunta "¿por qué la última columna suma menos de lo que dice su semana?".
 *
 * @returns {{soloSemanal:Array, neto:number, semanal:{desde:number,hasta:number}, mensual:{desde:number,hasta:number}}}
 */
export function bordesEntreVistas(movimientos = [], anio) {
  const s = rejilla('semana', anio)
  const m = rejilla('mes', anio)
  const S = { desde: s[0].desde, hasta: s[s.length - 1].hasta }
  const M = { desde: m[0].desde, hasta: m[m.length - 1].hasta }
  const soloSemanal = movimientos.filter((x) => Number.isFinite(x.fecha)
    && x.fecha >= S.desde && x.fecha < S.hasta && (x.fecha < M.desde || x.fecha >= M.hasta))
  return { soloSemanal, neto: neto(soloSemanal), semanal: S, mensual: M }
}
