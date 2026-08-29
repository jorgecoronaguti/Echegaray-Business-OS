// UN `.docx` ES UN ZIP CON `word/document.xml` ADENTRO. PURO — sin red, sin modelo, sin dependencia.
//
// ═══ POR QUÉ NO ALCANZA CON SACARLE LOS TAGS AL XML ═══
//
// Un `document.xml` al que se le borran los `<...>` con una expresión regular devuelve un chorizo
// donde «Espesor 12 mm» y «s/cálculo» quedan pegados a la fila de al lado, y donde el CÓDIGO de un
// campo —`PAGEREF _Toc179902451 \h 2`— entra como si fuera prosa del documento. Las memorias y los
// pliegos de este data room son casi todos TABLAS: si la estructura de filas y celdas se aplana, un
// «espesor» pierde a qué pieza pertenece, y un hecho sin pieza no es un hecho.
//
// Por eso este lector devuelve BLOQUES en el orden del documento: párrafos y tablas, cada tabla con
// sus filas y sus celdas. El texto plano se arma DESPUÉS a partir de eso, y no al revés.
//
// ═══ LO QUE SE IGNORA A PROPÓSITO ═══
//
//   `w:instrText`  el código de un campo (TOC, HYPERLINK, PAGEREF). No lo escribió nadie.
//   `w:delText`    texto BORRADO con control de cambios. Está en el archivo y no está en el documento.
//   `mc:Fallback`  la versión alternativa de una figura, que duplicaría todo su texto.
//
// Un `<w:tab/>` es una tabulación real y un `<w:br/>` un salto real: se conservan, porque en una
// planilla hecha con tabuladores son la única separación entre columnas que existe.
import { indice, contenido } from './zip.mjs'

/** La pieza principal. Encabezados y pies quedan afuera a propósito: repiten el logo y el número de
 *  página en cada hoja y ensucian toda cita con ruido que no dice nada del alcance. */
export const PARTE_PRINCIPAL = 'word/document.xml'

/** Las entidades XML que aparecen de verdad en un `document.xml`. PURA. */
export function desescapar(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

const nombreDeTag = (t) => (t.match(/^\/?([A-Za-z0-9_:.-]+)/) ?? [])[1] ?? ''

/**
 * DE `document.xml` A BLOQUES EN ORDEN. PURA.
 *
 * Un solo recorrido lineal con una pila de contextos. Los `w:p` de adentro de una celda NO abren un
 * párrafo de nivel superior: se acumulan en la celda, que es donde están.
 */
export function bloquesDeXml(xml) {
  const s = String(xml ?? '')
  const bloques = []
  let parrafo = ''
  const tablas = []           // pila: una tabla anidada empuja otra
  let ignorar = 0             // profundidad de instrText/delText/Fallback
  let enTexto = false
  let i = 0
  const cima = () => tablas[tablas.length - 1] ?? null
  const escribir = (t) => {
    if (ignorar > 0 || !t) return
    const c = cima()
    if (c) c.celda += t
    else parrafo += t
  }
  const cerrarParrafo = () => {
    const c = cima()
    if (c) { c.celda += '\n'; return }
    const t = parrafo.trim()
    if (t) bloques.push({ tipo: 'parrafo', texto: t })
    parrafo = ''
  }
  while (i < s.length) {
    const a = s.indexOf('<', i)
    if (a < 0) break
    if (enTexto && a > i) escribir(desescapar(s.slice(i, a)))
    const b = s.indexOf('>', a)
    if (b < 0) break
    const crudo = s.slice(a + 1, b)
    const cierra = crudo.startsWith('/')
    const suelto = crudo.endsWith('/')
    const tag = nombreDeTag(crudo)
    i = b + 1
    if (tag === 'w:instrText' || tag === 'w:delText' || tag === 'mc:Fallback') {
      if (!suelto) ignorar += cierra ? -1 : 1
      enTexto = false
      continue
    }
    if (tag === 'w:t') { enTexto = !cierra && !suelto; continue }
    enTexto = false
    if (tag === 'w:tab' && !cierra) { escribir('\t'); continue }
    if ((tag === 'w:br' || tag === 'w:cr') && !cierra) { escribir('\n'); continue }
    if (tag === 'w:tbl' && !suelto) {
      if (cierra) {
        const t = tablas.pop()
        if (!t) continue
        const filas = t.filas.filter((f) => f.some((c) => c.trim()))
        const destino = cima()
        if (destino) destino.celda += filas.map((f) => f.join(' | ')).join('\n')
        else if (filas.length) bloques.push({ tipo: 'tabla', filas })
      } else { cerrarParrafo(); tablas.push({ filas: [], fila: null, celda: '' }) }
      continue
    }
    const c = cima()
    if (!c) { if (tag === 'w:p' && cierra) cerrarParrafo(); continue }
    if (tag === 'w:tr' && !suelto) {
      if (cierra) { c.filas.push(c.fila ?? []); c.fila = null } else c.fila = []
      continue
    }
    if (tag === 'w:tc' && !suelto) {
      if (cierra) { (c.fila ??= []).push(c.celda.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim()); c.celda = '' } else c.celda = ''
      continue
    }
    if (tag === 'w:p' && cierra) c.celda += '\n'
  }
  cerrarParrafo()
  return bloques
}

/**
 * EL TEXTO PLANO QUE SE CITA, ARMADO DESDE LOS BLOQUES. PURA.
 *
 * Cada fila de tabla es una línea con sus celdas separadas por ` | `. No es cosmética: `segmentar()`
 * parte por líneas, así que una fila entera —«Chapa | T101 | e = 0,5 mm | 340 m²»— llega junta al
 * extractor y el atributo conserva a qué pieza pertenece.
 */
export function textoDeBloques(bloques = []) {
  return bloques.map((b) => (b.tipo === 'tabla' ? b.filas.map((f) => f.join(' | ')).join('\n') : b.texto)).join('\n\n')
}

/** Cuántos caracteres son CONTENIDO y no espacios: es lo que decide si un documento se leyó de
 *  verdad. Un `.docx` de portada con una imagen y nada más abre perfecto y deja 4 caracteres. PURA. */
export const utilesDe = (t) => String(t ?? '').replace(/\s+/g, '').length

/** El piso por debajo del cual un documento CON IMÁGENES es sospechoso de tener su contenido
 *  adentro de ellas — el equivalente del PDF sin capa de texto. NO es el piso para «se leyó»: una
 *  carátula de 125 caracteres se leyó entera, y rechazarla sería inventar un fracaso. */
export const DOCX_MIN_CARACTERES_UTILES = 200

/**
 * LEER UN `.docx`. Devuelve SIEMPRE la misma forma, también cuando no se pudo.
 *
 * ═══ LAS DOS FORMAS DE NO PODER LEERLO SON DISTINTAS ═══
 *
 * Cero caracteres es «no salió nada». Pocos caracteres CON imágenes incrustadas es «lo que dice
 * está adentro de una imagen»: el archivo se abrió perfecto y haría falta OCR. La segunda es la
 * trampa que ya se pagó del lado del PDF —un reglamento escaneado pasó como leído— y por eso el
 * control mira las dos cosas juntas: sin imágenes, un documento corto es simplemente corto.
 */
export function leerDocx(bytes, { minUtiles = DOCX_MIN_CARACTERES_UTILES } = {}) {
  const ix = indice(bytes)
  if (!ix.ok) return { ok: false, porQue: ix.porQue }
  const parte = ix.entradas.find((e) => e.nombre === PARTE_PRINCIPAL)
  if (!parte) {
    const ooxml = ix.entradas.some((e) => e.nombre.startsWith('xl/')) ? 'es un libro de Excel, no un documento de Word'
      : ix.entradas.some((e) => e.nombre.startsWith('ppt/')) ? 'es una presentación, no un documento de Word'
        : ix.entradas.some((e) => e.nombre === 'content.xml') ? 'es un documento OpenDocument (.odt) y este lector abre OOXML'
          : `no tiene «${PARTE_PRINCIPAL}»`
    return { ok: false, porQue: `el ZIP se abrió y ${ooxml}` }
  }
  const c = contenido(bytes, parte)
  if (!c.ok) return { ok: false, porQue: c.porQue }
  const bloques = bloquesDeXml(c.datos.toString('utf8'))
  const texto = textoDeBloques(bloques)
  const utiles = utilesDe(texto)
  // La ENTRADA de directorio `word/media/` también empieza con `word/media/`, y pesa 0 bytes. Si se
  // la cuenta, un documento corto pero completo —menos de `minUtiles` caracteres— sale como FALLO
  // «lo que dice está adentro de las imágenes» sin tener ninguna. Una imagen es un archivo con bytes.
  const imagenes = ix.entradas.filter((e) => e.nombre.startsWith('word/media/') && !e.nombre.endsWith('/') && e.original > 0).length
  if (utiles === 0) {
    return { ok: false, soloImagenes: imagenes > 0, utiles, imagenes, bloques, texto, porQue: `el .docx se abrió (${bloques.length} bloque(s), ${imagenes} imagen(es) incrustada(s)) y no dejó un solo carácter de texto${imagenes ? ': todo lo que dice está adentro de las imágenes y haría falta OCR' : ': el documento está vacío'}` }
  }
  if (utiles < minUtiles && imagenes > 0) {
    return { ok: false, soloImagenes: true, utiles, imagenes, bloques, texto, porQue: `el .docx se abrió y dejó ${utiles} caracteres de texto junto a ${imagenes} imagen(es) incrustada(s): lo que dice está adentro de las imágenes y haría falta OCR para leerlo` }
  }
  return {
    ok: true, texto, bloques, utiles, imagenes, escaso: utiles < minUtiles,
    parrafos: bloques.filter((b) => b.tipo === 'parrafo').length,
    tablas: bloques.filter((b) => b.tipo === 'tabla').length,
    filas: bloques.filter((b) => b.tipo === 'tabla').reduce((a, b) => a + b.filas.length, 0),
  }
}
