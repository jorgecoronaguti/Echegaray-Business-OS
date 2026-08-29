// ABRIR UN ARCHIVO QUE YA ESTÁ EN MEMORIA. Sin modelo, sin red, sin OCR.
//
// ═══ POR QUÉ NO ALCANZABA `buscar.mjs` ═══
//
// `traerPdf` baja una URL. Un archivo de Drive no se baja por URL: llega como bytes de la API, y
// mandarlo a un `fetch` sería inventar una dirección pública que no existe. Lo que sí se reusa es lo
// que importa: el mismo extractor (`leer-pdf.py`) y el MISMO CONTRATO — un PDF que se abre y deja
// menos de `PDF_MIN_CARACTERES_UTILES` caracteres de contenido NO es una lectura lograda, es un
// escaneado que necesita OCR, y se declara.
//
// ═══ LO QUE NO SE PUEDE LEER SE DICE, NO SE OMITE ═══
//
// Un `.docx` sin adaptador y una foto de un cómputo devuelven `ok:false` con el motivo. Ese motivo
// es el que después aparece en el informe como «lo que no se pudo leer», y sin él la respuesta a
// «¿leíste todo?» sería «no sé».
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { PDF_MIN_CARACTERES_UTILES } from './buscar.mjs'
import { errorDeCelda } from './celda.mjs'
import { FORMATO, formatoDe } from '../ingesta/registro.mjs'
import { leerWord } from '../ingesta/word.mjs'

const correr = promisify(execFile)
const GUION_PDF = path.join(path.dirname(new URL(import.meta.url).pathname), 'leer-pdf.py')

/** Tope de páginas de PDF por esta vía. Un pliego entero no aporta más práctica que sus primeras
 *  páginas y sí multiplica el tiempo de la corrida. */
export const PDF_MAX_PAGINAS = 80

export { PDF_MIN_CARACTERES_UTILES }

/** El hash del CONTENIDO. Es la llave de idempotencia: el mismo archivo con otro nombre, o movido de
 *  carpeta, no se vuelve a estudiar. PURA. */
export const hashDe = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

/**
 * LAS FILAS DE UNA PESTAÑA, RECORRIENDO EL RANGO A MANO. PURA salvo por el objeto de `xlsx`.
 *
 * No se usa `sheet_to_json`: esa función devuelve el VALOR CACHEADO de una celda en error —un 7
 * donde dice `#DIV/0!`— y ese número entra al circuito como si fuera plata. Acá una celda con
 * `t: 'e'` sale envuelta como error y no hay forma de confundirla con un importe.
 */
export function filasDeHoja(XLSX, hoja) {
  if (!hoja?.['!ref']) return []
  const r = XLSX.utils.decode_range(hoja['!ref'])
  // Se arranca en 0 y no en `r.s.r`: una hoja cuyo rango empieza en A3 devolvería el índice 0 para
  // la fila 3, y todas las referencias de celda de la evidencia quedarían corridas dos filas. Una
  // cita con la celda equivocada es peor que no tener cita.
  const filas = []
  for (let f = 0; f <= r.e.r; f++) {
    const fila = []
    for (let c = 0; c <= r.e.c; c++) {
      const celda = hoja[XLSX.utils.encode_cell({ r: f, c })]
      if (!celda) { fila.push(null); continue }
      fila.push(celda.t === 'e' ? errorDeCelda(celda.w || celda.v) : (celda.v ?? null))
    }
    filas.push(fila)
  }
  return filas
}

/**
 * QUÉ CELDAS TIENEN FÓRMULA. Sólo las que la tienen: la ausencia es el dato.
 *
 * Sirve para distinguir un número CALCULADO de uno ESCRITO A MANO en el mismo lugar. Medido: en la
 * oferta de LA ESTRELLA el SUB TOTAL es `#NAME?` y el IVA de abajo es un número sin fórmula — a
 * alguien se le rompió la planilla y escribió el impuesto a mano al lado del error.
 */
export function formulasDeHoja(XLSX, hoja) {
  if (!hoja?.['!ref']) return {}
  const r = XLSX.utils.decode_range(hoja['!ref'])
  const salida = {}
  for (let f = r.s.r; f <= r.e.r; f++) {
    for (let c = r.s.c; c <= r.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r: f, c })
      const celda = hoja[ref]
      if (celda?.f) salida[ref] = String(celda.f)
    }
  }
  return salida
}

/** Las filas de todas las pestañas de una planilla, como arrays de arrays. */
export async function leerPlanilla(bytes) {
  const XLSX = await import('xlsx')
  // `cellFormula: true` NO es un detalle de performance: sin él `xlsx` no guarda `.f` y entonces
  // TODA celda parece escrita a mano. El control de «el IVA está tipeado» daba rojo en 12 de 13
  // ofertas — no porque lo estuvieran, sino porque el lector no podía ver ninguna fórmula.
  const libro = XLSX.read(bytes, { type: 'buffer', cellFormula: true, cellHTML: false, cellDates: false })
  const hojas = {}
  const formulas = {}
  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre]
    if (!hoja) continue
    hojas[nombre] = filasDeHoja(XLSX, hoja)
    formulas[nombre] = formulasDeHoja(XLSX, hoja)
  }
  if (!Object.keys(hojas).length) return { ok: false, porQue: 'la planilla se abrió y no tiene ninguna pestaña con celdas' }
  return { ok: true, formato: FORMATO.PLANILLA, hojas, formulas, pestanas: libro.SheetNames }
}

/** El texto de un PDF, con el mismo control de «esto no tiene capa de texto» que la vía web. */
export async function leerPdfLocal(bytes, { maxPaginas = PDF_MAX_PAGINAS } = {}) {
  if (!Buffer.from(bytes).subarray(0, 5).toString('latin1').startsWith('%PDF')) {
    return { ok: false, porQue: 'el archivo no empieza con %PDF: no es un PDF aunque se llame así' }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conocimiento-drive-'))
  const tmp = path.join(dir, 'doc.pdf')
  try {
    fs.writeFileSync(tmp, bytes, { flag: 'wx', mode: 0o600 })
    const { stdout } = await correr('python3', [GUION_PDF, tmp, String(maxPaginas)], { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 })
    const salida = JSON.parse(stdout)
    if (salida.error) return { ok: false, porQue: salida.error }
    const utiles = Number(salida.utiles ?? 0)
    if (utiles < PDF_MIN_CARACTERES_UTILES) {
      return { ok: false, necesitaOcr: true, paginas: salida.paginas, porQue: `el PDF se abrió (${salida.paginas} páginas, ${salida.leidas} leídas) y dejó ${utiles} caracteres de contenido en ${salida.paginasConTexto ?? 0} página(s): no tiene capa de texto y haría falta OCR` }
    }
    return { ok: true, formato: FORMATO.PDF, texto: String(salida.texto ?? ''), utiles, paginas: salida.paginas, paginasLeidas: salida.leidas, paginasConTexto: salida.paginasConTexto ?? null }
  } catch (e) {
    return { ok: false, porQue: `no pude leer el PDF: ${String(e?.message ?? e).slice(0, 160)}` }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ya no está */ }
  }
}

/** Por qué NO se puede abrir cada formato que este circuito no sabe abrir. El motivo es el dato. */
export const SIN_ADAPTADOR = Object.freeze({
  [FORMATO.IMAGEN]: 'es una imagen: sólo se lee mirándola, y este circuito corre sin modelo de visión',
  // El de Word ya NO está en esta lista: `ingesta/word.mjs` abre las dos variantes sin dependencia
  // nueva. El motivo viejo —«no está la dependencia»— dejó 57 documentos sin leer, memorias
  // descriptivas y el contrato de QUATTROPANI incluidos, por una dependencia que nunca hizo falta.
  [FORMATO.DWG]: 'un DWG se mide, no se lee como texto — eso lo hace ingesta/dwg.mjs dentro del pipeline de planos',
  [FORMATO.DXF]: 'un DXF se mide, no se lee como texto — eso lo hace ingesta/dxf.mjs dentro del pipeline de planos',
  [FORMATO.COMPRIMIDO]: 'está comprimido: hay que descomprimirlo antes, y descomprimir a ciegas lo que llega de afuera no se hace',
  [FORMATO.OTRO]: 'no hay adaptador para este formato',
})

/**
 * ABRIR LO QUE SEA. Devuelve SIEMPRE la misma forma, incluso cuando no se pudo.
 *
 * El hash se calcula ANTES de intentar abrirlo: un archivo que no se pudo leer igual queda
 * identificado, y eso es lo que evita volver a bajarlo en cada corrida para volver a fallar.
 */
export async function leerArchivo(bytes, { nombre = '', mime = null } = {}) {
  const formato = formatoDe({ nombre, mime })
  const hash = hashDe(bytes)
  const base = { formato, hash, bytes: bytes.length, nombre }
  if (formato === FORMATO.PLANILLA) return { ...base, ...(await leerPlanilla(bytes)) }
  if (formato === FORMATO.PDF) return { ...base, ...(await leerPdfLocal(bytes)) }
  if (formato === FORMATO.DOCUMENTO) return { ...base, ...leerWord(bytes, { nombre }) }
  if (formato === FORMATO.TEXTO) {
    const texto = Buffer.from(bytes).toString('utf8')
    return texto.trim() ? { ...base, ok: true, texto } : { ...base, ok: false, porQue: 'el archivo de texto está vacío' }
  }
  return { ...base, ok: false, porQue: SIN_ADAPTADOR[formato] ?? SIN_ADAPTADOR[FORMATO.OTRO] }
}
