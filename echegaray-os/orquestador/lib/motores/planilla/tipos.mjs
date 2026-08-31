// EL TIPO DE UNA CELDA. NÚCLEO PURO, cero I/O.
//
// ═══ POR QUÉ UN MOTOR DE PLANILLAS NECESITA TIPOS PROPIOS ═══
//
// Una planilla no tiene tipos: tiene lo que Google decidió mostrar. La MISMA celda vale
// `"31/08/2026"`, `46265` o `"46265"` según con qué `valueRenderOption` se la lea, y las tres son
// respuestas correctas de la API a preguntas distintas. Sin una noción propia de tipo, cada script
// del repo elige su render y después adivina qué recibió — y adivina mal en los bordes que cuestan
// plata.
//
// ═══ LAS DOS TRAMPAS QUE ESTE ARCHIVO CIERRA ═══
//
// 1. LA FECHA dd/mm/yy. Leída con `FORMATTED_VALUE`, "05/08/26" es una cadena que un parser
//    JavaScript resuelve como 5 de agosto de 2026 o como 8 de mayo de 2026 según de dónde venga —y
//    `new Date("05/08/26")` en Node elige MM/DD, que es el mes equivocado para toda la Argentina—.
//    En este repo un parser así vació una columna de fechas entera. La regla es leer
//    `UNFORMATTED_VALUE` y recibir el SERIAL, que no tiene ambigüedad posible; `parsearFechaEsAr`
//    existe sólo para el texto que ya llegó formateado y no se puede releer.
//
// 2. EL NÚMERO ES-AR. "1.234,56" es mil doscientos treinta y cuatro con cincuenta y seis. Leído a
//    la inglesa es 1,23456. Y "1234.56" leído a la argentina son ciento veintitrés mil. Los dos
//    errores son silenciosos: dan un número, no un error.

/** Los tipos que el motor distingue. `formula` y `error` son tipos de CELDA, no de valor. */
export const TIPOS = Object.freeze({
  VACIO: 'vacio',
  NUMERO: 'numero',
  TEXTO: 'texto',
  FECHA: 'fecha',
  BOOLEANO: 'booleano',
  FORMULA: 'formula',
  ERROR: 'error',
})

/** Los valores de error que Sheets devuelve como TEXTO. Español e inglés: el mismo archivo puede
 *  devolver `#¡DIV/0!` o `#DIV/0!` según el idioma con que se lo lea. */
export const ERRORES_SHEET = Object.freeze([
  '#REF!', '#ERROR!', '#N/A', '#VALUE!', '#¡VALOR!', '#DIV/0!', '#¡DIV/0!',
  '#NAME?', '#¿NOMBRE?', '#NUM!', '#¡NUM!', '#NULL!', '#GETTING_DATA',
])

/** ¿Este valor es un error de Sheets? Se compara en mayúsculas porque `#n/a` llega así de algunos
 *  renders, y NUNCA por "empieza con #": `#1 Proveedor` es un texto legítimo. */
export function esErrorSheet(v) {
  if (typeof v !== 'string') return false
  const s = v.trim().toUpperCase()
  return ERRORES_SHEET.some((e) => e.toUpperCase() === s)
}

/** El día 0 del calendario de Sheets: 30/12/1899. Todo serial se mide desde ahí, en UTC. */
const EPOCA = Date.UTC(1899, 11, 30)

/** Serial de Sheets → Date en UTC. `45900.5` = ese día al mediodía. */
export function serialAFecha(n) {
  if (!Number.isFinite(n)) return null
  return new Date(EPOCA + Math.round(n * 86400000))
}

/** Date → serial de Sheets. Inversa de `serialAFecha`. */
export function fechaASerial(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  return (d.getTime() - EPOCA) / 86400000
}

/**
 * Una fecha escrita a la argentina → Date UTC. Acepta dd/mm/yyyy y dd/mm/yy.
 *
 * El año de dos dígitos se resuelve con la ventana 1970–2069, que es la de Sheets y la de Excel: 26
 * es 2026, 85 es 1985. Elegir "siempre 20xx" haría que un DNI viejo o una fecha de nacimiento
 * cayeran en el futuro sin avisar.
 *
 * Devuelve `null` ante cualquier cosa que no sea una fecha válida — incluido "31/02/2026", que
 * parsea sintácticamente y no existe. Un parser que devuelve el 3 de marzo ante un 31 de febrero
 * corrige en silencio un dato mal cargado.
 */
export function parsearFechaEsAr(s) {
  const m = /^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\s*$/.exec(String(s ?? ''))
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  let anio = Number(m[3])
  if (m[3].length === 2) anio = anio < 70 ? 2000 + anio : 1900 + anio
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  // La vuelta atrás es la que detecta el 31/02: Date lo normaliza a marzo y acá se ve.
  if (d.getUTCDate() !== dia || d.getUTCMonth() !== mes - 1 || d.getUTCFullYear() !== anio) return null
  return d
}

/**
 * Un número escrito a la argentina → Number. "1.234,56" → 1234.56.
 *
 * Sólo acepta la forma es-AR sin ambigüedad. "1.234" es MIL DOSCIENTOS TREINTA Y CUATRO en es-AR y
 * 1,234 en inglés: como no hay forma de saber cuál quiso decir quien lo escribió, se devuelve
 * `null` y lo resuelve el llamador con contexto. Adivinar acá es cómo un importe se multiplica por
 * mil sin que nadie lo note.
 */
export function parsearNumeroEsAr(s) {
  const t = String(s ?? '').trim().replace(/^\$\s*/, '').replace(/\s/g, '')
  if (!t) return null
  if (/^-?\d+(\.\d{3})+$/.test(t)) return null // "1.234": ambiguo, no se adivina
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * El tipo de una celda tal como vino de la API.
 *
 * @param {unknown} v el valor leído
 * @param {{formula?: string|null}} [ctx] la fórmula de esa celda, si se la leyó aparte
 */
export function tipoDe(v, ctx = {}) {
  if (ctx.formula) return TIPOS.FORMULA
  if (v === null || v === undefined || v === '') return TIPOS.VACIO
  if (typeof v === 'boolean') return TIPOS.BOOLEANO
  if (typeof v === 'number') return Number.isFinite(v) ? TIPOS.NUMERO : TIPOS.ERROR
  const s = String(v).trim()
  if (esErrorSheet(s)) return TIPOS.ERROR
  if (s.startsWith('=')) return TIPOS.FORMULA
  if (/^(TRUE|FALSE|VERDADERO|FALSO)$/i.test(s)) return TIPOS.BOOLEANO
  if (parsearFechaEsAr(s)) return TIPOS.FECHA
  if (parsearNumeroEsAr(s) !== null) return TIPOS.NUMERO
  return TIPOS.TEXTO
}

/**
 * ¿El valor sirve para una columna de este tipo?
 *
 * `vacio` es compatible con todo a propósito: una celda sin dato no es un dato del tipo equivocado,
 * y tratarla como violación convierte cada tabla con huecos en un muro de falsos positivos. Lo que
 * se detecta es lo contrario: un TEXTO en una columna de importes, que es lo que rompe un SUMIFS
 * sin dar error.
 */
export function coincideTipo(v, esperado, ctx = {}) {
  const t = tipoDe(v, ctx)
  if (t === TIPOS.VACIO) return true
  if (t === esperado) return true
  // Una fórmula puede producir cualquier tipo: su resultado se verifica leyendo el valor, no acá.
  if (t === TIPOS.FORMULA) return true
  // Una fecha ES un número en Sheets; el revés no vale (no todo número es una fecha).
  if (esperado === TIPOS.NUMERO && t === TIPOS.FECHA) return true
  return false
}

/**
 * Revisa una grilla contra un esquema de columnas y devuelve las celdas que NO cumplen.
 *
 * Devuelve la lista, no un booleano: el llamador necesita saber CUÁLES para poder mostrarlas o
 * corregirlas. Un `false` obliga a recorrer todo de nuevo para averiguar dónde.
 *
 * @param {any[][]} grid
 * @param {(string|null)[]} esquema un tipo por columna; `null` = esa columna no se controla
 * @returns {{fila:number, col:number, esperado:string, recibido:string, valor:unknown}[]}
 */
export function validarTipos(grid, esquema = []) {
  const malas = []
  for (let f = 0; f < (grid?.length ?? 0); f++) {
    for (let c = 0; c < esquema.length; c++) {
      const esperado = esquema[c]
      if (!esperado) continue
      const v = grid[f]?.[c]
      if (coincideTipo(v, esperado)) continue
      malas.push({ fila: f, col: c, esperado, recibido: tipoDe(v), valor: v })
    }
  }
  return malas
}
