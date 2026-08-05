// `_PRESUPUESTO_MENSUAL` — LA ÚNICA PESTAÑA DE CAPTURA DEL CASH FLOW.
//
// ═══ POR QUÉ EXISTE (05/08/2026) ═══
//
// El Cash Flow Mensual tiene que mostrar la variación de cada mes contra el presupuesto, y el
// presupuesto NO EXISTÍA como fuente en ninguna parte del archivo ni del OS. Las dos salidas malas
// eran: inventarlo (prohibido por la regla de oro 1) o dibujar una variación contra un cero, que es lo
// mismo pero disfrazado de número. La salida buena es darle un lugar donde el dueño lo cargue.
//
// ═══ LAS DOS REGLAS QUE GOBIERNAN ESTA PESTAÑA ═══
//
// 1. EL GENERADOR LA CREA VACÍA Y NUNCA PISA LO TIPEADO. Doble seguro, porque acá una pérdida es
//    trabajo del dueño y no un cuadro que se recalcula solo:
//      · las celdas de carga se escriben como cadena vacía —"no es mía"— y la fusión de
//        preservar-anotaciones las conserva;
//      · y además se RESCATA lo que ya había antes de escribir, buscando cada mes POR SU FECHA y no
//        por número de fila (si mañana el bloque se corre, el dato viaja con él — el defecto que en
//        CAJA dejó el arqueo en $0 cuando su bloque bajó cuatro filas).
// 2. UN MES SIN CARGAR NO ES UN MES EN CERO. La vista distingue las dos cosas: mientras las dos celdas
//    estén vacías, la variación de ese mes muestra "—". Cero es un presupuesto de cero, y eso lo
//    decide el dueño escribiéndolo.

/** Dónde vive. El prefijo `_` la agrupa con las auxiliares, pero NO se oculta: acá se escribe a mano. */
export const PESTANA_PRESUPUESTO = '_PRESUPUESTO_MENSUAL'

/** Los rangos con nombre que publica. El nombre es el contrato con el Cash Flow Mensual. */
export const NOMBRES = Object.freeze({
  meses: 'PRESUPUESTO_MESES',
  ingresos: 'PRESUPUESTO_INGRESOS',
  egresos: 'PRESUPUESTO_EGRESOS',
})

/** Las cuatro columnas: mes, las dos de carga, y la nota del dueño. */
export const ANCHO_PRESUPUESTO = 4
/** La primera fila de datos (1 título, 2 subtítulo, 3 blanco, 4 encabezado). */
export const FILA0 = 5

const MESES_AR = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const rotulo = (d) => `${MESES_AR[d.getUTCMonth()][0].toUpperCase()}${MESES_AR[d.getUTCMonth()].slice(1)} ${d.getUTCFullYear()}`
const fechaAR = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`

/**
 * NÚCLEO PURO: de qué mes habla una celda de la columna A, venga como serial o como texto.
 *
 * Se aceptan las DOS formas a propósito: `readSheetValues` devuelve el serial con
 * `UNFORMATTED_VALUE` y "1/8/2026" sin él, y de qué modo se leyó no puede decidir si el dueño pierde
 * lo que cargó. Devuelve 'YYYY-MM' o null.
 */
export function mesDeCelda(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial de Sheets: días desde el 30/12/1899, en UTC para que no dependa del huso del proceso.
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, '0')}`
  // "Agosto 2026", por si alguien reescribió la columna a mano con el nombre del mes.
  const t = s.toLowerCase().match(/^([a-záéíóúñ]+)\s+(\d{4})$/)
  if (t) {
    const i = MESES_AR.indexOf(t[1])
    if (i >= 0) return `${t[2]}-${String(i + 1).padStart(2, '0')}`
  }
  return null
}

/**
 * NÚCLEO PURO: lo que el dueño ya cargó, rescatado antes de reescribir.
 *
 * @param {any[][]} filas la pestaña tal como está hoy (valores o fórmulas, da igual: se re-escriben)
 * @returns {Map<string, {ingresos:any, egresos:any, nota:any}>} indexado por 'YYYY-MM'
 */
export function rescatarPresupuesto(filas = []) {
  const cargado = new Map()
  for (const f of filas) {
    const mes = mesDeCelda(f?.[0])
    if (!mes) continue
    const v = (i) => { const c = f?.[i]; return c === undefined || c === null ? '' : c }
    cargado.set(mes, { ingresos: v(1), egresos: v(2), nota: v(3) })
  }
  return cargado
}

/**
 * NÚCLEO PURO: la grilla de la pestaña, con lo cargado adentro.
 *
 * @param {object} p
 * @param {number} p.anio
 * @param {Map<string, {ingresos:any, egresos:any, nota:any}>} [p.cargado] lo rescatado de la pestaña
 * @returns {{filas:any[][], destinos:Array<{name:string, fila:number, col:number, filaFin?:number}>, cargados:number}}
 */
export function grillaPresupuesto({ anio = 2026, cargado = new Map() } = {}) {
  const meses = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(anio, m, 1)))
  const filas = [
    [`Presupuesto mensual ${anio} — lo que se espera cobrar y pagar cada mes`],
    ['Lo escribe el dueño. El Cash Flow Mensual compara cada mes contra estas dos cifras', '', '', `Ejercicio ${anio}`],
    [],
    ['Mes', 'Ingresos presupuestados', 'Egresos presupuestados', 'Nota'],
  ]
  let cargados = 0
  for (const m of meses) {
    const clave = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`
    const c = cargado.get(clave) ?? { ingresos: '', egresos: '', nota: '' }
    if (c.ingresos !== '' || c.egresos !== '') cargados++
    // La columna A la escribe el generador (es la clave de búsqueda); B, C y D son del dueño y por eso
    // se devuelven tal cual vinieron. Una cadena vacía acá significa "no es mía": la fusión la preserva.
    filas.push([fechaAR(m), c.ingresos, c.egresos, c.nota])
  }
  // Los tres nombres cubren un BLOQUE de doce filas (una por mes), no una celda: `filas: 12`. Y NO son
  // abiertos a propósito — un rango abierto acá dejaría entrar cualquier cosa que alguien escriba
  // debajo de diciembre, y el MATCH del Mensual la tomaría como un mes más.
  const destinos = [
    { name: NOMBRES.meses, fila: FILA0, col: 1, filas: 12 },
    { name: NOMBRES.ingresos, fila: FILA0, col: 2, filas: 12 },
    { name: NOMBRES.egresos, fila: FILA0, col: 3, filas: 12 },
  ]
  return { filas, destinos, cargados, rotulos: meses.map(rotulo) }
}

/**
 * Los requests de formato. La única pestaña del archivo donde el AMARILLO significa algo: "escribí acá".
 *
 * Es la convención del checklist de clase mundial —los inputs se distinguen visualmente de las
 * fórmulas— y acá es literal: todo lo que está en amarillo lo llena una persona, todo lo demás es del
 * OS. Sin esa marca, el día que alguien vea la pestaña vacía va a suponer que está rota.
 */
export function formatoPresupuesto(sheetId, { filas = 16 } = {}) {
  const AMARILLO = { red: 1, green: 0.976, blue: 0.878 }
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const fuente = (o = {}) => ({ fontFamily: 'Arial', fontSize: 10, foregroundColor: INK, ...o })
  const rango = (f0, f1, c0, c1) => ({ sheetId, startRowIndex: f0, endRowIndex: f1, startColumnIndex: c0, endColumnIndex: c1 })
  return [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 4 } }, fields: 'gridProperties(hideGridlines,frozenRowCount)' } },
    { repeatCell: { range: rango(0, filas, 0, ANCHO_PRESUPUESTO), cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: fuente() } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: rango(0, 1, 0, 1), cell: { userEnteredFormat: { textFormat: fuente({ bold: true, fontSize: 15 }) } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rango(1, 2, 0, ANCHO_PRESUPUESTO), cell: { userEnteredFormat: { textFormat: fuente({ fontSize: 9, foregroundColor: MUTED }) } }, fields: 'userEnteredFormat.textFormat' } },
    { repeatCell: { range: rango(3, 4, 0, ANCHO_PRESUPUESTO), cell: { userEnteredFormat: { textFormat: fuente({ bold: true, fontSize: 9, foregroundColor: MUTED }) } }, fields: 'userEnteredFormat.textFormat' } },
    { updateBorders: { range: rango(3, 4, 0, ANCHO_PRESUPUESTO), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
    { repeatCell: { range: rango(FILA0 - 1, filas, 0, 1), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mmmm yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } },
    // Las dos columnas de carga: amarillas, con formato de moneda y el "—" del cero (que acá se lee
    // como "todavía no lo cargué", que es justamente lo que significa).
    {
      repeatCell: {
        range: rango(FILA0 - 1, filas, 1, 3),
        cell: { userEnteredFormat: { backgroundColor: AMARILLO, numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;("$"#,##0);"—"' }, horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat(backgroundColor,numberFormat,horizontalAlignment)',
      },
    },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 190 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 320 }, fields: 'pixelSize' } },
  ]
}
