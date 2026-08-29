// LA PUERTA ÚNICA DE UN DOCUMENTO DE WORD. PURA.
//
// ═══ LA EXTENSIÓN NO DECIDE NADA ═══
//
// En este data room hay `.doc` que son `.docx` renombrados —Word los guarda así cuando alguien
// "guarda como" sin mirar— y `.docx` que en realidad son RTF. Elegir el lector por el nombre del
// archivo hace que el 100% de esos casos falle con un motivo que además MIENTE («no es un ZIP»).
// Los dos formatos tienen firma propia en sus primeros bytes y esa firma la escribió el programa
// que lo guardó, no la persona que lo nombró.
//
// ═══ EL RESULTADO ES SIEMPRE LA MISMA FORMA ═══
//
//   { ok: true,  texto, utiles, variante, bloques? }
//   { ok: false, porQue, variante }
//
// `variante` sale aunque falle: saber que era un `.doc` binario truncado es distinto de saber que
// no se pudo leer.
import { leerDocx } from './docx.mjs'
import { leerDocOle, pareceOle } from './doc-ole.mjs'
import { pareceZip } from './zip.mjs'

/** Qué es realmente el archivo, según sus primeros bytes. PURA. */
export const VARIANTE = Object.freeze({ OOXML: 'OOXML', OLE2: 'OLE2', RTF: 'RTF', DESCONOCIDA: 'DESCONOCIDA' })

/** La firma, no el nombre. PURA. */
export function varianteDe(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? [])
  if (pareceZip(b)) return VARIANTE.OOXML
  if (pareceOle(b)) return VARIANTE.OLE2
  if (b.subarray(0, 5).toString('latin1') === '{\\rtf') return VARIANTE.RTF
  return VARIANTE.DESCONOCIDA
}

/**
 * LEER UN DOCUMENTO DE WORD, SEA EL QUE SEA.
 *
 * El RTF se declara y no se lee: es un formato de marcado plano donde el texto está mezclado con
 * miles de grupos de control, y sacarlo bien no es «quitar las llaves». Prefiero un motivo concreto
 * antes que un texto lleno de `\fonttbl` que después alguien cite como si fuera una cláusula. En
 * los 2.653 archivos de la carpeta no hay ninguno: si aparece uno, el motivo dice qué falta.
 */
export function leerWord(bytes, { nombre = '' } = {}) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? [])
  const variante = varianteDe(b)
  if (variante === VARIANTE.OOXML) return { ...leerDocx(b), variante }
  if (variante === VARIANTE.OLE2) return { ...leerDocOle(b), variante }
  if (variante === VARIANTE.RTF) return { ok: false, variante, porQue: 'es un RTF: este circuito no tiene lector de RTF y sacarle el texto quitando las llaves produce marcado mezclado con prosa' }
  return { ok: false, variante, porQue: `«${nombre || 'el archivo'}» no empieza ni con la firma «PK» de un .docx ni con la firma OLE2 de un .doc: no es un documento de Word aunque se llame así` }
}
