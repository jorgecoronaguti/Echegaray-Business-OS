// LEER UN DOCUMENTO: DE BYTES A TEXTO CON PROCEDENCIA. La primera capa del motor documental.
//
// ═══ LA REGLA ECONÓMICA QUE GOBIERNA TODO EL PIPELINE ═══
//
// La capa de texto de un PDF sale GRATIS y en milisegundos. El OCR cuesta segundos de CPU por
// página en una VM sin GPU, y Claude cuesta plata. Por lo tanto: nada se manda a un modelo antes
// de comprobar que el texto no estaba ahí, escrito, esperando que alguien lo leyera.
//
// No es una optimización prematura: es la diferencia entre poder procesar los 3.045 PDF del Drive
// y no poder. `medirCorpus` de comprobantes ya había pagado esta lección con Claude.
//
// ═══ QUÉ DEVUELVE, Y POR QUÉ CON BBOX ═══
//
// Cada bloque de texto viene con su página y su rectángulo. Un dato extraído que no puede decir de
// qué página y de qué lugar salió no es evidencia: es una afirmación. Cuando el OS diga «el total
// de esta factura es $1.234.567», tiene que poder señalar dónde lo leyó.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, unlink, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { detectarFormato } from './formato.mjs'

const ejecutar = promisify(execFile)
const EXTRACTOR = new URL('./extraer.py', import.meta.url).pathname

/** Cuánto se le da a un PDF antes de darlo por colgado. Un PDF de 400 páginas con tablas tarda; uno
 *  corrupto tarda para siempre. */
const TIMEOUT_MS = Number(process.env.ORQ_DOC_TIMEOUT_MS || 90_000)

/**
 * Lee un documento y devuelve su texto con procedencia.
 *
 * @param {Buffer} bytes
 * @param {{nombre?:string, mimeDeclarado?:string, maxPaginas?:number}} opts
 * @returns {Promise<{ok:boolean, formato:object, hash:string, ...}>}
 */
export async function leerDocumento(bytes, { nombre = 'documento', mimeDeclarado = null, maxPaginas = null } = {}) {
  const formato = detectarFormato(bytes, mimeDeclarado)
  // El hash del CONTENIDO, no del nombre ni del id de Drive: es lo que permite no reprocesar el
  // mismo documento subido dos veces con nombres distintos, que en este Drive pasa todo el tiempo.
  const hash = createHash('sha256').update(bytes).digest('hex')
  const base = { formato, hash, nombre, bytes: bytes.length }

  if (!formato.leible) {
    return { ...base, ok: false, porQue: `formato ${formato.tipo}: el OS todavía no sabe abrirlo` }
  }
  if (formato.tipo !== 'pdf') {
    // Una imagen no tiene capa de texto por definición: va derecho a la decisión de OCR, sin pagar
    // una lectura que ya se sabe vacía.
    return { ...base, ok: true, esImagen: true, necesitaOcr: true, paginas: [], tablas: [], texto: '' }
  }

  const dir = await mkdtemp(join(tmpdir(), 'orq-doc-'))
  const ruta = join(dir, 'd.pdf')
  try {
    await writeFile(ruta, bytes)
    const args = [EXTRACTOR, ruta]
    if (maxPaginas) args.push('--max-paginas', String(maxPaginas))
    const { stdout } = await ejecutar('python3', args, { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
    const r = JSON.parse(stdout)
    if (!r.ok) return { ...base, ok: false, porQue: r.error }
    return {
      ...base, ok: true, esImagen: false,
      necesitaOcr: r.necesita_ocr, mixto: r.mixto,
      paginasTotales: r.paginas_totales, paginasLeidas: r.paginas_leidas, paginasConTexto: r.paginas_con_texto,
      caracteres: r.caracteres, tablas: r.tablas,
      paginas: r.paginas.map((p) => ({
        pagina: p.pagina, caracteres: p.caracteres, tieneTexto: p.tiene_texto,
        imagenes: p.imagenes, ancho: p.ancho, alto: p.alto, texto: p.texto, bloques: p.bloques,
      })),
      texto: r.paginas.map((p) => p.texto).join('\n'),
    }
  } catch (e) {
    return { ...base, ok: false, porQue: `${e.code === 'ETIMEDOUT' ? 'tardó más de ' + TIMEOUT_MS + ' ms' : e.message.slice(0, 120)}` }
  } finally {
    await unlink(ruta).catch(() => {})
  }
}

/** Los bloques de texto de todo el documento, cada uno con su página y su rectángulo. Es la unidad
 *  que después se indexa y se cita. */
export function bloquesDe(doc) {
  if (!doc?.paginas) return []
  return doc.paginas.flatMap((p) => (p.bloques ?? []).map((b) => ({ pagina: p.pagina, bbox: b.bbox, texto: b.texto })))
}
