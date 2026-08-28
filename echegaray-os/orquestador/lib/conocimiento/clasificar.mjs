// QUÉ CLASE DE DOCUMENTO ES ESTO — y, por lo tanto, QUÉ SE LE PUEDE EXTRAER.
//
// ═══ POR QUÉ LA CLASIFICACIÓN VA ANTES QUE LA EXTRACCIÓN ═══
//
// A un reglamento se le pregunta artículo, condición, requisito y vigencia. A una ficha de
// fabricante, consumo y rendimiento. A un paper, método y limitaciones. Preguntarle a un reglamento
// «cuál es el rendimiento por m²» devuelve o nada o basura, y la basura no se distingue sola. La
// tabla de abajo es del dueño y está escrita tal cual: cada clase con lo que se le extrae.
//
// ═══ LA REGLA QUE HACE QUE ESTO NO SEA ADIVINAR ═══
//
// EL DOMINIO DICE QUIÉN PUBLICA, NO QUÉ PUBLICÓ. Un PDF alojado en `inti.gob.ar` puede ser un
// reglamento, un acta de reunión o un folleto. Por eso ninguna clase se decide sin AL MENOS UNA
// MARCA EN EL TEXTO: el dominio y el tipo de fuente sólo pesan para desempatar entre clases que el
// texto ya sostiene. Sin marca en el texto la respuesta es INDETERMINADO, que es un dato, no un
// fracaso.
//
// Y cuando dos clases empatan, la respuesta es AMBIGUO con las dos opciones. Elegir una a dedo es
// exactamente lo que el CLAUDE.md raíz prohíbe: AMBIGUO es mejor que una elección arbitraria.
//
// ═══ SIN MODELO, SIEMPRE ═══
//
// Todo este archivo es PURO: regex sobre texto y sobre la URL. Anda con el proveedor de
// razonamiento apagado, que es el escenario que hay que poder sostener. La extracción FINA —lo que
// no se puede sacar con una expresión regular— sí puede pedir modelo, y cada campo declara cuál de
// las dos cosas es.
import { TIPO } from './fuentes.mjs'
import { dominioDe } from '../plano/investigacion.mjs'

/** Las cinco clases de la tabla del pedido, más los dos huecos honestos. */
export const CLASE = Object.freeze({
  MEDICION: 'MEDICION',           // tipo RICS NRM
  REGLAMENTO: 'REGLAMENTO',       // CIRSOC / INPRES / IRAM
  FABRICANTE: 'FABRICANTE',       // ficha técnica
  COSTOS: 'COSTOS',               // GAO / NASA / USACE
  PAPER: 'PAPER',                 // método publicado
  AMBIGUO: 'AMBIGUO',             // dos clases igual de sostenidas por el texto
  INDETERMINADO: 'INDETERMINADO', // el texto no sostiene ninguna
})

/** Cómo se saca un campo: con una expresión regular sobre el texto, o razonando. Es lo que permite
 *  decir, sin modelo, QUÉ QUEDÓ SIN RAZONAMIENTO en vez de devolver un resultado que parece entero. */
export const VIA_CAMPO = Object.freeze({ REGLA: 'REGLA', MODELO: 'MODELO' })

const r = (campo, patron) => ({ campo, via: VIA_CAMPO.REGLA, patron })
const m = (campo, que) => ({ campo, via: VIA_CAMPO.MODELO, que })

/**
 * LA TABLA DEL PEDIDO. Qué se le extrae a cada clase, campo por campo.
 *
 * Los `MODELO` no son un pendiente disimulado: son los campos que una expresión regular no puede
 * sacar sin inventar («cuál es la regla de medición», «qué limitaciones declara»). Con el modelo
 * apagado quedan como FALTA_DATO declarado — nunca como un valor plausible.
 */
export const CAMPOS_POR_CLASE = Object.freeze({
  [CLASE.MEDICION]: [
    r('tipo_elemento', /\b(?:measurement of|medici[oó]n de|elemento[s]?:)\s+([^.\n;]{3,80})/i),
    r('unidad', /\b(?:unit(?:s)? of measurement|unidad de medida|se mide en)\s*[:\s]\s*([^.\n;]{1,40})/i),
    m('regla_medicion', 'la regla con la que se mide el elemento, dicha entera'),
    m('inclusiones', 'qué queda INCLUIDO en la medición'),
    m('exclusiones', 'qué queda EXCLUIDO y se mide aparte'),
    m('informacion_requerida', 'qué información hay que tener para poder medirlo'),
  ],
  [CLASE.REGLAMENTO]: [
    r('reglamento', /\b((?:CIRSOC|INPRES-CIRSOC|INPRES|IRAM|ISO|EN)\s*[-\s]?\d{2,5}(?:[-–]\d+)?)/i),
    r('version', /\b(?:versi[oó]n|edici[oó]n|actualizaci[oó]n)\s*[:\s]\s*(\d{4}|[IVX]+)/i),
    r('articulo', /\b(?:art[ií]culo|art\.|cap[ií]tulo|secci[oó]n|inciso)\s*([0-9][0-9.]{0,10})/i),
    r('vigencia', /\b(?:entrar[aá] en vigencia|vigente desde|de aplicaci[oó]n obligatoria a partir del?)\s*([^.\n;]{3,60})/i),
    m('jurisdiccion', 'a qué territorio obliga: nacional, provincial o municipal'),
    m('condicion', 'en qué caso aplica el requisito'),
    m('requisito', 'qué exige, dicho como se pueda verificar'),
  ],
  [CLASE.FABRICANTE]: [
    r('producto', /\b(?:producto|sistema|nombre comercial)\s*[:\s]\s*([^.\n;]{3,80})/i),
    r('consumo', /\b(?:consumo|rinde|rendimiento)[^.\n;]{0,30}?([\d.,]+\s*(?:kg|g|l|lt|litros?|m[l²23]|un)[^.\n;]{0,25})/i),
    r('rendimiento', /\b(?:rendimiento|cobertura)\s*(?:aproximad[oa])?\s*[:\s]\s*([^.\n;]{2,60})/i),
    r('version', /\b(?:ficha t[eé]cnica|hoja de datos|rev\.?|revisi[oó]n)\s*[:\s]?\s*(\d{2}[/-]\d{2,4}|\d{4}|v?\d+(?:\.\d+)?)/i),
    m('uso', 'para qué se usa y sobre qué sustratos'),
    m('compatibilidad', 'con qué materiales o sistemas es compatible'),
    m('limitaciones', 'condiciones en las que NO se puede usar'),
    m('metodo', 'el método de aplicación tal como lo describe la ficha'),
    m('fuente', 'quién publica la ficha y con qué respaldo'),
  ],
  [CLASE.COSTOS]: [
    r('clasificacion', /\b(?:class(?:ification)?\s*[1-5]|AACE\s*(?:class)?\s*[1-5]|clase\s*[1-5])\b/i),
    r('madurez', /\b(?:maturity|madurez|confidence level|nivel de confianza)\s*[:\s]\s*([^.\n;]{2,60})/i),
    m('estructura_estimate', 'cómo se estructura el estimado (WBS, niveles, agregación)'),
    m('riesgo', 'cómo se trata el riesgo dentro del estimado'),
    m('incertidumbre', 'cómo se cuantifica la incertidumbre y la contingencia'),
    m('basis_of_estimate', 'qué tiene que documentar el basis of estimate'),
    m('controles', 'qué controles se le exigen al estimado'),
  ],
  [CLASE.PAPER]: [
    r('formulas', /\b([A-Za-z][A-Za-z0-9_]{0,12}\s*=\s*[\d.,]+(?:\s*(?:hh?|hs|min|m[²³23]?|kg|g|lt?|%|d[ií]as?)\b)?)/),
    r('unidades', /\b(\d+[.,]\d+\s*(?:h(?:oras?)?|m[²23]|kg|min|d[ií]as?)\b)/i),
    m('metodo', 'el método que propone o aplica'),
    m('poblacion_contexto', 'sobre qué población, obra o contexto se midió'),
    m('supuestos', 'qué supuestos declara'),
    m('limitaciones', 'qué limitaciones declara el propio trabajo'),
    m('resultados', 'qué resultados obtuvo, con sus números'),
  ],
})

/** Las marcas que tiene que dejar el TEXTO para que una clase sea sostenible. Cada una vale 1. */
export const MARCAS = Object.freeze({
  [CLASE.MEDICION]: [/new rules of measurement|\bNRM\s*[123]\b/i, /regla de medici[oó]n|rules? of measurement/i, /\binclusions?\b|inclusiones/i, /\bexclusions?\b|exclusiones/i, /c[oó]mputo m[eé]trico|unit of measurement|unidad de medida/i],
  [CLASE.REGLAMENTO]: [/\bCIRSOC\b|\bINPRES\b/i, /reglamento argentino|reglamento nacional/i, /art[ií]culo\s*\d|\bcap[ií]tulo\s*\d/i, /entrar[aá] en vigencia|de aplicaci[oó]n obligatoria|vigente desde/i, /zona s[ií]smica|norma IRAM|resoluci[oó]n n[°º]/i],
  [CLASE.FABRICANTE]: [/ficha t[eé]cnica|hoja de datos|data sheet/i, /modo de (?:empleo|aplicaci[oó]n)/i, /consumo aproximado|rendimiento aproximado/i, /no aplicar (?:sobre|con|a)|vida [uú]til del producto/i, /presentaci[oó]n\s*:|diluci[oó]n/i],
  [CLASE.COSTOS]: [/cost estimat|estimaci[oó]n de costos/i, /basis of estimate/i, /work breakdown structure|\bWBS\b/i, /risk and uncertainty|contingency|contingencia/i, /confidence level|estimate maturity|AACE/i],
  [CLASE.PAPER]: [/\babstract\b|\bresumen\b/i, /palabras clave|keywords/i, /\bISSN\b|\bDOI\b|doi\.org/i, /metodolog[ií]a|methodology/i, /referencias bibliogr[aá]ficas|\breferences\b/i],
})

/** Lo que el DOMINIO sugiere. Sólo desempata: nunca alcanza para clasificar por sí solo. */
export const PISTAS_DOMINIO = Object.freeze([
  [/rics\.org/i, CLASE.MEDICION], [/wbdg\.org/i, CLASE.MEDICION],
  [/inti\.gob\.ar|inpres\.gob\.ar|iram\.org\.ar|cirsoc/i, CLASE.REGLAMENTO],
  [/gao\.gov|nasa\.gov|usace\.army\.mil/i, CLASE.COSTOS],
  [/doi\.org|scielo|redalyc|revista|\.edu(\.|\/|$)|unsj\.edu\.ar/i, CLASE.PAPER],
])

/** Lo que el TIPO declarado de la fuente sugiere. Mismo peso y misma limitación que el dominio. */
export const PISTAS_TIPO = Object.freeze({
  [TIPO.REGLAMENTO]: CLASE.REGLAMENTO, [TIPO.NORMA]: CLASE.REGLAMENTO,
  [TIPO.MEDICION]: CLASE.MEDICION, [TIPO.COSTOS]: CLASE.COSTOS,
  [TIPO.PAPER]: CLASE.PAPER, [TIPO.FABRICANTE]: CLASE.FABRICANTE,
})

/** Cuánto pesa una pista que no es del texto. Menos que una marca: es contexto, no evidencia. */
export const PESO_PISTA = 0.5

/** La diferencia mínima con la segunda para no ser AMBIGUO. Empate = las dos opciones, no una. */
export const MARGEN_MINIMO = 1

/**
 * CLASIFICAR UN DOCUMENTO. PURA — sin red, sin modelo, sin disco.
 *
 * Devuelve SIEMPRE el puntaje de las cinco clases y las marcas que encontró en cada una: el
 * resultado se puede auditar sin volver a correr nada.
 */
export function clasificar({ texto = '', url = null, tipoFuente = null, pistasFabricante = [] } = {}) {
  const t = String(texto ?? '')
  const dom = url ? dominioDe(url) : null
  const marcas = {}
  const puntaje = {}
  for (const clase of Object.keys(MARCAS)) {
    const halladas = MARCAS[clase].filter((re) => re.test(t)).map((re) => String(re))
    marcas[clase] = halladas
    puntaje[clase] = halladas.length
  }
  const pistas = []
  for (const [re, clase] of PISTAS_DOMINIO) {
    if (dom && re.test(dom)) { puntaje[clase] += PESO_PISTA; pistas.push(`el dominio «${dom}» sugiere ${clase}`) }
  }
  if (dom && pistasFabricante.some((p) => String(dom).includes(String(p).toLowerCase()))) {
    puntaje[CLASE.FABRICANTE] += PESO_PISTA
    pistas.push(`«${dom}» está en las pistas de fabricante`)
  }
  const porTipo = PISTAS_TIPO[tipoFuente]
  if (porTipo) { puntaje[porTipo] += PESO_PISTA; pistas.push(`la fuente está registrada como ${tipoFuente}`) }
  return decidir({ puntaje, marcas, pistas })
}

/** La decisión sobre los puntajes ya calculados. Separada para poder probarla sola. PURA. */
export function decidir({ puntaje, marcas, pistas = [] }) {
  const orden = Object.entries(puntaje).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const [mejor, segunda] = orden
  const conMarcas = orden.filter(([c]) => marcas[c].length > 0).map(([c]) => c)
  const base = { puntaje, marcas, pistas, conModelo: false }
  if (!conMarcas.length) {
    return { ...base, clase: CLASE.INDETERMINADO, opciones: [], porQue: 'el texto no dejó ninguna marca de ninguna clase: el dominio dice quién publica, no qué publicó' }
  }
  if (!marcas[mejor[0]].length) {
    return { ...base, clase: CLASE.INDETERMINADO, opciones: conMarcas, porQue: `sólo las pistas de contexto apuntan a ${mejor[0]}, y el texto no lo sostiene` }
  }
  if (segunda && marcas[segunda[0]].length && mejor[1] - segunda[1] < MARGEN_MINIMO) {
    return { ...base, clase: CLASE.AMBIGUO, opciones: [mejor[0], segunda[0]], porQue: `${mejor[0]} (${mejor[1]}) y ${segunda[0]} (${segunda[1]}) están a menos de ${MARGEN_MINIMO} de diferencia: elegir una sería arbitrario` }
  }
  return { ...base, clase: mejor[0], opciones: [mejor[0]], porQue: `${marcas[mejor[0]].length} marca(s) en el texto${pistas.length ? ` · ${pistas.join(' · ')}` : ''}` }
}

/** El cuerpo de adentro del bloque sellado de contenido externo. El sello se mantiene en el
 *  resultado que viaja al modelo; para CITAR hace falta el texto sin la envoltura. PURA. */
export function cuerpoDelBloque(bloque, id = null) {
  const s = String(bloque ?? '')
  const re = id
    ? new RegExp(`⟦INICIO ${id}⟧\\n([\\s\\S]*)\\n⟦FIN ${id}⟧`)
    : /⟦INICIO [0-9a-f]+⟧\n([\s\S]*)\n⟦FIN [0-9a-f]+⟧/
  const m2 = s.match(re)
  return m2 ? m2[1] : s
}

/**
 * PARTIR EL TEXTO EN SEGMENTOS CITABLES, con su página cuando la hay. PURA.
 *
 * El extractor de PDF intercala «=== p.N ===» entre páginas. Sin esto, una cita no puede decir de
 * qué página salió, y una cita sin página no se puede verificar en el documento original.
 */
export function segmentar(texto, { maxSegmento = 600 } = {}) {
  const t = String(texto ?? '')
  const paginas = t.includes('=== p.')
    ? t.split(/^=== p\.(\d+) ===$/m).slice(1).reduce((a, x, i, arr) => (i % 2 === 0 ? [...a, { pagina: Number(x), texto: arr[i + 1] ?? '' }] : a), [])
    : [{ pagina: null, texto: t }]
  const salida = []
  for (const p of paginas) {
    for (const linea of String(p.texto).split(/\n{2,}|(?<=[.;:])\s*\n/)) {
      const limpio = linea.replace(/\s+/g, ' ').trim()
      if (limpio.length < 12) continue
      salida.push({ pagina: p.pagina, texto: limpio.slice(0, maxSegmento) })
    }
  }
  return salida
}

/**
 * EXTRAER LOS CAMPOS QUE SE PUEDEN SACAR CON UNA REGLA. PURA, sin modelo.
 *
 * Devuelve `hallados` —cada uno con su valor, su cita literal y su página— y `sinRazonamiento`: los
 * campos que la tabla marca como `MODELO` y que, sin proveedor de razonamiento, quedan sin resolver.
 * Ese segundo listado ES el resultado: es lo que permite decir qué parte de la extracción no se hizo
 * en vez de entregar una ficha que parece completa.
 */
export function extraerConReglas({ segmentos = [], clase } = {}) {
  const campos = CAMPOS_POR_CLASE[clase]
  if (!campos) return { hallados: [], sinRegla: [], sinRazonamiento: [], porQue: `«${clase}» no tiene tabla de extracción: no se le puede preguntar nada específico` }
  const hallados = []
  const sinRegla = []
  for (const def of campos.filter((c) => c.via === VIA_CAMPO.REGLA)) {
    const hit = segmentos.map((s) => ({ s, m: s.texto.match(def.patron) })).find((x) => x.m)
    if (!hit) { sinRegla.push({ campo: def.campo, porQue: 'la expresión de este campo no encontró nada en el texto' }); continue }
    hallados.push({
      campo: def.campo, via: VIA_CAMPO.REGLA,
      valor: (hit.m[1] ?? hit.m[0]).trim(),
      textoLiteral: hit.s.texto, pagina: hit.s.pagina,
    })
  }
  const sinRazonamiento = campos.filter((c) => c.via === VIA_CAMPO.MODELO).map((c) => ({ campo: c.campo, que: c.que }))
  return { hallados, sinRegla, sinRazonamiento, porQue: `${hallados.length} de ${campos.length} campo(s) salieron con una regla` }
}
