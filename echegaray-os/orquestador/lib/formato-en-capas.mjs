// EL FORMATO SE PINTA EN CAPAS, Y SÓLO SE PUEDE JUZGAR APLICÁNDOLAS EN ORDEN.
//
// ═══ POR QUÉ EXISTE (14/08/2026) ═══
//
// El defecto de `OBRAS!F` —`17449303,3143` publicado crudo donde iba `$17.449.303`— no se veía en
// ningún request mirado de a uno. Cada `repeatCell` era correcto por separado: el contrato de columnas
// pintaba moneda sobre la columna entera, y doscientas líneas más abajo el olfateador de contenido
// pintaba TEXTO sobre esa misma celda. Gana el último. Un test que mira "¿pedí moneda para la columna
// F?" da verde con la pestaña rota en la pantalla.
//
// Lo único que dice la verdad es el ESTADO FINAL: aplicar los requests como los aplica Google —en
// orden, respetando el `fields` de cada uno— y recién entonces preguntar qué formato le quedó a cada
// celda. Eso es lo que hace este módulo, sin red y sin escribir una celda.
//
// ═══ Y LA SEGUNDA CORRIDA IMPORTA MÁS QUE LA PRIMERA ═══
//
// El formato de número es ESTADO: `estilo-pestana.reset()` repone fondo, fuente, alineación y ajuste,
// y a propósito NO repone `numberFormat`. Una celda que ninguna capa nombra se queda con lo que le
// dejó la corrida ANTERIOR. Así se rompió `Vencido`: la corrida que publicó el guion literal "—" la
// marcó TEXTO, y la corrida siguiente le puso un importe adentro sin que nadie repusiera el formato.
// Por eso `pintar` acepta un lienzo INICIAL: la corrida N+1 se simula sobre lo que dejó la N.

/**
 * ¿Qué paths toca este `fields`? Google acepta `a.b`, `a(b,c)` y `a` (que reemplaza `a` ENTERO,
 * borrando lo que el request no trae). Esa última forma es la que borra formatos sin que nadie lo pida.
 * @param {string} fields
 * @returns {{todo: boolean, numberFormat: boolean}}
 */
export function alcanceDeFields(fields = '') {
  const f = String(fields)
  if (!f) return { todo: false, numberFormat: false }
  const partes = f.split(',').map((s) => s.trim())
  const todo = partes.includes('userEnteredFormat') || partes.includes('*')
  const numberFormat = todo
    || /userEnteredFormat\.numberFormat\b/.test(f)
    || /userEnteredFormat\(([^)]*)\)/.exec(f)?.[1]?.split(',').map((s) => s.trim()).includes('numberFormat') === true
  return { todo, numberFormat }
}

/**
 * EL LIENZO: el `numberFormat.type` que le queda a cada celda después de aplicar los requests EN ORDEN.
 *
 * `null` significa "nadie la pintó en esta corrida" — que no es lo mismo que "no tiene formato": es
 * que hereda el de la corrida anterior. Por eso el valor heredado entra por `inicial`.
 *
 * @param {object[]} requests los del batch, en el orden en que se mandan
 * @param {{alto:number, ancho:number, inicial?:(string|null)[][]}} dim
 * @returns {(string|null)[][]} `alto` × `ancho`
 */
export function pintar(requests = [], { alto = 0, ancho = 0, inicial = null } = {}) {
  const lienzo = Array.from({ length: alto }, (_, i) => Array.from({ length: ancho },
    (_, j) => inicial?.[i]?.[j] ?? null))
  for (const q of requests) {
    const rc = q?.repeatCell
    if (!rc) continue
    const { todo, numberFormat } = alcanceDeFields(rc.fields)
    if (!numberFormat && !todo) continue
    const tipo = rc.cell?.userEnteredFormat?.numberFormat?.type ?? null
    const r0 = Math.max(0, rc.range?.startRowIndex ?? 0)
    const r1 = Math.min(alto, rc.range?.endRowIndex ?? alto)
    const c0 = Math.max(0, rc.range?.startColumnIndex ?? 0)
    const c1 = Math.min(ancho, rc.range?.endColumnIndex ?? ancho)
    for (let f = r0; f < r1; f++) for (let c = c0; c < c1; c++) lienzo[f][c] = tipo
  }
  return lienzo
}

/** Los formatos que dibujan un número como número. TEXT dibuja el crudo: `17449303,3143`. */
const DE_NUMERO = new Set(['CURRENCY', 'NUMBER', 'PERCENT', 'DATE', 'DATE_TIME', 'TIME', 'SCIENTIFIC'])

/** Las funciones que sólo devuelven números. Cortas y de aritmética: si la lista se estira a `INDEX`,
 *  `VLOOKUP` o `LET` empieza a acusar rótulos —el "Top 5 por contraparte" del anexo es un INDEX que
 *  devuelve un NOMBRE— y un auditor que grita de más se termina apagando. */
const SOLO_NUMERO = /^(SUM|SUMIFS?|SUMPRODUCT|COUNTA?|COUNTIFS?|ROUND|ROUNDUP|ROUNDDOWN|ABS|MIN|MAX|MINIFS|MAXIFS|AVERAGE|VALUE|DATE|TODAY|NOW|EOMONTH|DATEVALUE|DAYS?|MONTH|YEAR)\s*\(/i
/** Un `IFERROR` no dice nada por sí mismo: lo que decide es su PRIMER argumento, que es el resultado.
 *  `IF` no está —y es a propósito—: su primer argumento es la CONDICIÓN, y las dos ramas suelen ser
 *  frases ("▲ Sin arqueo cargado…"). Contarlo como número acusaba cinco veredictos de CAJA que son
 *  texto puro. Ante la duda no se acusa: un auditor con falsos positivos se termina apagando. */
const ENVOLTORIO = /^(IFERROR|IFNA)\s*\(/i

/**
 * ¿La celda devuelve un NÚMERO? Un número tipeado, o una fórmula que hace aritmética.
 *
 * NO se pretende evaluar la fórmula —para eso haría falta Sheets—: se pretende no dejar pasar la clase
 * de fórmula que devuelve plata o un conteo, que es donde el defecto se ve. Una fórmula de texto
 * (`=A1&" · "&B1`, `TEXTJOIN`, `IF(...;"—";"")`) no cuenta, y por eso NO alcanza con `startsWith('=')`.
 *
 * EL CRITERIO FUERTE ES EL OPERADOR, NO EL NOMBRE DE LA FUNCIÓN. En Sheets `+ − * /` son SIEMPRE
 * aritmética (el texto se pega con `&`), así que una fórmula con uno de ellos afuera de todo paréntesis
 * y afuera de toda comilla devuelve un número. Eso alcanza para `=CAJA_TOTAL_DISPONIBLE+SUMPRODUCT(…)`,
 * que ninguna lista de nombres iba a atrapar.
 */
export function devuelveNumero(v) {
  if (typeof v === 'number') return true
  if (typeof v !== 'string' || !v.startsWith('=')) return false
  const cuerpo = v.slice(1).trimStart()
  if (aritmeticaEnLaRaiz(cuerpo)) return true
  if (SOLO_NUMERO.test(cuerpo)) return true
  if (ENVOLTORIO.test(cuerpo)) {
    const dentro = cuerpo.slice(cuerpo.indexOf('(') + 1).trimStart()
    return SOLO_NUMERO.test(dentro) || aritmeticaEnLaRaiz(dentro)
  }
  return false
}

/** ¿Hay un operador aritmético en el nivel de afuera? Se saltean comillas y paréntesis. */
function aritmeticaEnLaRaiz(f = '') {
  let nivel = 0; let comilla = null
  for (let i = 0; i < f.length; i++) {
    const c = f[i]
    if (comilla) { if (c === comilla) comilla = null; continue }
    if (c === '"' || c === "'") { comilla = c; continue }
    if (c === '(') { nivel++; continue }
    if (c === ')') { nivel--; continue }
    if (nivel > 0 || i === 0) continue
    // Un signo pegado a `(`, `;` o `,` es unario (`=-A1` ya entró por i===0): no hace aritmética.
    if ('+-*/'.includes(c) && !'(;,+-*/'.includes(f[i - 1]?.trim() || f[i - 1])) return true
  }
  return false
}

/**
 * EL AUDITOR: qué celda con NÚMERO adentro quedaría dibujada como texto (o sin formato ninguno).
 *
 * Es la pregunta que el dueño hace mirando la pantalla —"¿por qué dice 17449303,3143?"— traducida a
 * algo que se pone rojo antes de escribir.
 *
 * @param {any[][]} filas la grilla del generador
 * @param {(string|null)[][]} lienzo la salida de `pintar`
 * @returns {{fila:number, col:number, formato:string|null, valor:string}[]} fila 1-based, col 0-based
 */
export function numerosDibujadosComoTexto(filas = [], lienzo = []) {
  const out = []
  filas.forEach((fila, i) => (fila || []).forEach((v, j) => {
    if (!devuelveNumero(v)) return
    const t = lienzo?.[i]?.[j] ?? null
    if (t && DE_NUMERO.has(t)) return
    out.push({ fila: i + 1, col: j, formato: t, valor: String(v).slice(0, 70) })
  }))
  return out
}

/** La referencia A1 de una celda, para que el rojo del test se pueda ir a mirar a la pestaña. */
export function a1(fila, col) {
  let s = ''
  for (let n = col; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return `${s}${fila}`
}
