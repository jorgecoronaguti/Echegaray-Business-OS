// EVALUADOR MÍNIMO DE FÓRMULAS — UN INSTRUMENTO DE PRUEBA, NO UN MOTOR DE CÁLCULO.
//
// POR QUÉ EXISTE (13/08/2026). Los generadores de este repo no escriben números: escriben FÓRMULAS.
// Lo que el dueño lee no lo calculó el código, lo calculó Google con lo que el código dejó escrito.
// Un test de cadena prueba que la fórmula TIENE LA FORMA esperada —y así se atrapa una coma donde va
// un punto y coma— pero no puede ver que un promedio divide por el número equivocado. El defecto que
// motivó este archivo era justamente ése: el promedio de Recurrentes metía el mes EN CURSO, todavía
// incompleto, en el divisor, y el "esperado" de los meses futuros BAJABA cuando entraba una factura.
// Ninguna aserción de texto lo ve; una evaluación con datos sí.
//
// Y NO SE PUEDE MEDIR CONTRA EL ARCHIVO VIVO: correr un generador contra el Sheet real para
// verificarlo ya borró trabajo del dueño tres veces, y desde un worktree la guarda falla cerrada y
// borra la pestaña entera. Así que la fórmula se evalúa acá, en frío, con los datos que pone el test.
//
// LO QUE NO ES. No lo usa ningún generador, ninguna capacidad y ninguna pantalla: no hay ningún
// número de la empresa que salga de acá. Cubre EXACTAMENTE el subconjunto que las pestañas escriben
// —comparaciones, aritmética elemento a elemento, SUM/SUMPRODUCT/MAX/IF/IFERROR/EOMONTH— y cualquier
// otra función revienta RUIDOSA en vez de devolver un número inventado. Un evaluador que "hace lo
// que puede" con lo que no entiende sería peor que no tenerlo: haría pasar tests que no probaron nada.
//
// UNA REFERENCIA A OTRA PESTAÑA ES UN ERROR DE HOJA, NO UNA EXCEPCIÓN. El test modela una pestaña
// sola; lo que apunta afuera (Compras, Parámetros) se comporta como #REF!, que es lo que un IFERROR
// del generador ya está preparado para absorber. Así el factor de inflación de Parámetros cae en su
// propio valor por defecto —1— sin que el test tenga que reproducir esa tabla.

/** Un error DE LA HOJA (#REF!, #DIV/0!): es lo único que IFERROR absorbe. */
export class ErrorHoja extends Error {}

// El serial de Sheets: días desde el 30/12/1899. Las fechas del encabezado se comparan como números.
const EPOCH = Date.UTC(1899, 11, 30)
const DIA = 86400000
export const aSerial = (d) => Math.round((d.getTime() - EPOCH) / DIA)
const aFecha = (s) => new Date(EPOCH + Math.round(s) * DIA)

const TOKEN = new RegExp('^(?:'
  + '(\\d+(?:\\.\\d+)?)'                                                       // 1 número
  + '|("(?:[^"])*")'                                                           // 2 texto
  // 3 ref/rango — el prefijo de pestaña va entre comillas simples cuando el nombre tiene espacios,
  // que es como lo escribe todo generador de este repo ('Cheques Emitidos'!$M$27:$M$400).
  + '|((?:\'[^\']+\'!|[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_ ]*!)?\\$?[A-Z]{1,3}\\$?\\d+(?::\\$?[A-Z]{1,3}\\$?\\d*)?)'
  + '|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*)\\s*\\('                                  // 4 función
  + '|(<=|>=|<>|[-+*/<>=;()&])'                                                // 5 operador
  + ')')

/** NÚCLEO PURO: la fórmula partida en piezas. Lo que no reconoce, revienta. */
export function tokenizar(formula) {
  let s = String(formula).replace(/^=/, '')
  const out = []
  while (s.trim()) {
    s = s.trimStart()
    const m = TOKEN.exec(s)
    if (!m) throw new Error(`evaluar-formula-sheet: no entiendo "${s.slice(0, 24)}…"`)
    if (m[1]) out.push({ t: 'num', v: Number(m[1]) })
    else if (m[2]) out.push({ t: 'str', v: m[2].slice(1, -1) })
    else if (m[3]) out.push({ t: 'ref', v: m[3] })
    else if (m[4]) out.push({ t: 'fn', v: m[4].toUpperCase() })
    else out.push({ t: 'op', v: m[5] })
    s = s.slice(m[0].length)
  }
  return out
}

/** NÚCLEO PURO: los tokens en un árbol, con la precedencia de Sheets (la comparación es la más floja). */
export function parsear(tokens) {
  let i = 0
  const ver = () => tokens[i]
  const comer = (v) => {
    const t = tokens[i]
    if (!t || t.v !== v) throw new Error(`evaluar-formula-sheet: esperaba "${v}" y vino "${t?.v ?? 'el final'}"`)
    i++
  }
  const nivel = (ops, siguiente) => () => {
    let a = siguiente()
    while (ver()?.t === 'op' && ops.includes(ver().v)) { const op = tokens[i++].v; a = { k: 'bin', op, a, b: siguiente() } }
    return a
  }
  const primario = () => {
    const t = tokens[i]
    if (!t) throw new Error('evaluar-formula-sheet: la fórmula se corta')
    if (t.t === 'num' || t.t === 'str') { i++; return { k: t.t, v: t.v } }
    if (t.t === 'ref') { i++; return { k: 'ref', v: t.v } }
    if (t.t === 'fn') {
      i++ // el token de función YA se comió su paréntesis de apertura: viene pegado al nombre
      const args = []
      if (ver()?.v !== ')') { args.push(expr()); while (ver()?.v === ';') { i++; args.push(expr()) } }
      comer(')')
      return { k: 'fn', n: t.v, args }
    }
    if (t.v === '(') { i++; const e = expr(); comer(')'); return e }
    throw new Error(`evaluar-formula-sheet: token inesperado "${t.v}"`)
  }
  const unario = () => {
    if (ver()?.t === 'op' && (ver().v === '-' || ver().v === '+')) { const op = tokens[i++].v; const a = unario(); return op === '-' ? { k: 'neg', a } : a }
    return primario()
  }
  const mul = nivel(['*', '/'], unario)
  const suma = nivel(['+', '-'], mul)
  const concat = nivel(['&'], suma)
  const expr = nivel(['<', '>', '=', '<=', '>=', '<>'], concat)
  const arbol = expr()
  if (i < tokens.length) throw new Error(`evaluar-formula-sheet: sobra "${tokens[i].v}"`)
  return arbol
}

const num = (v) => {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === '' || v === null || v === undefined) return 0
  throw new ErrorHoja(`#VALUE! — "${v}" no es un número`)
}
const plano = (vs) => vs.flatMap((v) => (Array.isArray(v) ? v : [v]))

/** Elemento a elemento, como Sheets: escalar × rango se difunde, rango × rango exige el mismo largo. */
function binario(op, a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const n = Math.max(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0)
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) throw new ErrorHoja('#N/A — rangos de distinto largo')
    return Array.from({ length: n }, (_, k) => binario(op, Array.isArray(a) ? a[k] : a, Array.isArray(b) ? b[k] : b))
  }
  if (op === '&') return `${a ?? ''}${b ?? ''}`
  if (op === '=') return a === b ? 1 : 0
  if (op === '<>') return a === b ? 0 : 1
  const [x, y] = [num(a), num(b)]
  switch (op) {
    case '+': return x + y
    case '-': return x - y
    case '*': return x * y
    case '/': { if (y === 0) throw new ErrorHoja('#DIV/0!'); return x / y }
    case '<': return x < y ? 1 : 0
    case '>': return x > y ? 1 : 0
    case '<=': return x <= y ? 1 : 0
    case '>=': return x >= y ? 1 : 0
    default: throw new Error(`evaluar-formula-sheet: operador "${op}" no soportado`)
  }
}

const columna = (letras) => [...letras].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0)
const letras = (n) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s }

/**
 * NÚCLEO PURO: las celdas que cubre "R5:AC5" o "B4:B9". Sólo rangos de una fila o una columna.
 *
 * LO QUE EL INSTRUMENTO NO SABE HACER REVIENTA FUERTE, no como #REF!. Si un rango rectangular se
 * comportara como error de hoja, el IFERROR de la fórmula lo absorbería y el test daría verde sobre
 * el valor por defecto — probando exactamente nada.
 */
export function celdasDelRango(ref) {
  const [a, b] = ref.replace(/\$/g, '').split(':')
  const pa = /^([A-Z]{1,3})(\d+)$/.exec(a); const pb = /^([A-Z]{1,3})(\d+)$/.exec(b ?? a)
  if (!pa || !pb) throw new Error(`evaluar-formula-sheet: rango sin límite (${ref})`)
  const [c0, f0, c1, f1] = [columna(pa[1]), Number(pa[2]), columna(pb[1]), Number(pb[2])]
  if (c0 !== c1 && f0 !== f1) throw new Error(`evaluar-formula-sheet: rango rectangular no soportado (${ref})`)
  const out = []
  for (let c = c0; c <= c1; c++) for (let f = f0; f <= f1; f++) out.push(`${letras(c)}${f}`)
  return out
}

/**
 * `TEXT(valor; patrón)` — LAS DOS REGLAS OPUESTAS QUE CONVIVEN EN LA MISMA LÍNEA.
 *
 * ═══ EL PATRÓN SE ESCRIBE EN NOTACIÓN US; EL RESULTADO SALE EN LOCALE ═══
 *
 * En una fórmula mandada por API, el SEPARADOR DE ARGUMENTOS va en el locale del archivo (`;` en
 * es-AR, nunca `,`) pero el PATRÓN DE NÚMERO va SIEMPRE en notación US: `,` agrupa los miles y `.`
 * separa los decimales. Es Sheets el que después lo dibuja con punto de miles y coma decimal.
 *
 * Dos reglas contrarias en la misma línea, y por eso se equivoca sola: escribir `"#.##0"` "porque en
 * es-AR los miles van con punto" hace que ese punto se lea como el DECIMAL. Pasó, y se publicó:
 * `$ 23795136,0` donde iba `$ 23.795.136`. Si alguien lo "corrige" de nuevo al revés, este modelo lo
 * devuelve crudo y el test se pone rojo.
 *
 * ES UN MODELO, NO SHEETS. Cubre el subconjunto que las pestañas escriben —prefijo/sufijo literal,
 * agrupación de miles, decimales fijos y las fechas dd/mm/yyyy—; cualquier otra cosa (secciones con
 * `;`, `%`, notación científica) revienta ruidosa en vez de devolver un texto inventado.
 */
export function textoConPatron(valor, patron) {
  const p = String(patron)
  if (/^[dmy][dmy/\-. :]*$/i.test(p)) {
    const d = aFecha(num(valor))
    const yyyy = String(d.getUTCFullYear())
    return p.replace(/yyyy/gi, yyyy).replace(/yy/gi, yyyy.slice(2))
      .replace(/dd/gi, String(d.getUTCDate()).padStart(2, '0'))
      .replace(/mm/g, String(d.getUTCMonth() + 1).padStart(2, '0'))
  }
  // Lo que CAMBIA el valor y este modelo no aplica: el `%` multiplica por 100, el `;` abre secciones
  // por signo, `E+` es notación científica. Rendirlos "como si nada" devolvería 1,0% donde Sheets
  // pone 100,0% — un test verde sobre un número inventado, que es lo único que no puede pasar acá.
  if (/[%;]|E[+-]/.test(p)) throw new Error(`evaluar-formula-sheet: patrón de número no soportado ("${p}")`)
  const m = /^([^#0]*)([#0,]+)(?:\.([#0]+))?([^#0]*)$/.exec(p)
  if (!m) throw new Error(`evaluar-formula-sheet: patrón de número no soportado ("${p}")`)
  const [, pre, entero, dec = '', post = ''] = m
  const n = num(valor)
  const fijo = Math.abs(n).toFixed(dec.length)
  const [crudo, frac = ''] = fijo.split('.')
  // El `,` del patrón (US) es lo ÚNICO que pide agrupar; se dibuja con punto porque el archivo es es-AR.
  const ent = entero.includes(',') ? crudo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : crudo
  return `${n < 0 ? '-' : ''}${pre}${ent}${frac ? `,${frac}` : ''}${post}`
}

/**
 * ¿ESTE VALOR CUMPLE EL CRITERIO DE UN *IFS? Soporta `>0`, `<`&fecha, texto exacto, `<>texto` y los
 * comodines `*texto*`. Lo que no reconoce revienta: un criterio mal entendido filtra de más o de
 * menos y devuelve un número plausible, que es el peor resultado posible en un instrumento de prueba.
 */
export function cumpleCriterio(valor, criterio) {
  const c = String(criterio ?? '')
  const cmp = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(c)
  const op = cmp[1] ?? '='
  const arg = cmp[2]
  const nArg = Number(arg)
  if (arg !== '' && !Number.isNaN(nArg) && !/^\*|\*$/.test(arg)) {
    const x = typeof valor === 'number' ? valor : Number(valor)
    if (Number.isNaN(x)) return op === '<>'
    if (op === '=') return x === nArg
    if (op === '<>') return x !== nArg
    return binario(op, x, nArg) === 1
  }
  const txt = String(valor ?? '').toUpperCase()
  const patron = arg.toUpperCase()
  const pre = patron.startsWith('*'); const suf = patron.endsWith('*')
  const nucleo = patron.replace(/^\*/, '').replace(/\*$/, '')
  const coincide = pre && suf ? txt.includes(nucleo) : suf ? txt.startsWith(nucleo) : pre ? txt.endsWith(nucleo) : txt === nucleo
  if (op === '<>') return !coincide
  if (op !== '=') throw new Error(`evaluar-formula-sheet: criterio "${c}" no soportado`)
  return coincide
}

const elemento = (v, k) => (Array.isArray(v) ? v[k] : v)

function llamar(n, args, ev) {
  // IF e IFERROR reciben el árbol SIN evaluar: si IFERROR evaluara su primer argumento por
  // adelantado, el #REF! que viene a absorber explotaría antes de que pudiera atajarlo.
  if (n === 'IF') {
    const c = ev(args[0])
    // IF SOBRE UN RANGO DEVUELVE UN RANGO. Adentro de un SUMPRODUCT, Sheets resuelve el IF elemento
    // a elemento — así está escrito `IF(ISNUMBER(F27:F400);F27:F400;0)`, el término de importe que
    // usa TODO el bloque de cheques para no sumar un texto. Colapsarlo a un solo valor daría un
    // número plausible y equivocado, que es lo único que este instrumento no puede hacer.
    if (Array.isArray(c)) {
      const a = ev(args[1]); const b = args[2] ? ev(args[2]) : 0
      return c.map((x, k) => (num(x) !== 0 ? elemento(a, k) : elemento(b, k)))
    }
    return num(c) !== 0 ? ev(args[1]) : ev(args[2] ?? { k: 'num', v: 0 })
  }
  if (n === 'IFERROR') { try { return ev(args[0]) } catch (e) { if (e instanceof ErrorHoja) return ev(args[1] ?? { k: 'num', v: 0 }) ; throw e } }
  const v = args.map(ev)
  switch (n) {
    case 'SUM': return plano(v).reduce((s, x) => s + num(x), 0)
    case 'SUMPRODUCT': {
      const largo = Math.max(...v.map((x) => (Array.isArray(x) ? x.length : 1)))
      if (v.some((x) => Array.isArray(x) && x.length !== largo)) throw new ErrorHoja('#N/A — rangos de distinto largo')
      let t = 0
      for (let k = 0; k < largo; k++) t += v.reduce((p, x) => p * num(Array.isArray(x) ? x[k] : x), 1)
      return t
    }
    case 'MAX': return Math.max(...plano(v).map(num))
    case 'MIN': return Math.min(...plano(v).map(num))
    case 'ROUND': { const d = 10 ** num(v[1] ?? 0); return Math.round(num(v[0]) * d) / d }
    case 'N': return typeof v[0] === 'number' ? v[0] : 0
    case 'TEXT': return textoConPatron(v[0], v[1])
    case 'TODAY': return aSerial(ev.hoy)
    case 'EOMONTH': { const d = aFecha(num(v[0])); return aSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + num(v[1]) + 1, 0))) }
    // MINIFS: el mínimo de lo que cumple TODOS los pares (rango; criterio). Devuelve 0 cuando no hay
    // ninguna coincidencia — igual que Sheets, y ése es justo el comportamiento que hay que poder
    // ejercer en frío: un 0 gana cualquier MIN y deja una fecha en blanco que se lee como "no hay
    // nada que cobrar". Se publicó así en 4 obras.
    case 'MINIFS': case 'MAXIFS': {
      const base = plano([v[0]])
      let sel = base.map((_, i) => i)
      for (let k = 1; k + 1 < v.length; k += 2) {
        const rango = plano([v[k]])
        if (rango.length !== base.length) throw new ErrorHoja('#N/A — rangos de distinto largo')
        sel = sel.filter((i) => cumpleCriterio(rango[i], v[k + 1]))
      }
      if (!sel.length) return 0
      const nums = sel.map((i) => num(base[i]))
      return n === 'MINIFS' ? Math.min(...nums) : Math.max(...nums)
    }
    case 'COUNTIF': {
      const m = /^([<>]=?|<>)?(-?\d+(?:\.\d+)?)$/.exec(String(v[1]))
      // El criterio de texto se delega en `cumpleCriterio`, que ya lo sabe hacer (exacto, <> y
      // comodines). Contar por TEXTO no es un caso raro: es como el bloque de cheques mide sus cuatro
      // categorías —`COUNTIF(M27:M400;"✓ su factura está en Compras")`— y sin esto reventaba.
      if (!m) return plano([v[0]]).filter((x) => cumpleCriterio(x, v[1])).length
      return plano([v[0]]).filter((x) => binario(m[1] === '<>' ? '<>' : (m[1] ?? '='), x, Number(m[2])) === 1).length
    }
    // ¿Es un número? Sobre un rango contesta rango, por el mismo motivo que el IF de arriba.
    case 'ISNUMBER': {
      const esNum = (x) => (typeof x === 'number' ? 1 : 0)
      return Array.isArray(v[0]) ? v[0].map(esNum) : esNum(v[0])
    }
    // UPPER sobre un rango también contesta rango: así compara el filtro `UPPER(K27:K400)<>"SI"`,
    // que es el que deja afuera los cheques ya debitados.
    case 'UPPER': {
      const may = (x) => String(x ?? '').toUpperCase()
      return Array.isArray(v[0]) ? v[0].map(may) : may(v[0])
    }
    // Deliberadamente RUIDOSO: un test que pasa porque el evaluador adivinó no probó nada.
    default: throw new Error(`evaluar-formula-sheet: la función ${n}() no está soportada`)
  }
}

/**
 * Evalúa una fórmula contra una pestaña MODELADA A MANO.
 *
 * @param {string} formula con o sin el '=' — en es-AR (separador ';')
 * @param {{hoja:Object<string,any>, hoy:Date}} ctx `hoja` mapea 'B4' → número, Date o fórmula
 * @returns {number|string|Array} el valor, o tira ErrorHoja si la hoja da error
 */
export function evaluarFormula(formula, { hoja = {}, hojas = {}, hoy = new Date() } = {}) {
  const enCurso = new Set()
  const ev = (nodo) => {
    switch (nodo.k) {
      case 'num': case 'str': return nodo.v
      case 'neg': return binario('*', ev(nodo.a), -1)
      case 'bin': return binario(nodo.op, ev(nodo.a), ev(nodo.b))
      case 'fn': return llamar(nodo.n, nodo.args, ev)
      case 'ref': return referencia(nodo.v)
      default: throw new Error(`evaluar-formula-sheet: nodo ${nodo.k}`)
    }
  }
  ev.hoy = hoy
  /** El lector de UNA pestaña modelada. `tab` sólo nombra las celdas en el detector de circulares. */
  const lector = (mapa, tab = '') => {
    const celda = (ref) => {
      const v = mapa[ref]
      // LA CELDA VACÍA VALE '' Y NO 0. Las dos cosas dan cero en aritmética —`num('')` es 0—, pero
      // en una COMPARACIÓN son opuestas: con 0, la prueba `(M27:M400="")` que separa "el OS todavía
      // no miró esta fila" de "ya la miró" daba FALSO en todas las filas vacías, y `(M<>"")` daba
      // verdadero en las 374 — o sea, el total contaba filas que no existen.
      if (v === undefined || v === null || v === '') return ''
      if (v instanceof Date) return aSerial(v)
      if (typeof v === 'string' && v.startsWith('=')) {
        // Una fórmula que se lee a sí misma es #REF! circular en Sheets; acá tiene que gritar, porque
        // en un generador siempre es un error de diseño (por eso Recurrentes tiene columnas auxiliares).
        const clave = `${tab}!${ref}`
        if (enCurso.has(clave)) throw new Error(`evaluar-formula-sheet: referencia circular en ${clave}`)
        enCurso.add(clave)
        try { return ev(parsear(tokenizar(v))) } finally { enCurso.delete(clave) }
      }
      return v
    }
    return (ref) => {
      const limpio = ref.replace(/\$/g, '')
      return limpio.includes(':') ? celdasDelRango(limpio).map(celda) : celda(limpio)
    }
  }
  const propia = lector(hoja)
  const referencia = (ref) => {
    const m = /^(?:'([^']+)'|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_ ]*))!(.+)$/.exec(ref)
    if (!m) return propia(ref)
    // OTRA PESTAÑA SE PUEDE MODELAR, Y SI NO SE MODELÓ SIGUE SIENDO #REF!. La segunda mitad es la
    // que estaba desde el principio y no cambia: el IFERROR del generador la absorbe y el factor de
    // Parámetros cae en su valor por defecto sin que el test tenga que reproducir esa tabla. La
    // primera existe porque hay fórmulas —el bloque de cheques del cash flow— cuyo dato ENTERO vive
    // en otra pestaña: ahí un #REF! no prueba nada, sólo esconde el número que se quería verificar.
    const nombre = m[1] ?? m[2]
    if (!hojas[nombre]) throw new ErrorHoja(`#REF! — ${ref} vive en una pestaña que el test no modeló`)
    return lector(hojas[nombre], nombre)(m[3])
  }
  return ev(parsear(tokenizar(formula)))
}

/**
 * NÚCLEO PURO: una grilla de generador (filas × columnas, 0-based) como mapa 'A1' → valor.
 * Es el puente entre lo que devuelve `grilla()` y lo que este evaluador sabe leer.
 */
export function hojaDeGrilla(filas) {
  const hoja = {}
  filas.forEach((fila, f) => fila.forEach((v, c) => { hoja[`${letras(c + 1)}${f + 1}`] = v }))
  return hoja
}
