// EL LOGO EN UN .xlsx. SheetJS CE (la única librería de Excel instalada) escribe celdas pero NO imágenes, y no se
// puede instalar otra. Un .xlsx es un zip: se abre el que salió de SheetJS, se le agrega la imagen y su dibujo
// (drawing1.xml anclado a A1) y se vuelve a cerrar. No toca las celdas: el dibujo flota sobre las filas que el
// llamador dejó en blanco arriba.
//
// Sólo entiende el zip que SheetJS produce (entradas «deflate» o «stored», sin zip64 ni cifrado). Si el archivo no
// tiene ese formato falla fuerte: preferimos no entregar un Excel a medias.

import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { LOGO_ALTO, LOGO_ANCHO, logoPng } from './logoMarca.ts'

interface Entrada { nombre: string; datos: Buffer }

const EMU_POR_PX = 9525

/** CRC-32 del zip (zlib.crc32 recién existe en Node 22; esto corre en cualquier versión). */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(b: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function leerZip(z: Buffer): Entrada[] {
  let fin = z.length - 22
  while (fin >= 0 && z.readUInt32LE(fin) !== 0x06054b50) fin--
  if (fin < 0) throw new Error('xlsx sin directorio central')
  const total = z.readUInt16LE(fin + 10)
  let p = z.readUInt32LE(fin + 16)
  const salida: Entrada[] = []
  for (let i = 0; i < total; i++) {
    if (z.readUInt32LE(p) !== 0x02014b50) throw new Error('xlsx: entrada corrupta')
    const metodo = z.readUInt16LE(p + 10)
    const comprimido = z.readUInt32LE(p + 20)
    const nombreLen = z.readUInt16LE(p + 28)
    const extraLen = z.readUInt16LE(p + 30)
    const comentLen = z.readUInt16LE(p + 32)
    const local = z.readUInt32LE(p + 42)
    const nombre = z.subarray(p + 46, p + 46 + nombreLen).toString('utf8')
    const inicio = local + 30 + z.readUInt16LE(local + 26) + z.readUInt16LE(local + 28)
    const crudo = z.subarray(inicio, inicio + comprimido)
    if (metodo !== 0 && metodo !== 8) throw new Error(`xlsx: método de compresión ${metodo} no soportado`)
    salida.push({ nombre, datos: metodo === 8 ? inflateRawSync(crudo) : Buffer.from(crudo) })
    p += 46 + nombreLen + extraLen + comentLen
  }
  return salida
}

function escribirZip(entradas: Entrada[]): Buffer {
  const partes: Buffer[] = []
  const centrales: Buffer[] = []
  let offset = 0
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8')
    const comp = deflateRawSync(e.datos)
    const crc = crc32(e.datos)
    const loc = Buffer.alloc(30)
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(8, 8)
    loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(e.datos.length, 22); loc.writeUInt16LE(nombre.length, 26)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10)
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(e.datos.length, 24); cen.writeUInt16LE(nombre.length, 28); cen.writeUInt32LE(offset, 42)
    partes.push(loc, nombre, comp)
    centrales.push(cen, nombre)
    offset += 30 + nombre.length + comp.length
  }
  const dir = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(offset, 16)
  return Buffer.concat([...partes, dir, fin])
}

const CABECERA_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

function dibujo(anchoPx: number, altoPx: number): string {
  const cx = anchoPx * EMU_POR_PX
  const cy = altoPx * EMU_POR_PX
  return `${CABECERA_XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
    + '<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
    + `<xdr:ext cx="${cx}" cy="${cy}"/>`
    + '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo" descr="Echegaray Construcciones"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
    + '<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
    + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`
}

const rel = (tipo: string, destino: string): string =>
  `${CABECERA_XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${destino}"/></Relationships>`

/** Devuelve el mismo libro con el logo anclado en A1 de la primera hoja, de `altoPx` píxeles de alto. */
export function xlsxConLogo(xlsx: Uint8Array, altoPx: number): Uint8Array {
  const entradas = leerZip(Buffer.from(xlsx))
  const por = (n: string) => entradas.find((e) => e.nombre === n)
  const hoja = por('xl/worksheets/sheet1.xml')
  const tipos = por('[Content_Types].xml')
  if (!hoja || !tipos) throw new Error('xlsx sin hoja 1 o sin [Content_Types].xml')
  if (por('xl/worksheets/_rels/sheet1.xml.rels')) throw new Error('xlsx ya trae relaciones en la hoja 1: no se sabe combinar')
  const ancho = Math.round(altoPx * (LOGO_ANCHO / LOGO_ALTO))

  let xml = hoja.datos.toString('utf8')
  if (!xml.includes('xmlns:r=')) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ')
  // El orden del esquema manda: <drawing> va después de todo lo demás; si hubiera elementos que van luego, no se adivina.
  if (/<(tableParts|extLst|legacyDrawing)/.test(xml)) throw new Error('xlsx con elementos que van después de <drawing>: no soportado')
  hoja.datos = Buffer.from(xml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'), 'utf8')

  let ct = tipos.datos.toString('utf8')
  if (!ct.includes('Extension="png"')) ct = ct.replace('<Override', '<Default Extension="png" ContentType="image/png"/><Override')
  ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>')
  tipos.datos = Buffer.from(ct, 'utf8')

  entradas.push(
    { nombre: 'xl/worksheets/_rels/sheet1.xml.rels', datos: Buffer.from(rel('drawing', '../drawings/drawing1.xml')) },
    { nombre: 'xl/drawings/drawing1.xml', datos: Buffer.from(dibujo(ancho, altoPx)) },
    { nombre: 'xl/drawings/_rels/drawing1.xml.rels', datos: Buffer.from(rel('image', '../media/logo.png')) },
    { nombre: 'xl/media/logo.png', datos: Buffer.from(logoPng()) },
  )
  return new Uint8Array(escribirZip(entradas))
}
