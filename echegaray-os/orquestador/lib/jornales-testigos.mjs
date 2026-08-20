// LOS TESTIGOS DE UNA QUINCENA — quién puede probar que la nómina de obra ya salió de la cuenta.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (16/08/2026) ═══
//
// `libro-extractores-nomina.mjs` decidía con UNA sola columna tipeada a mano:
//
//     estado = pagado === null ? 'COMPROMETIDO' : 'REAL'
//
// La columna N "Pagado el" de "Jornales por Quincena" se desalineó —el generador la copia por
// posición y una corrida sin cabecera reconocible la corrió ocho filas— y las OCHO quincenas de mayo
// a agosto quedaron sin fecha. Sin fecha, esa línea las declaró impagas: **$70.431.250 de deuda
// inventada por una celda vacía**, propagada a `_MOVIMIENTOS`, a CAJA, al Cash Flow Semanal y al
// Mensual. El dueño lo vio así: *"de repente debemos mas en lo q falta del mes q lo q ya se ha
// pagado"*. Ningún error, ninguna celda en rojo.
//
// La causa raíz no es la columna: es que **un dato faltante se convertía en un HECHO económico**. Un
// testigo que falta no prueba lo contrario de lo que probaría si estuviera.
//
// ═══ LA REGLA ═══
//
// Dos testigos independientes, y el veredicto dice cuál habló:
//
//   · LA COLUMNA "Pagado el" — el dato del dueño. Manda cuando está (memoria: la edición manual es
//     verdad definitiva), pero ya no decide SOLA: si el banco la contradice, se grita.
//   · EL EXTRACTO (`_BANCO_RAW`) — los débitos de naturaleza "Sueldos". No se le pregunta al Sheet
//     si cobró: se le pregunta al banco. Es la única fuente que no se puede tipear mal.
//
// Y cuando NINGUNO puede hablar, el veredicto es `SIN_TESTIGO` o `FUERA_DE_VENTANA` — visible y
// nombrado, nunca "impaga por defecto en silencio". Ésa es toda la diferencia entre este archivo y
// la línea que reemplaza.
//
// NÚCLEO PURO. No lee Google, no escribe, no toca la base.

import { NAT } from './banco-santander.mjs'
// Los motivos los lee una persona, y "46160" no es una fecha para nadie. La conversión es la MISMA
// del libro: dos aritméticas de serial discrepan un día y la diferencia se lee como plata movida.
import { isoDeSerial } from './libro-extractores-fechas.mjs'

/**
 * Cuántos días alrededor de "Se paga el" se acepta un lote de haberes como el de ESTA quincena.
 *
 * SIETE, y el número sale de la grilla del negocio: las quincenas se pagan cada ~15 días, así que
 * ±7 es la ventana más ancha que NO deja que el lote de una quincena explique a la de al lado.
 * Medido sobre el extracto vivo: la del 03/08 se debitó el 31/07 (−3) y la del 17/08 el 14/08 (−3).
 */
export const HOLGURA_HABERES = 7

/**
 * Tope de grupos de importe distinto por día para intentar la combinación exacta.
 *
 * Con 22 grupos ya son 4M de combinaciones y el tiempo deja de ser gratis. Por encima del tope NO se
 * adivina: se devuelve el motivo escrito, que es el comportamiento correcto de este repo cuando el
 * emparejamiento no se puede probar.
 */
export const TOPE_GRUPOS = 22

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/**
 * SIN TOLERANCIA, Y A PROPÓSITO: se compara en CENTAVOS ENTEROS y el emparejamiento es exacto.
 *
 * Acá una diferencia de un peso no es redondeo: es que el subconjunto elegido no es el correcto. Con
 * ±$1 de holgura, dos combinaciones distintas del mismo día podrían "coincidir" las dos y el módulo
 * elegiría una — que es exactamente lo que este archivo se niega a hacer.
 */
const centavos = (v) => Math.round(v * 100)

/**
 * NÚCLEO PURO: los débitos de haberes del extracto, agrupados por DÍA.
 *
 * Por naturaleza y no por un regex sobre el concepto: el rótulo lo pone `banco-santander.mjs` (que ya
 * reconoce "Pago haberes", "Pago de haberes por cci" y "Acreditacion en cta pago de haber" como la
 * misma cosa) y escrito dos veces se desincroniza el día que alguien lo renombre — sin dar un error,
 * porque un filtro que no encuentra filas devuelve cero.
 *
 * POR DÍA porque una nómina se paga en UNA tanda: el banco emite un débito por trabajador, todos con
 * la misma fecha y el mismo identificador de lote. Débitos de días distintos que sumen el total es
 * una coincidencia aritmética, no un pago.
 *
 * @param {Array<{fecha:number, importe:number, naturaleza:string, fila:number}>} debitos
 * @param {{usados?:Set<number>}} ctx `usados` son las filas de `_BANCO_RAW` ya reclamadas por otro
 *        movimiento: un débito respalda a uno solo, o la misma plata paga dos veces.
 * @returns {Map<number, {fecha:number, total:number, filas:number[], importes:number[]}>}
 */
export function lotesDeHaberes(debitos = [], { usados = new Set() } = {}) {
  const porDia = new Map()
  for (const d of debitos) {
    if (d?.naturaleza !== NAT.sueldos) continue
    if (usados.has(d.fila)) continue
    const fecha = num(d.fecha)
    const importe = num(d.importe)
    if (fecha === null || importe === null || importe <= 0) continue
    if (!porDia.has(fecha)) porDia.set(fecha, { fecha, total: 0, filas: [], importes: [] })
    const g = porDia.get(fecha)
    g.total = Math.round((g.total + importe) * 100) / 100
    g.filas.push(d.fila)
    g.importes.push(importe)
  }
  return porDia
}

/**
 * NÚCLEO PURO: ¿hay UNA sola forma de explicar `objetivo` con los débitos de este día?
 *
 * ═══ POR QUÉ "UNA SOLA" Y NO "LA MEJOR" ═══
 *
 * El lote de un día contiene la nómina de obra, la de oficina y los retiros de dirección mezclados:
 * la parte que le toca a una quincena es un SUBCONJUNTO, no el total del día. Medido en vivo, el
 * 31/07: 17 débitos por $6.067.921,10, de los cuales los $3.336.233,42 de la quincena son los 14
 * chicos más el pago por CCI, y los dos de $1.365.843,84 son de otro bloque.
 *
 * Con más de una combinación posible no hay forma de saber cuál es, y elegir "la más grande" o "la
 * más parecida" sería inventar un criterio para no quedarse sin respuesta. Se devuelve `unica:false`
 * y el compromiso queda vivo — el lado seguro del error (ver libro-respaldo-banco.mjs).
 *
 * LAS COMBINACIONES SE CUENTAN POR MULTICONJUNTO DE IMPORTES, NO POR ÍNDICE: catorce débitos de
 * $260.000 dan UNA sola forma de armar $3.640.000, no 3.003. Contando por índice, todo lote con
 * importes repetidos —que es la forma normal de una nómina— sería "ambiguo" y este módulo no
 * probaría nunca nada.
 *
 * @param {number[]} importes los del día
 * @param {number} objetivo lo que la planilla dice que salió por banco
 * @returns {{unica:boolean, indices:number[], motivo:string}}
 */
export function combinacionUnica(importes = [], objetivo) {
  const meta = centavos(objetivo)
  if (!Number.isFinite(meta) || meta <= 0) return { unica: false, indices: [], motivo: 'sin importe por banco que buscar' }
  // Agrupar por importe: la multiplicidad es del grupo, no del índice.
  const grupos = new Map()
  importes.forEach((v, i) => {
    const c = centavos(v)
    if (!grupos.has(c)) grupos.set(c, [])
    grupos.get(c).push(i)
  })
  if (grupos.size > TOPE_GRUPOS) {
    return { unica: false, indices: [], motivo: `${grupos.size} importes distintos ese día: no intento la combinación` }
  }
  // DP: suma → {formas, receta}. La receta guarda cuántos de cada grupo entran.
  let estados = new Map([[0, { formas: 1, receta: new Map() }]])
  for (const [valor, idx] of grupos) {
    const siguiente = new Map()
    for (const [suma, est] of estados) {
      for (let k = 0; k <= idx.length; k++) {
        const s = suma + valor * k
        if (s > meta) break
        const receta = new Map(est.receta)
        if (k > 0) receta.set(valor, k)
        const ya = siguiente.get(s)
        if (ya) ya.formas += est.formas
        else siguiente.set(s, { formas: est.formas, receta })
      }
    }
    estados = siguiente
  }
  const fin = estados.get(meta)
  if (!fin) return { unica: false, indices: [], motivo: 'ningún subconjunto de los haberes de ese día suma ese importe' }
  if (fin.formas > 1) {
    return { unica: false, indices: [], motivo: `${fin.formas} combinaciones distintas dan ese importe — no empareje` }
  }
  const indices = []
  for (const [valor, k] of fin.receta) indices.push(...grupos.get(valor).slice(0, k))
  return { unica: true, indices: indices.sort((a, b) => a - b), motivo: `${indices.length} débito(s) de haberes` }
}

/** Los veredictos posibles. Cada uno dice QUIÉN habló — nunca "no sé" sin nombre. */
export const VEREDICTO = Object.freeze({
  banco: 'BANCO',                 // el extracto lo prueba
  conciliado: 'CONCILIADO',       // el dueño lo marcó Y el banco coincide
  contradice: 'CONTRADICE',       // el dueño y el banco dicen cosas distintas
  declarado: 'DECLARADO',         // sólo el dueño lo marcó; el banco no puede opinar
  sinBanco: 'SIN_BANCO',          // la quincena no declara nada por banco: el extracto no es testigo
  sinTestigo: 'SIN_TESTIGO',      // debería estar en el extracto y no está
  fueraDeVentana: 'FUERA_DE_VENTANA', // el extracto no llega a esa fecha
  futuro: 'FUTURO',               // todavía no se paga: no hay nada que probar
  imposible: 'FECHA_IMPOSIBLE',   // la columna dice una fecha que no puede ser la de este pago
})

/** Los veredictos que hay que GRITAR: o falta un testigo, o los dos que hay no coinciden. */
export const GRITAN = Object.freeze([VEREDICTO.contradice, VEREDICTO.sinTestigo,
  VEREDICTO.fueraDeVentana, VEREDICTO.sinBanco, VEREDICTO.imposible])

/**
 * Cuántos días después de "Se paga el" sigue siendo creíble que ése fue el pago de esta quincena.
 *
 * TREINTA Y UNO: un pago se atrasa días, o a lo sumo un mes. Con la columna corrida ocho filas, las
 * siete quincenas de enero a abril quedaron con fechas de 120 a 123 días después — y ninguna de las
 * dos puntas (la fecha ni la quincena) grita sola. La distancia sí.
 */
export const ATRASO_MAXIMO = 31

/**
 * NÚCLEO PURO: ¿la fecha declarada en "Pagado el" PUEDE ser la de este pago?
 *
 * Dos imposibilidades, y las dos son aritmética pura sobre la propia fila — no hacen falta testigos:
 *
 *   · ANTES DEL CIERRE. Una quincena no se paga antes de terminar de trabajarse. La f139 vivía con
 *     "pagada el 16/03" sobre una quincena que cierra el 31/03.
 *   · DEMASIADO DESPUÉS. Ver ATRASO_MAXIMO.
 *
 * Se devuelve el motivo y NO se usa esa fecha para la caja: un pago fechado en mayo mueve la plata de
 * enero al mes equivocado del Cash Flow Mensual, que es un error silencioso de $4,9M por fila.
 *
 * @returns {string|null} el motivo si es imposible, `null` si la fecha es creíble
 */
export function fechaImposible({ pagado, hasta, pago } = {}) {
  const p = num(pagado)
  if (p === null) return null
  const cierre = num(hasta)
  if (cierre !== null && p < cierre) {
    return `dice pagada el ${isoDeSerial(p)} y la quincena cierra el ${isoDeSerial(cierre)}: no se paga antes de trabajarse`
  }
  const prevista = num(pago) ?? cierre
  if (prevista !== null && p - prevista > ATRASO_MAXIMO) {
    return `dice pagada el ${isoDeSerial(p)}, ${p - prevista} días después de la prevista (${isoDeSerial(prevista)})`
  }
  return null
}

/**
 * NÚCLEO PURO: ¿qué día del extracto explica los `banco` pesos de esta quincena?
 *
 * Devuelve el respaldo sólo si UN día lo explica. Con dos días candidatos no hay forma de saber cuál
 * es —y decir que se pagó de más es el error que rompe una tesorería— así que no empareja y lo dice.
 */
function respaldoDeLote(banco, prevista, lotes, { corte, holgura }) {
  const desde = prevista - holgura
  const hasta = prevista + holgura
  const encontrados = []
  const rechazos = []
  for (const g of lotes.values()) {
    if (g.fecha < desde || g.fecha > hasta) continue
    if (Number.isFinite(corte) && g.fecha > corte) continue
    const c = combinacionUnica(g.importes, banco)
    if (c.unica) encontrados.push({ fecha: g.fecha, filas: c.indices.map((i) => g.filas[i]), motivo: c.motivo })
    else rechazos.push(`${isoDeSerial(g.fecha)}: ${c.motivo} (el día suma ${g.total})`)
  }
  if (encontrados.length === 1) return encontrados[0]
  if (encontrados.length > 1) {
    return { fecha: null, filas: [], motivo: `${encontrados.length} días del extracto lo explican — no empareje` }
  }
  return { fecha: null, filas: [], motivo: rechazos.length ? rechazos.join(' · ') : 'ningún débito de haberes en la ventana' }
}

/**
 * NÚCLEO PURO: el veredicto de UNA quincena, cruzando los dos testigos.
 *
 * @param {{pago:number|null, hasta:number|null, banco:number|null, pagado:number|null}} q el renglón
 * @param {{lotes:Map, corte:number|null, desdeExtracto:number|null, holgura?:number}} ctx
 * @returns {{veredicto:string, fecha:number|null, cubierto:number, filas:number[], motivo:string,
 *            prevista:number|null}}
 */
export function testigoDeQuincena(q = {}, ctx = {}) {
  const imposible = fechaImposible(q)
  // UNA FECHA IMPOSIBLE NO ES UN TESTIGO: se descarta antes de cruzar, o el cruce se haría contra un
  // dato que ya se sabe falso. La quincena se mira como si la columna estuviera vacía.
  const base = veredictoCruzado(imposible ? { ...q, pagado: null } : q, ctx)
  if (!imposible) return base
  // Salvo que el banco la haya probado por su cuenta: esa evidencia no depende de la columna rota.
  if (base.veredicto === VEREDICTO.banco) {
    return { ...base, motivo: `${base.motivo} · ojo con «Pagado el»: ${imposible}` }
  }
  return { ...base, veredicto: VEREDICTO.imposible, fecha: null, cubierto: 0, filas: [], motivo: imposible }
}

/** El cruce en sí, ya con la columna del dueño depurada. Ver `testigoDeQuincena`. */
function veredictoCruzado(q, { lotes = new Map(), corte = null, desdeExtracto = null, holgura = HOLGURA_HABERES } = {}) {
  const prevista = num(q.pago) ?? num(q.hasta)
  const pagado = num(q.pagado)
  const banco = num(q.banco) ?? 0
  const futuro = Number.isFinite(corte) && Number.isFinite(prevista) && prevista - holgura > corte
  const cerrar = (veredicto, extra = {}) => ({
    veredicto, fecha: null, cubierto: 0, filas: [], motivo: '', prevista, ...extra,
  })
  // Sin plata por banco el extracto no puede ser testigo de NADA: no es una falla, es que esta
  // quincena se pagó por adelanto y contra recibo. Se dice, para que no se lea como "el banco dice no".
  if (banco <= 0) {
    if (pagado !== null) return cerrar(VEREDICTO.declarado, { fecha: pagado, motivo: 'la quincena no declara pago por banco: el extracto no puede confirmarla' })
    if (futuro) return cerrar(VEREDICTO.futuro, { motivo: 'todavía no se paga' })
    return cerrar(VEREDICTO.sinBanco, { motivo: 'sin «Pagado el» y sin pago por banco: NINGUNA fuente puede probar si salió' })
  }
  if (Number.isFinite(desdeExtracto) && prevista + holgura < desdeExtracto) {
    return cerrar(pagado !== null ? VEREDICTO.declarado : VEREDICTO.fueraDeVentana,
      { fecha: pagado, motivo: `el extracto empieza el ${isoDeSerial(desdeExtracto)}: no llega a esta fecha` })
  }
  const r = respaldoDeLote(banco, prevista, lotes, { corte, holgura })
  if (r.fecha !== null) {
    const lejos = pagado !== null && Math.abs(pagado - r.fecha) > holgura
    return cerrar(pagado === null ? VEREDICTO.banco : (lejos ? VEREDICTO.contradice : VEREDICTO.conciliado), {
      fecha: r.fecha, cubierto: banco, filas: r.filas,
      motivo: lejos ? `«Pagado el» dice ${isoDeSerial(pagado)} y el banco debitó el ${isoDeSerial(r.fecha)}` : r.motivo,
    })
  }
  if (futuro) return cerrar(VEREDICTO.futuro, { motivo: 'todavía no se paga' })
  if (pagado !== null) return cerrar(VEREDICTO.contradice, { fecha: pagado, motivo: `el dueño la marcó pagada y el banco no la respalda: ${r.motivo}` })
  return cerrar(VEREDICTO.sinTestigo, { motivo: r.motivo })
}
