// EL NOMBRE MIENTE, LOS BYTES NO.
//
// Cada caso de acá es una forma real en la que un archivo llega mal etiquetado al chat: el CSV que el
// homebanking guarda como .xls, la foto que WhatsApp renombra, el PDF con extensión de imagen. Si la
// detección se resolviera por el nombre, todos esos terminarían en el camino equivocado — que es
// exactamente lo que pasó con el CSV del extracto que hubo que bajar a mano.

import test from 'node:test'
import assert from 'node:assert/strict'
import { detectarFormato, extensionDe, pareceTabla, FAMILIA, tamanoLegible } from './deteccion.mjs'

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3)])
const pdf = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 1)])
const CSV_BANCO = [
  'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
  '22/07/2026;0133;CENTRO;001;000008689;Transferencia recibida;1.234.567,89;5.000.000,00',
  '23/07/2026;0133;CENTRO;002;000008690;Pago proveedores;(234.567,89);4.765.432,11',
].join('\n')

test('un PNG es un PNG aunque lo llamen .pdf, y la contradicción se DECLARA', () => {
  const r = detectarFormato({ bytes: png(), nombre: 'factura.pdf', mimeDeclarado: 'application/pdf' })
  assert.equal(r.familia, FAMILIA.IMAGEN)
  assert.equal(r.formato, 'png')
  assert.match(r.discrepancia, /se llama \.pdf pero su contenido es png/)
})

test('un JPEG con mime application/octet-stream sigue siendo una imagen', () => {
  const r = detectarFormato({ bytes: jpg(), nombre: 'IMG-20260804.jpeg', mimeDeclarado: 'application/octet-stream' })
  assert.equal(r.familia, FAMILIA.IMAGEN)
  assert.equal(r.formato, 'jpeg')
  assert.equal(r.discrepancia, null, 'el nombre y el contenido coinciden: no hay nada que declarar')
})

test('EL CASO DEL DUEÑO: un CSV del banco guardado como .xls se detecta como planilla de texto', () => {
  const r = detectarFormato({
    bytes: Buffer.from(CSV_BANCO, 'utf8'),
    nombre: 'descargaUltimosMovimientos.xls',
    mimeDeclarado: 'application/vnd.ms-excel',
  })
  assert.equal(r.familia, FAMILIA.PLANILLA, 'tiene que ir al camino de planillas, no al de imágenes')
  assert.equal(r.formato, 'csv', 'los bytes son texto: no es un Excel binario')
  assert.equal(r.discrepancia, null, '.xls y csv son los dos planilla: no hay contradicción de familia')
})

test('un PDF real cae en la familia PDF', () => {
  const r = detectarFormato({ bytes: pdf(), nombre: 'contrato.pdf' })
  assert.equal(r.familia, FAMILIA.PDF)
  assert.equal(r.formato, 'pdf')
})

test('un ZIP con `xl/` adentro es un xlsx aunque el nombre no lo diga', () => {
  const zip = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml....xl/workbook.xml....xl/worksheets/sheet1.xml'),
  ])
  const r = detectarFormato({ bytes: zip, nombre: 'adjunto' })
  assert.equal(r.familia, FAMILIA.PLANILLA)
  assert.equal(r.formato, 'xlsx')
})

test('un ZIP con `word/` adentro NO es una planilla: es un docx, y no se procesa', () => {
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml')])
  const r = detectarFormato({ bytes: zip, nombre: 'nota.docx' })
  assert.equal(r.familia, FAMILIA.OTRO)
  assert.equal(r.formato, 'docx')
})

test('un ZIP común se declara ZIP: el OS no abre comprimidos', () => {
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('carpeta/foto.jpg')])
  assert.equal(detectarFormato({ bytes: zip, nombre: 'todo.zip' }).formato, 'zip')
})

test('ARCHIVO VACÍO: se dice "vacío", que no es lo mismo que "ilegible"', () => {
  const r = detectarFormato({ bytes: Buffer.alloc(0), nombre: 'extracto.csv' })
  assert.equal(r.familia, FAMILIA.VACIO)
  assert.match(r.motivo, /no tiene contenido/)
})

test('ARCHIVO CORRUPTO: ni firma ni texto → ilegible, y NO se adivina por el nombre', () => {
  // Bytes binarios con NUL: no son de ningún formato conocido y tampoco son texto.
  const basura = Buffer.from([0x00, 0x13, 0x37, 0x00, 0xff, 0xfe, 0x01, 0x02, 0x00, 0x99])
  const r = detectarFormato({ bytes: basura, nombre: 'extracto.csv' })
  assert.equal(r.familia, FAMILIA.ILEGIBLE, 'llamarse .csv no lo convierte en un CSV')
  assert.equal(r.formato, null)
  assert.match(r.discrepancia, /no corresponde a ningún formato/)
})

test('un texto plano SIN columnas no es una planilla', () => {
  const r = detectarFormato({ bytes: Buffer.from('Hola, te mando la nota de la obra.\nSaludos.'), nombre: 'nota.txt' })
  assert.equal(r.familia, FAMILIA.TEXTO)
})

test('el WEBP vive adentro de un RIFF: la firma no está en el byte 0', () => {
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(32)])
  assert.equal(detectarFormato({ bytes: webp, nombre: 'foto.webp' }).formato, 'webp')
})

test('el .xls binario de verdad (OLE2) sí es una planilla', () => {
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)])
  assert.equal(detectarFormato({ bytes: ole, nombre: 'libro.xls' }).formato, 'xls')
  assert.equal(detectarFormato({ bytes: ole, nombre: 'carta.doc' }).formato, 'doc')
})

test('extensionDe y pareceTabla, que son las dos pistas', () => {
  assert.equal(extensionDe('a.b.CSV'), 'csv')
  assert.equal(extensionDe('sin_extension'), null)
  assert.equal(extensionDe('.oculto'), null)
  assert.equal(pareceTabla('a;b;c\n1;2;3'), true)
  assert.equal(pareceTabla('una sola línea sin nada'), false)
})

test('el tamaño se dice en unidades que una persona lee', () => {
  assert.equal(tamanoLegible(512), '512 B')
  assert.equal(tamanoLegible(2048), '2,0 kB')
  assert.equal(tamanoLegible(5 * 1024 * 1024), '5,0 MB')
})
