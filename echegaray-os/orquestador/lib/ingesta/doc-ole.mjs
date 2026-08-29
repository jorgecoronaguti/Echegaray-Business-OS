// EL `.doc` BINARIO DE WORD 97-2003. PURO salvo el contenedor OLE, que lo abre `xlsx`.
//
// ═══ POR QUÉ NO HACE FALTA UNA HERRAMIENTA EXTERNA ═══
//
// La respuesta cómoda a un `.doc` es «hace falta antiword / libreoffice / pandoc». En esta máquina
// no está ninguno de los tres —se verificó, no se supuso— y prometer un conversor que no existe es
// dejar los archivos sin leer con una excusa técnica. Lo que SÍ está es `xlsx`, que es dependencia
// declarada del repo y expone `XLSX.CFB`: el lector del contenedor OLE2 que necesita el `.doc` para
// abrir sus flujos, porque es el mismo contenedor que usa el `.xls`.
//
// ═══ EL TEXTO DE UN `.doc` NO ES CONTIGUO, Y ÉSE ES TODO EL PROBLEMA ═══
//
// Sacar los bytes imprimibles del flujo `WordDocument` devuelve texto mezclado con basura y con
// pedazos de versiones anteriores del documento —Word guarda ediciones rápidas dejando el texto
// viejo adentro—. El documento REAL es la lista de PIEZAS del «piece table», que vive en otro flujo
// (`0Table` o `1Table`, lo dice una bandera del FIB) y dice, en orden, de dónde sacar cada tramo y
// si está en un byte por carácter (cp1252) o en dos (UTF-16). Sin eso no se lee un `.doc`: se lee
// algo parecido.
import XLSX from 'xlsx'

/** Los 27 puntos de cp1252 entre 0x80 y 0x9F que NO coinciden con latin-1. Sin esta tabla, cada
 *  comilla tipográfica y cada guion largo de un pliego entran como un carácter de control. */
const CP1252_ALTO = Object.freeze({
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC,
  0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
})

/** La firma del contenedor OLE2. Se mira el CONTENIDO, no la extensión. PURA. */
export const pareceOle = (b) => b.length > 8 && b.readUInt32LE(0) === 0xE011CFD0 && b.readUInt32LE(4) === 0xE11AB1A1

/** Desplazamientos del FIB que este lector usa. Son constantes del formato, no elecciones. */
export const FIB = Object.freeze({ IDENT: 0x0000, NFIB: 0x0002, FLAGS: 0x000A, CCP_TEXT: 0x004C, FC_CLX: 0x01A2, LCB_CLX: 0x01A6 })

/** Los caracteres de control que un `.doc` usa como ESTRUCTURA, no como texto. PURA. */
export const CTRL = Object.freeze({
  CAMPO_INICIO: 0x13, CAMPO_SEPARADOR: 0x14, CAMPO_FIN: 0x15,
  CELDA: 0x07, PARRAFO: 0x0D, SALTO: 0x0B, TABULACION: 0x09,
})

/**
 * EL PIECE TABLE, LEÍDO DEL FLUJO DE TABLA. PURA.
 *
 * El `Clx` es una secuencia de bloques: `0x01` es un grupo de propiedades que se saltea y `0x02` es
 * el `Pcdt` que buscamos. Recorrerlo entero en vez de asumir que el `0x02` está primero no es
 * paranoia: los pliegos con estilos propios traen `0x01` adelante.
 */
export function piezas(tabla, fcClx, lcbClx) {
  let p = fcClx
  const fin = Math.min(fcClx + lcbClx, tabla.length)
  while (p < fin) {
    const tipo = tabla[p]
    if (tipo === 0x01) { p += 3 + tabla.readUInt16LE(p + 1); continue }
    if (tipo !== 0x02) return { ok: false, porQue: `el Clx trae un bloque de tipo 0x${tipo.toString(16)} que no es ni propiedades (0x01) ni piece table (0x02)` }
    const lcb = tabla.readUInt32LE(p + 1)
    const base = p + 5
    const n = (lcb - 4) / 12
    if (!Number.isInteger(n) || n <= 0) return { ok: false, porQue: `el piece table declara ${lcb} bytes, que no dan un número entero de piezas` }
    if (base + lcb > tabla.length) return { ok: false, porQue: 'el piece table se sale del flujo de tabla: el archivo está truncado' }
    const cps = []
    for (let i = 0; i <= n; i++) cps.push(tabla.readUInt32LE(base + i * 4))
    const lista = []
    for (let i = 0; i < n; i++) {
      const off = base + (n + 1) * 4 + i * 8
      const bruto = tabla.readUInt32LE(off + 2)
      const comprimido = Boolean(bruto & 0x40000000)
      lista.push({ desde: comprimido ? (bruto & ~0x40000000) / 2 : bruto, caracteres: cps[i + 1] - cps[i], comprimido })
    }
    return { ok: true, piezas: lista }
  }
  return { ok: false, porQue: 'el Clx no contiene ningún piece table (0x02): sin él no se sabe dónde está el texto' }
}

/**
 * DE LAS PIEZAS AL TEXTO, RESOLVIENDO LOS CONTROLES. PURA.
 *
 * El código de un campo —lo que va entre `0x13` y `0x14`— NO es texto del documento: es la fórmula
 * que lo genera. Un índice automático mete ahí `PAGEREF _Toc179902451 \h 2` treinta veces, y ese
 * ruido después aparece como si fuera una cláusula del pliego.
 */
export function textoDePiezas(doc, lista) {
  let salida = ''
  let enCodigoDeCampo = false
  for (const pz of lista) {
    const largo = pz.comprimido ? pz.caracteres : pz.caracteres * 2
    if (pz.desde < 0 || pz.desde + largo > doc.length) continue
    for (let k = 0; k < pz.caracteres; k++) {
      const c = pz.comprimido ? (CP1252_ALTO[doc[pz.desde + k]] ?? doc[pz.desde + k]) : doc.readUInt16LE(pz.desde + k * 2)
      if (c === CTRL.CAMPO_INICIO) { enCodigoDeCampo = true; continue }
      if (c === CTRL.CAMPO_SEPARADOR) { enCodigoDeCampo = false; continue }
      if (c === CTRL.CAMPO_FIN) { enCodigoDeCampo = false; continue }
      if (enCodigoDeCampo) continue
      if (c === CTRL.CELDA) { salida += ' | '; continue }
      if (c === CTRL.PARRAFO || c === CTRL.SALTO) { salida += '\n'; continue }
      if (c === CTRL.TABULACION) { salida += '\t'; continue }
      if (c < 0x20) continue
      salida += String.fromCharCode(c)
    }
  }
  // Un `|` que quedó solo en su línea es el resto de una fila de tabla vacía, no una celda.
  return salida.split('\n').map((l) => l.replace(/(\s*\|\s*)+$/, '').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * LEER UN `.doc` BINARIO. Devuelve SIEMPRE la misma forma, también cuando no se pudo.
 *
 * `cfb` se puede inyectar para probar el camino de error sin fabricar un OLE2 entero a mano.
 */
export function leerDocOle(bytes, { cfb = XLSX.CFB } = {}) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (!pareceOle(b)) return { ok: false, porQue: 'no empieza con la firma D0 CF 11 E0 de un contenedor OLE2: no es un .doc de Word 97-2003' }
  let ole
  try { ole = cfb.read(b, { type: 'buffer' }) } catch (e) { return { ok: false, porQue: `el contenedor OLE2 no se pudo abrir: ${String(e?.message ?? e).slice(0, 140)}` } }
  const wd = cfb.find(ole, 'WordDocument')
  if (!wd) {
    const flujos = (ole.FullPaths ?? []).map((p) => p.split('/').pop()).filter(Boolean)
    return { ok: false, porQue: `el OLE2 se abrió y no tiene el flujo «WordDocument»: es otro tipo de archivo de Office (flujos: ${flujos.slice(0, 6).join(', ') || 'ninguno'})` }
  }
  const doc = Buffer.from(wd.content)
  if (doc.length < 0x1AA) return { ok: false, porQue: `el flujo WordDocument tiene ${doc.length} bytes y el FIB necesita al menos 426: está truncado` }
  const nFib = doc.readUInt16LE(FIB.NFIB)
  const cual = (doc.readUInt16LE(FIB.FLAGS) & 0x0200) ? '1Table' : '0Table'
  const t = cfb.find(ole, cual)
  if (!t) return { ok: false, porQue: `el FIB dice que el piece table vive en «${cual}» y ese flujo no está en el archivo` }
  const pt = piezas(Buffer.from(t.content), doc.readUInt32LE(FIB.FC_CLX), doc.readUInt32LE(FIB.LCB_CLX))
  if (!pt.ok) return { ok: false, porQue: pt.porQue, nFib }
  const texto = textoDePiezas(doc, pt.piezas).trim()
  const utiles = texto.replace(/\s+/g, '').length
  if (!utiles) return { ok: false, nFib, utiles: 0, piezas: pt.piezas.length, porQue: `el .doc se abrió y sus ${pt.piezas.length} pieza(s) de texto no dejaron un solo carácter: el contenido está en objetos incrustados o en imágenes` }
  return { ok: true, texto, utiles, nFib, piezas: pt.piezas.length, ccpText: doc.readUInt32LE(FIB.CCP_TEXT) }
}
