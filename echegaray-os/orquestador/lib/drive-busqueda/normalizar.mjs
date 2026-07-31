// CÓMO SE ESCRIBE UN NOMBRE Y CÓMO LO PIDE UNA PERSONA — el puente entre las dos cosas.
//
// El buscador viejo le mandaba a Drive `name contains 'vision/traccion'` y Drive contestaba
// que no existía. El archivo se llama "Vision / Tracción": mismas letras, otra puntuación,
// otros acentos. Ese "no encontré" era literalmente cierto y completamente inútil.
//
// Acá vive la única definición de cómo se aplana un texto para compararlo, y la comparten
// las dos puntas: el indexador (que guarda los tokens de cada archivo) y el buscador (que
// tokeniza lo que la persona escribió). Si las dos puntas no normalizan igual, el índice y
// la consulta hablan idiomas distintos y no se encuentran nunca — que es exactamente lo que
// pasaba.
//
// NO hay IA acá. Ni una llamada, ni una heurística que dependa de un modelo. Es todo
// determinístico: la misma entrada da siempre la misma salida, y por eso se puede testear.

import crypto from 'node:crypto'

/** Palabras que la persona escribe para pedir, no para identificar. "pasame el archivo del
 *  flujo de caja" busca "flujo caja": lo demás es cortesía. Si una de estas fuera lo ÚNICO
 *  que quedó, no se descarta (ver `tokenizar`) — "pasame el excel" al menos dice "planilla". */
export const STOPWORDS = new Set([
  // el pedido
  'pasame', 'pasa', 'pasar', 'buscame', 'busca', 'buscar', 'busque', 'encontrame', 'encontra',
  'mostrame', 'mostra', 'mostrar', 'abrime', 'abri', 'abrir', 'traeme', 'trae', 'traer',
  'dame', 'da', 'quiero', 'necesito', 'necesitaria', 'podes', 'puedo', 'dale', 'porfa',
  'donde', 'esta', 'estan', 'tenes', 'tengo', 'hay', 'ver', 'veo', 'mandame', 'manda',
  // el sustantivo genérico
  'archivo', 'archivos', 'planilla', 'planillas', 'excel', 'documento', 'documentos', 'doc',
  'pdf', 'drive', 'carpeta', 'carpetas', 'file', 'sheet', 'link', 'enlace',
  // conectores
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'con',
  'para', 'por', 'y', 'o', 'que', 'me', 'mi', 'su', 'lo', 'se', 'es', 'son',
])

/** Las que son stopword pero DICEN el tipo: no entran a la búsqueda por texto, pero sirven
 *  para filtrar. "quiero el excel de estrategia" → tipo planilla + término "estrategia". */
export const PALABRA_TIPO = Object.freeze({
  excel: 'planilla', planilla: 'planilla', planillas: 'planilla', sheet: 'planilla',
  documento: 'documento', documentos: 'documento', doc: 'documento',
  pdf: 'pdf', carpeta: 'carpeta', carpetas: 'carpeta',
})

/**
 * Diccionario de sinónimos: forma canónica → todas las maneras de decirla.
 *
 * Se expande en las DOS puntas (archivo y consulta), así que da igual de qué lado se
 * escribió la variante. Crece: `cargarSinonimos` lo completa desde la base sin tocar código.
 */
export const SINONIMOS = Object.freeze({
  flujo: ['flujo', 'flujos', 'cashflow', 'cash', 'cf'],
  caja: ['caja', 'cash', 'tesoreria'],
  vision: ['vision', 'visión'],
  traccion: ['traccion', 'tracción'],
  estrategia: ['estrategia', 'estrategico', 'estrategica', 'strategy'],
  personal: ['personal', 'rrhh', 'rh', 'gente', 'empleados'],
  jornal: ['jornal', 'jornales', 'sueldo', 'sueldos', 'salario', 'salarios'],
  obra: ['obra', 'obras'],
  avance: ['avance', 'avances', 'curva'],
  gasto: ['gasto', 'gastos', 'egreso', 'egresos'],
  presupuesto: ['presupuesto', 'presupuestos', 'cotizacion', 'cotizaciones'],
  cobranza: ['cobranza', 'cobranzas', 'cobro', 'cobros'],
  proveedor: ['proveedor', 'proveedores'],
  factura: ['factura', 'facturas', 'facturacion'],
  certificado: ['certificado', 'certificados', 'certificacion', 'certificaciones'],
  banco: ['banco', 'bancario', 'extracto', 'santander'],
  cheque: ['cheque', 'cheques', 'echeq'],
  impuesto: ['impuesto', 'impuestos', 'iva', 'afip', 'arca'],
  contrato: ['contrato', 'contratos'],
  balance: ['balance', 'balances'],
  daily: ['daily', 'diaria', 'diario'],
  control: ['control', 'controles', 'seguimiento'],
})

/** Índice inverso: variante → canónica. Se arma una vez. */
function invertir(dic) {
  const m = new Map()
  for (const [canon, variantes] of Object.entries(dic)) {
    for (const v of variantes) m.set(plano(v), canon)
  }
  return m
}

let _inverso = invertir(SINONIMOS)
let _dic = { ...SINONIMOS }

/**
 * Suma sinónimos sin tocar el código (los que vengan de `public.drive_alias`).
 * @param {Array<{canonico:string, variante:string}>} filas
 */
export function cargarSinonimos(filas = []) {
  const nuevo = { ..._dic }
  for (const f of filas) {
    const c = plano(f?.canonico); const v = plano(f?.variante)
    if (!c || !v) continue
    nuevo[c] = Array.from(new Set([...(nuevo[c] ?? [c]), v]))
  }
  _dic = nuevo
  _inverso = invertir(nuevo)
  return _dic
}

/** Vuelve al diccionario de fábrica. Sólo para los tests: el estado es del proceso. */
export function _reiniciarSinonimos() { _dic = { ...SINONIMOS }; _inverso = invertir(SINONIMOS) }

/**
 * Texto → forma plana comparable: sin acentos, en minúsculas y con TODO separador
 * convertido en espacio. La barra de "Vision / Tracción", el punto de un ".xlsx", el guion
 * bajo de un "Flujos_Obras": todos son la misma cosa, un corte entre palabras.
 */
export function plano(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Quita la extensión antes de comparar: nadie pide "flujo de fondos punto xlsx". */
export function sinExtension(s) {
  return String(s ?? '').replace(/\.[a-z0-9]{2,5}$/i, '')
}

/**
 * Singular pobre pero honesto para el castellano. No es un stemmer: es lo justo para que
 * "jornales" encuentre "jornal" y "obras" encuentre "obra", sin romper "mes" ni "gas".
 */
export function singular(t) {
  const s = String(t ?? '')
  if (s.length <= 3) return s
  if (/[aeiou]ces$/.test(s)) return `${s.slice(0, -3)}z`   // luces → luz
  if (/[^aeiou]es$/.test(s)) return s.slice(0, -2)          // jornales → jornal
  if (/[^s]s$/.test(s)) return s.slice(0, -1)               // obras → obra
  return s
}

/** La forma con la que se compara un token: plano + singular + canónica del diccionario. */
export function canonico(t) {
  const p = plano(t)
  if (!p) return ''
  const directo = _inverso.get(p)
  if (directo) return directo
  const s = singular(p)
  return _inverso.get(s) ?? s
}

/**
 * Texto → tokens comparables, sin las palabras que no identifican nada.
 *
 * Si después de sacar las stopwords no queda NADA, se devuelven los tokens crudos: alguien
 * que escribió sólo "planilla" está pidiendo algo, y contestarle con las manos vacías porque
 * su única palabra estaba en la lista negra es peor que buscar de más.
 */
export function tokenizar(s) {
  const crudos = plano(sinExtension(s)).split(' ').filter(Boolean)
  const utiles = crudos.filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  const base = utiles.length ? utiles : crudos.filter((t) => t.length >= 2)
  return Array.from(new Set(base.map(canonico).filter(Boolean)))
}

/** El tipo que la persona pidió con una palabra, si lo pidió. `null` si no dijo ninguno. */
export function tipoPedido(s) {
  for (const t of plano(s).split(' ')) {
    if (PALABRA_TIPO[t]) return PALABRA_TIPO[t]
  }
  return null
}

/**
 * Los tokens de UNA entrada del índice. Incluye los del nombre y los de la ruta: "Vision /
 * Tracción" adentro de "administracion/ESTRATEGIA" se encuentra también pidiendo "estrategia".
 * Los del nombre pesan más, pero eso lo decide el ranking, no esto.
 */
export function tokensDeArchivo({ name, path } = {}) {
  return Array.from(new Set([...tokenizar(name), ...tokenizar(path)]))
}

/** Huella del contenido indexable. Cambia si cambió el nombre, la ruta o la fecha: sirve
 *  para saber si una fila del índice hay que reescribirla o dejarla como está. */
export function hashDe({ name, path, modified_time, mime_type } = {}) {
  const crudo = [name ?? '', path ?? '', modified_time ?? '', mime_type ?? ''].join('|')
  return crypto.createHash('sha1').update(crudo).digest('hex').slice(0, 16)
}
