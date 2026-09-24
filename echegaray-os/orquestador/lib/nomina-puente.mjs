// «NÓMINA» MANDA SOBRE LO PROYECTADO DEL CASH FLOW (dueño, 24/09/2026: «(A) Nómina manda: lo que
// edites es lo que sale en el Cash Flow, en el momento … pero tenés que cablear todo bien»).
//
// ═══ EL PROBLEMA QUE ESTO CIERRA ═══
//
// Había dos proyecciones del mismo gasto. «Nómina» (la pestaña hecha a mano del dueño: sueldo por
// persona y mes, el % en blanco, las cargas por empleado) y el Cash Flow, que proyectaba desde
// «Jornales por Quincena» y «Cargas Sociales». Medido el 24/09: oct $45,8 M contra $41,6 M, nov $45,8 M
// contra $38,2 M. Editar Nómina no movía nada.
//
// ═══ EL CABLE, EN DOS TRAMOS ═══
//
// 1 · EL PUENTE (cuadro 6 de «Nómina», fórmulas del Sheet): por mes, LO QUE FALTA PAGAR de cada línea
//     del Cash Flow — lo del mes según Nómina menos lo que el libro ya tiene como pagado/real de ese
//     mes. Cinco renglones con rango con nombre (`NOMBRES_PUENTE`).
// 2 · EL LIBRO: los renglones PROYECTADOS de esas líneas se escriben en `_MOVIMIENTOS` como FÓRMULA
//     que apunta al puente (`formulaDelPuente`). El Cash Flow Semanal y el Mensual ya son fórmulas sobre
//     `_MOVIMIENTOS`: una edición en Nómina recorre la cadena entera sin esperar la corrida.
//
// Las FECHAS de pago siguen saliendo de donde salían (quincenas, «Se paga el» de Oficina/Dirección,
// vencimientos de Cargas Sociales): Nómina dice CUÁNTO, no CUÁNDO. Lo declarado (DDJJ, boletas), lo
// pagado en Compras y lo que probó el banco no se tocan: el hecho le sigue ganando a la proyección.
//
// ═══ LO QUE NO ES EN EL MOMENTO (declarado, no escondido) ═══
//
// · El aguinaldo: sale de la remuneración que el libro ya emitió, así que sigue a Nómina con la
//   demora de la corrida (cada 2 h).
// · La cantidad de quincenas proyectadas de cada mes la fija la corrida: un mes que Nómina deja en
//   cero y después se sube a mano no tiene renglón hasta la corrida siguiente.
// · La app lee Postgres, que se sincroniza con `_MOVIMIENTOS` en la misma corrida.

/** Los cinco renglones del puente. El libro los lee por NOMBRE, igual que el resto de la nómina. */
export const NOMBRES_PUENTE = Object.freeze({
  jornales: 'NOMINA_CF_JORNALES',
  oficina: 'NOMINA_CF_OFICINA',
  direccion: 'NOMINA_CF_DIRECCION',
  f931: 'NOMINA_CF_F931',
  gremiales: 'NOMINA_CF_GREMIALES',
})

export const ROTULO_PUENTE = '6 · LO QUE VA AL CASH FLOW · LO QUE FALTA PAGAR DE CADA MES'
export const ROTULOS_FILAS_PUENTE = Object.freeze({
  jornales: 'Jornales de obra',
  oficina: 'Oficina',
  direccion: 'Dirección · retiros',
  f931: 'Cargas · F931',
  gremiales: 'Cargas · gremiales',
})

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Un rango con nombre del puente (1 fila × 12 meses) → doce importes. `null` si el rango no se pudo
 * leer o no tiene la forma: el llamador vuelve entonces a la proyección de antes y lo avisa.
 *
 * @param {unknown} valores lo leído con UNFORMATTED_VALUE
 * @returns {Array<number>|null}
 */
export function serieDelPuente(valores) {
  const fila = Array.isArray(valores) ? valores[0] : null
  if (!Array.isArray(fila)) return null
  const serie = Array.from({ length: 12 }, (_, i) => {
    const v = num(fila[i])
    return v === null ? 0 : Math.max(0, Math.round(v * 100) / 100)
  })
  return serie
}

/**
 * La celda de `_MOVIMIENTOS` que lee el puente. Separador `;`: el archivo está en es_AR y una fórmula
 * escrita por la API se interpreta en el locale del archivo.
 *
 * @param {string} nombre uno de `NOMBRES_PUENTE`
 * @param {number} mes 1..12
 * @param {number} [partes] en cuántos renglones se reparte el mes (las quincenas proyectadas)
 */
export function formulaDelPuente(nombre, mes, partes = 1) {
  if (!Object.values(NOMBRES_PUENTE).includes(nombre)) throw new Error(`nomina-puente: rango desconocido ${nombre}`)
  if (!(Number.isInteger(mes) && mes >= 1 && mes <= 12)) throw new Error(`nomina-puente: mes inválido ${mes}`)
  const base = `INDEX(${nombre};1;${mes})`
  return partes > 1 ? `=${base}/${partes}` : `=${base}`
}

/**
 * Dónde está cada cosa en «Nómina», por RÓTULO de la columna A (la pestaña es del dueño: se corre).
 * Devuelve filas 1-based o los rótulos que faltan.
 *
 * @param {Array<Array>} grilla la pestaña desde A1 (sólo importa la columna A)
 */
export function ubicarNomina(grilla = []) {
  const A = grilla.map((r) => String(r?.[0] ?? '').trim())
  const desde = (i0, pred) => { for (let i = i0; i < A.length; i++) if (pred(A[i])) return i; return -1 }
  const falta = []
  const iParam = desde(0, (t) => t === 'Parámetros')
  const iSec1 = desde(0, (t) => /^1 · NÓMINA/i.test(t))
  const iPersona1 = desde(Math.max(0, iSec1), (t) => t === 'Persona')
  const iDesv1 = desde(Math.max(0, iPersona1), (t) => t === 'Desvinculados en el año')
  const iOfi1 = desde(Math.max(0, iDesv1), (t) => t === 'Oficina')
  const iTot1 = desde(Math.max(0, iOfi1), (t) => t === 'TOTAL')
  const iSec2 = desde(Math.max(0, iTot1), (t) => /^2 · CARGAS/i.test(t))
  const iTot2 = desde(Math.max(0, iSec2), (t) => t === 'TOTAL')
  const iDir = desde(0, (t) => t === 'TOTAL DIRECCIÓN')
  const iPuente = desde(0, (t) => t === ROTULO_PUENTE)
  const pares = { 'Parámetros': iParam, '1 · NÓMINA': iSec1, 'Persona (cuadro 1)': iPersona1,
    'Desvinculados en el año (cuadro 1)': iDesv1, 'Oficina (cuadro 1)': iOfi1, 'TOTAL (cuadro 1)': iTot1,
    '2 · CARGAS': iSec2, 'TOTAL (cuadro 2)': iTot2, 'TOTAL DIRECCIÓN': iDir }
  for (const [k, v] of Object.entries(pares)) if (v < 0) falta.push(k)
  if (falta.length) return { falta }
  let ultima = 0
  grilla.forEach((r, i) => { if (Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== '')) ultima = i })
  return {
    falta: [],
    filaParametros: iParam + 2, // los valores van en la fila de abajo del rótulo «Parámetros»
    filaEncabezado: iPersona1 + 1,
    primeraPersona: iPersona1 + 2,
    ultimaPersona: iDesv1, // la fila anterior a «Desvinculados»
    filaOficina: iOfi1 + 1,
    filaTotal: iTot1 + 1,
    filaTotalCargas: iTot2 + 1,
    filaDireccion: iDir + 1,
    filaPuente: iPuente >= 0 ? iPuente + 1 : null,
    ultimaUsada: ultima + 1,
  }
}

const COLS_MES = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']

/**
 * El cuadro 6, fórmula por fórmula. Todo apunta a celdas de la misma pestaña (el Sheet corrige las
 * referencias si el dueño inserta filas) o a rangos con nombre de «Jornales por Quincena».
 *
 * Por línea, mes m (columna X):
 * · Jornales = TOTAL − Oficina (todo el cuadro 1 menos oficina: obreros, jefes y desvinculados) menos
 *   las quincenas reales cuyo «Hasta» cae en m. Lo que queda lo reparten las quincenas proyectadas.
 * · Oficina / Dirección = lo del mes menos lo PAGADO de ese mes en «Jornales por Quincena».
 * · Cargas: el TOTAL del cuadro 2 (devengado del mes) se parte en F931 y gremiales con las MISMAS
 *   alícuotas de la fila de parámetros: F931 = aportes + contribuciones SS y OS + ART (+ el seguro de
 *   vida, que es fijo por empleado); gremiales = UOCRA vida/FICS + fondo de cese (+ IERIC y FODECO
 *   sobre él). El total es el de Nómina al peso; la partición sólo decide en qué línea cae.
 *
 * @param {ReturnType<typeof ubicarNomina>} u
 * @param {{anio?:number}} [o]
 * @returns {{filas:Array<Array<string>>, rotulos:Array<string>}}
 */
export function cuadroPuente(u, { anio = 2026 } = {}) {
  const p = u.filaParametros
  const $ = (col) => `$${col}$${p}`
  const personas = (X) => `${X}$${u.primeraPersona}:${X}$${u.ultimaPersona}`
  const filaTit = []
  const filaEnc = ['Concepto', '', '', ...COLS_MES.map((X) => `=${X}$${u.filaEncabezado}`), 'TOTAL']
  const orden = ['jornales', 'oficina', 'direccion', 'f931', 'gremiales']
  // La fila de F931 dentro del cuadro: la de gremiales la necesita (total − F931).
  const base = (u.filaPuente ?? (u.ultimaUsada + 3))
  const filaDe = (k) => base + 2 + orden.indexOf(k)
  const f = {
    jornales: (X, m) => `=MAX(0;N(${X}$${u.filaTotal})-N(${X}$${u.filaOficina})-SUMPRODUCT(IFERROR((MONTH(JORNALES_REAL_HASTA)=${m})*(YEAR(JORNALES_REAL_HASTA)=${anio})*JORNALES_REAL_TOTAL;0)))`,
    oficina: (X, m) => `=MAX(0;N(${X}$${u.filaOficina})-N(INDEX(OFICINA_PAGADO;${m};1)))`,
    direccion: (X, m) => `=MAX(0;N(${X}$${u.filaDireccion})-N(INDEX(DIRECCION_PAGADO;${m};1)))`,
    f931: (X) => `=LET(t;N(${X}$${u.filaTotalCargas});s;${$('H')}*COUNTIF(${personas(X)};">0");`
      + `rf;${$('D')}+${$('E')}+${$('F')}+${$('G')};`
      + `rg;${$('I')}+(CARGAS_PROPORCION_PRIMER_ANIO*${$('J')}+(1-CARGAS_PROPORCION_PRIMER_ANIO)*${$('K')})*(1+${$('L')}+${$('M')});`
      + 'IF(t<=0;0;MIN(t;(t-s)*rf/(rf+rg)+s)))',
    gremiales: (X) => `=MAX(0;N(${X}$${u.filaTotalCargas})-N(${X}${filaDe('f931')}))`,
  }
  filaTit.push(ROTULO_PUENTE)
  const filas = [filaTit, filaEnc]
  for (const k of orden) {
    const fila = base + 2 + orden.indexOf(k)
    filas.push([ROTULOS_FILAS_PUENTE[k], '', '', ...COLS_MES.map((X, i) => f[k](X, i + 1)), `=SUM(D${fila}:O${fila})`])
  }
  return { filas, filaInicio: base, filaDe, orden }
}
