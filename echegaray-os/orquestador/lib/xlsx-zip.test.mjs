import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { contenidoDe, editarXlsx, entradasDe, escribirZip, reemplazarEntrada } from './xlsx-zip.mjs'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN, MEDIDO EL 10/09/2026:
// abrir el .xlsx que Santander aceptó con una librería de planillas y volver a guardarlo devolvió
// un archivo SIN `xl/media/image1..5.png`, SIN los cinco `xl/drawings/drawing*.xml`, SIN
// `docProps/custom.xml` y SIN las cinco validaciones de datos de la hoja Pagos — y CON un
// `xl/metadata.xml` que el original no tenía. El archivo se veía bien y era otro archivo.

function entrada(nombre, texto, { metodo = 8 } = {}) {
  const buf = Buffer.from(texto)
  return {
    nombre,
    versionMadeBy: 20, versionNeeded: 20, flags: 0, metodo,
    hora: 0x4a20, fecha: 0x5929,
    crc: zlib.crc32(buf) >>> 0,
    original: buf.length,
    extraCD: Buffer.alloc(0), extraLocal: Buffer.alloc(0),
    atributosInternos: 0, atributosExternos: 0x20,
    datosCrudos: metodo === 8 ? zlib.deflateRawSync(buf) : buf,
  }
}

const IMAGEN = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 250, 251, 252, 253])

function librito() {
  return [
    entrada('[Content_Types].xml', '<Types/>'),
    entrada('xl/workbook.xml', '<workbook><sheets><sheet name="Pagos" r:id="rId1"/></sheets></workbook>'),
    entrada('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"/></sheetData></worksheet>'),
    { ...entrada('xl/media/image1.png', ''), crc: zlib.crc32(IMAGEN) >>> 0, original: IMAGEN.length, datosCrudos: zlib.deflateRawSync(IMAGEN) },
    entrada('docProps/custom.xml', '<Properties><p>1</p></Properties>'),
  ]
}

test('lo que se escribe se vuelve a leer igual', () => {
  const bytes = escribirZip(librito())
  const e = entradasDe(bytes)
  assert.equal(e.length, 5)
  assert.deepEqual(e.map((x) => x.nombre), librito().map((x) => x.nombre))
  assert.equal(contenidoDe(e, 'xl/workbook.xml').toString(), '<workbook><sheets><sheet name="Pagos" r:id="rId1"/></sheets></workbook>')
  assert.ok(contenidoDe(e, 'xl/media/image1.png').equals(IMAGEN))
})

test('cambiar una hoja NO se lleva puestas las imágenes ni las otras entradas', () => {
  const original = escribirZip(librito())
  const nuevo = editarXlsx(original, 'xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="9"/></sheetData></worksheet>')
  const a = entradasDe(original), b = entradasDe(nuevo)
  assert.deepEqual(b.map((x) => x.nombre), a.map((x) => x.nombre), 'ni una entrada de más ni de menos, en el mismo orden')
  for (const n of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/media/image1.png', 'docProps/custom.xml']) {
    assert.ok(contenidoDe(b, n).equals(contenidoDe(a, n)), `${n} cambió y no debía`)
  }
  assert.match(contenidoDe(b, 'xl/worksheets/sheet1.xml').toString(), /row r="9"/)
})

test('las entradas que no se tocan conservan sus bytes comprimidos, su CRC y su fecha', () => {
  const original = escribirZip(librito())
  const nuevo = editarXlsx(original, 'xl/worksheets/sheet1.xml', '<worksheet/>')
  const a = entradasDe(original), b = entradasDe(nuevo)
  const img = (e) => e.find((x) => x.nombre === 'xl/media/image1.png')
  assert.equal(img(b).crc, img(a).crc)
  assert.equal(img(b).fecha, img(a).fecha)
  assert.equal(img(b).hora, img(a).hora)
  assert.ok(img(b).datosCrudos.equals(img(a).datosCrudos), 'se recomprimió en vez de copiarse')
})

test('una entrada guardada sin comprimir se lee igual que una comprimida', () => {
  const e = escribirZip([entrada('a.xml', '<a/>', { metodo: 0 }), entrada('b.xml', '<b/>')])
  const leidas = entradasDe(e)
  assert.equal(contenidoDe(leidas, 'a.xml').toString(), '<a/>')
  assert.equal(contenidoDe(leidas, 'b.xml').toString(), '<b/>')
})

test('reemplazar una entrada que no existe tira en vez de agregarla', () => {
  assert.throws(() => reemplazarEntrada(librito(), 'xl/inventada.xml', '<x/>'), /no existe en el archivo/)
})

test('pedir el contenido de una entrada que no existe tira con el nombre adentro', () => {
  assert.throws(() => contenidoDe(librito(), 'xl/no-esta.xml'), /xl\/no-esta\.xml/)
})

test('un archivo que no es un ZIP no se abre en silencio', () => {
  assert.throws(() => entradasDe(Buffer.from('esto no es un zip')), /directorio central/)
})
