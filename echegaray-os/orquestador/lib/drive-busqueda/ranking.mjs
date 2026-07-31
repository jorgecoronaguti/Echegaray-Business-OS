// POR QUÉ ESTE ARCHIVO Y NO EL OTRO — el ranking, explicable y determinístico.
//
// Drive devuelve "todo lo que contiene el texto" en un orden que no significa nada. Devolver
// el primero es tirar una moneda con el presupuesto de otra obra. Acá cada candidato saca un
// puntaje a partir de señales que se pueden nombrar, y el desglose viaja con el resultado:
// si algún día ordena mal, se puede ver POR QUÉ ordenó mal en vez de adivinar.
//
// Ninguna señal viene de un modelo. Todas se calculan de `name`, `path`, `tipo`,
// `modified_time` y de cuántas veces alguien aceptó ese archivo para esta misma consulta.
//
// La escala está pensada para que las señales de NOMBRE dominen a las de ruta y a la
// frescura: un archivo que se llama como lo pedido gana siempre contra uno que apenas lo
// menciona en la carpeta, por más nuevo que sea. La frescura desempata, no decide.

import { plano, sinExtension, canonico } from './normalizar.mjs'

/** Los pesos, en un solo lugar y con nombre. Cambiar el orden de los resultados es cambiar
 *  un número de acá, no leer trescientas líneas. */
export const PESOS = Object.freeze({
  NOMBRE_EXACTO: 1000,      // el nombre ES lo que pidió (ya normalizado)
  NOMBRE_PREFIJO: 400,      // el nombre EMPIEZA con lo que pidió
  NOMBRE_CONTIENE: 200,     // la frase entera aparece dentro del nombre
  TOKEN_NOMBRE: 120,        // cada palabra pedida que está en el nombre, entera
  TOKEN_NOMBRE_PREFIJO: 70, // ídem, pero como prefijo de una palabra del nombre
  TOKEN_NOMBRE_PARCIAL: 35, // ídem, sueltа adentro de una palabra
  TOKEN_RUTA: 25,           // la palabra aparece en la carpeta, no en el nombre
  TODOS_LOS_TOKENS: 250,    // están TODAS las palabras que pidió (en nombre o ruta)
  COBERTURA: 150,           // proporción de lo pedido que se encontró
  CARPETA_EXACTA: 60,       // la carpeta contenedora se llama como algo que pidió
  TIPO_PEDIDO: 80,          // pidió "excel" y esto es una planilla
  ES_CARPETA: -40,          // ante la duda, la gente quiere el archivo, no la carpeta
  PROFUNDIDAD: -4,          // por nivel de anidamiento: lo enterrado suele ser menos probable
  FRESCURA_MAX: 60,         // el desempate por fecha, acotado para que nunca decida solo
  APRENDIZAJE: 90,          // por cada aceptación previa de este archivo para esta consulta
  APRENDIZAJE_TOPE: 450,
})

const DIA_MS = 86_400_000

/** Frescura acotada: hoy vale el máximo, un año vale cero. Nunca da vuelta un resultado por
 *  sí sola — el archivo correcto de 2024 le gana igual a uno irrelevante de ayer. */
export function puntajeFrescura(modificado, ahora = Date.now()) {
  if (!modificado) return 0
  const t = new Date(modificado).getTime()
  if (Number.isNaN(t)) return 0
  const dias = Math.max(0, (ahora - t) / DIA_MS)
  if (dias >= 365) return 0
  return Math.round(PESOS.FRESCURA_MAX * (1 - dias / 365))
}

/** Los tramos de una ruta, sin espacios de más. El trim NO es cosmético: hay archivos cuyo
 *  NOMBRE lleva una barra —"Vision / Tracción"— y al partir la ruta dejan tramos como
 *  "Vision " que después se muestran así al dueño. */
const segmentos = (path) => String(path ?? '').split('/').map((x) => x.trim()).filter(Boolean)

/** La carpeta que contiene al archivo, tal como se ve en la ruta. */
export function carpetaDe(path = '') {
  const partes = segmentos(path)
  partes.pop()
  return partes.length ? partes[partes.length - 1] : null
}

/**
 * La ruta legible para mostrarle a una persona: "administracion > Estrategia".
 *
 * Recibe el NOMBRE del archivo y no sólo la ruta, y no por comodidad: hay archivos cuyo
 * nombre lleva una barra —"Vision / Tracción"— y partir la ruta a ciegas los cuenta como dos
 * tramos. Sacando "un" tramo quedaba "… > Vision > Vision": la carpeta repetida, que es
 * justo el tipo de detalle que hace desconfiar de todo lo demás. Con el nombre se puede
 * cortar por donde de verdad termina la carpeta.
 */
export function rutaLegible(path = '', { max = 3, name = null } = {}) {
  const partes = segmentos(path)
  const delNombre = name ? segmentos(name).length : 1
  partes.splice(-Math.min(delNombre, partes.length))
  if (!partes.length) return null
  const visibles = partes.length > max ? ['…', ...partes.slice(-max)] : partes
  return visibles.join(' > ')
}

/**
 * Cuánto pesa UN token pedido contra el nombre del archivo.
 * Palabra entera > prefijo de palabra > pedazo suelto. La diferencia importa: "obra" como
 * palabra en "Avances de Obra" es una señal fuerte; "obra" adentro de "maniobras" no lo es.
 */
function pesoTokenEnNombre(token, palabrasNombre) {
  if (palabrasNombre.includes(token)) return PESOS.TOKEN_NOMBRE
  if (palabrasNombre.some((p) => p.startsWith(token) || token.startsWith(p))) return PESOS.TOKEN_NOMBRE_PREFIJO
  if (palabrasNombre.some((p) => p.includes(token))) return PESOS.TOKEN_NOMBRE_PARCIAL
  return 0
}

/**
 * Puntúa un candidato contra la consulta ya tokenizada.
 *
 * @param {{name:string, path?:string, tipo?:string, is_folder?:boolean, modified_time?:string, depth?:number}} e
 * @param {{frase:string, tokens:string[], tipo?:string|null}} consulta
 * @param {{ahora?:number, aceptaciones?:number}} [opts]
 * @returns {{score:number, senales:object}}
 */
export function puntuar(e, consulta, opts = {}) {
  const ahora = opts.ahora ?? Date.now()
  const aceptaciones = Number(opts.aceptaciones ?? 0)

  const nombrePlano = plano(sinExtension(e.name))
  const rutaPlana = plano(e.path ?? '')
  const palabrasNombre = nombrePlano.split(' ').filter(Boolean).map(canonico)
  const palabrasRuta = rutaPlana.split(' ').filter(Boolean).map(canonico)
  const frase = plano(consulta.frase ?? '')
  const tokens = consulta.tokens ?? []

  const senales = {}
  let score = 0
  const sumar = (nombre, valor) => { if (valor) { senales[nombre] = (senales[nombre] ?? 0) + valor; score += valor } }

  // ── La frase entera contra el nombre ──
  if (frase && nombrePlano === frase) sumar('nombre_exacto', PESOS.NOMBRE_EXACTO)
  else if (frase && nombrePlano.startsWith(frase)) sumar('nombre_prefijo', PESOS.NOMBRE_PREFIJO)
  else if (frase && nombrePlano.includes(frase)) sumar('nombre_contiene', PESOS.NOMBRE_CONTIENE)

  // ── Token por token ──
  let enNombre = 0
  let enRuta = 0
  for (const t of tokens) {
    const p = pesoTokenEnNombre(t, palabrasNombre)
    if (p) { sumar('tokens_nombre', p); enNombre += 1; continue }
    if (palabrasRuta.includes(t) || palabrasRuta.some((w) => w.startsWith(t))) {
      sumar('tokens_ruta', PESOS.TOKEN_RUTA); enRuta += 1
    }
  }

  // ── Cobertura: cuánto de lo que pidió aparece en algún lado ──
  if (tokens.length) {
    const cubiertos = enNombre + enRuta
    if (cubiertos === tokens.length) sumar('todos_los_tokens', PESOS.TODOS_LOS_TOKENS)
    sumar('cobertura', Math.round(PESOS.COBERTURA * (cubiertos / tokens.length)))
  }

  // ── Contexto de carpeta ──
  const carpeta = canonico(plano(carpetaDe(e.path ?? '') ?? ''))
  if (carpeta && tokens.includes(carpeta)) sumar('carpeta_exacta', PESOS.CARPETA_EXACTA)

  // ── Tipo, forma y lugar ──
  if (consulta.tipo && e.tipo === consulta.tipo) sumar('tipo_pedido', PESOS.TIPO_PEDIDO)
  if (e.is_folder) sumar('es_carpeta', PESOS.ES_CARPETA)
  if (Number.isFinite(e.depth)) sumar('profundidad', PESOS.PROFUNDIDAD * Number(e.depth))

  // ── Desempates ──
  sumar('frescura', puntajeFrescura(e.modified_time, ahora))
  if (aceptaciones > 0) {
    sumar('aprendizaje', Math.min(PESOS.APRENDIZAJE * aceptaciones, PESOS.APRENDIZAJE_TOPE))
  }

  return { score, senales }
}

/**
 * Ordena los candidatos y devuelve el ranking con su desglose.
 *
 * El orden final es score, y a score igual el más reciente. Ese segundo criterio existe
 * porque dos archivos con el mismo nombre en dos carpetas empatan de verdad: el que se tocó
 * la semana pasada es casi siempre el que están pidiendo.
 */
export function rankear(candidatos, consulta, opts = {}) {
  const aceptacionesPor = opts.aceptacionesPor ?? new Map()
  return candidatos
    .map((e) => {
      const { score, senales } = puntuar(e, consulta, {
        ahora: opts.ahora,
        aceptaciones: aceptacionesPor.get(e.drive_file_id) ?? 0,
      })
      return { ...e, score, senales }
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => (b.score - a.score)
      || String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? '')))
}

/**
 * ¿Hay UN ganador claro, o hay que preguntar?
 *
 * Gana solo si le saca una diferencia real al segundo. "Real" es relativa a la escala: un
 * 30 % arriba del segundo es un ganador; dos archivos a diez puntos son un empate, y ahí
 * preguntar es más barato que acertar por casualidad.
 */
export function hayGanador(rankeados, { margen = 0.3 } = {}) {
  if (!rankeados.length) return false
  if (rankeados.length === 1) return true
  const [a, b] = rankeados
  if (a.score >= PESOS.NOMBRE_EXACTO && b.score < PESOS.NOMBRE_EXACTO) return true
  return a.score >= b.score * (1 + margen)
}
