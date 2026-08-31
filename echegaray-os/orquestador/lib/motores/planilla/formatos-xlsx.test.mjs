// LA PRUEBA DE QUE EL "NO" DEL .XLSX/.XLSM NO ES UNA OPINIÓN.
//
// ═══ POR QUÉ HACE FALTA MEDIRLO ═══
//
// `formatos.mjs` se niega a escribir un .xlsx y un .xlsm, y dice que reescribirlos perdería la
// validación de datos, el formato condicional y —en el .xlsm— las macros. Eso es una AFIRMACIÓN, y
// una afirmación sin evidencia adjunta no está pendiente: está incumplida.
//
// Este archivo la mide. Arma un .xlsx REAL a mano —un .xlsx es un ZIP de XML, así que se puede
// construir sin depender de la misma librería que se está evaluando—, con una fórmula y una
// validación de datos adentro. Después lo pasa por el ÚNICO escritor de planillas que este repo
// tiene (`xlsx`, SheetJS community) y mira qué vuelve.
//
// Si algún día se agrega una librería que sí preserva, este test se pone rojo —la validación
// sobreviviría— y eso es la señal de que la capacidad de `formatos.mjs` se puede abrir.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'

import { FORMATOS, capacidades } from './formatos.mjs'

/** Un .xlsx mínimo, armado a mano. Se usa STORE (sin comprimir) para no depender de nada más que
 *  de los CRC32, y así el archivo es un ZIP válido que SheetJS abre igual que uno de Excel. */
function xlsxDePrueba() {
  const archivos = [
    ['[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '</Types>'],
    ['_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'],
    ['xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '</Relationships>'],
    ['xl/worksheets/sheet1.xml',
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetData>'
      + '<row r="1"><c r="A1"><v>10</v></c><c r="B1"><v>20</v></c></row>'
      + '<row r="2"><c r="A2"><f>SUM(A1:B1)</f><v>30</v></c></row>'
      + '<row r="3"><c r="A3" t="s"/></row>'
      + '</sheetData>'
      // LA PIEZA QUE IMPORTA: una validación de datos sobre C1:C10. Es lo que hace que una columna
      // de obra sólo acepte las obras que existen.
      + '<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="C1:C10">'
      + '<formula1>"Quattropani,San Francisco"</formula1></dataValidation></dataValidations>'
      + '</worksheet>'],
  ]
  return zip(archivos)
}

/** ZIP sin compresión (método 0). Suficiente para un archivo válido y sin dependencias. */
function zip(entradas) {
  const locales = []
  const centrales = []
  let offset = 0
  for (const [nombre, texto] of entradas) {
    const n = Buffer.from(nombre, 'utf8')
    const d = Buffer.from(texto, 'utf8')
    const crc = zlib.crc32 ? zlib.crc32(d) : crc32(d)
    const local = Buffer.alloc(30 + n.length + d.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc >>> 0, 14)
    local.writeUInt32LE(d.length, 18)
    local.writeUInt32LE(d.length, 22)
    local.writeUInt16LE(n.length, 26)
    n.copy(local, 30)
    d.copy(local, 30 + n.length)
    locales.push(local)

    const central = Buffer.alloc(46 + n.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc >>> 0, 16)
    central.writeUInt32LE(d.length, 20)
    central.writeUInt32LE(d.length, 24)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(offset, 42)
    n.copy(central, 46)
    centrales.push(central)
    offset += local.length
  }
  const dir = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(entradas.length, 8)
  fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(dir.length, 12)
  fin.writeUInt32LE(offset, 16)
  return Buffer.concat([...locales, dir, fin])
}

/** CRC32 propio para Node sin `zlib.crc32`. */
function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return ~c
}

test('XLSX · el .xlsx de prueba es un archivo real: SheetJS le lee el valor Y la fórmula', async () => {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(xlsxDePrueba(), { type: 'buffer', cellFormula: true })
  const hoja = wb.Sheets.Datos
  assert.equal(hoja.A1.v, 10)
  assert.equal(hoja.A2.f, 'SUM(A1:B1)', 'si esto falla, el fixture está mal armado y el resto no prueba nada')
})

// LA MEDICIÓN QUE JUSTIFICA EL `UNSUPPORTED_OPERATION`.
test('XLSX · el round-trip por el único escritor disponible PIERDE la validación de datos', async () => {
  const XLSX = await import('xlsx')
  const original = xlsxDePrueba()
  assert.ok(original.includes('dataValidation'), 'el original la trae')

  // Leer y volver a escribir: exactamente lo que haría un motor que "soportara" .xlsx.
  const wb = XLSX.read(original, { type: 'buffer', cellFormula: true, bookVBA: true })
  const vuelta = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  // La validación NO vuelve. No hay error, no hay aviso: el archivo abre igual y la columna de obra
  // pasa a aceptar cualquier cosa. Ésa es la pérdida silenciosa que `formatos.mjs` se niega a causar.
  assert.ok(!vuelta.includes('dataValidation'),
    'SheetJS conservó la validación: revisar si `formatos.mjs` ya puede permitir escribir .xlsx')

  // Y el valor sí sobrevive — por eso la pérdida es invisible: el archivo "anda".
  const revuelto = XLSX.read(vuelta, { type: 'buffer' })
  assert.equal(revuelto.Sheets.Datos.A1.v, 10)
})

test('XLSM · el motor no intenta escribirlo, y dice que se perderían las macros', () => {
  const cap = capacidades(FORMATOS.XLSM)
  assert.equal(cap.escribir, false)
  assert.equal(cap.estructura, false)
  assert.equal(cap.leer, true)
  assert.match(cap.motivo, /macros/i)
  // La alternativa importa tanto como el NO: sin ella, el llamador sólo sabe que no puede.
  assert.match(cap.alternativa, /COPIA/i)
})
