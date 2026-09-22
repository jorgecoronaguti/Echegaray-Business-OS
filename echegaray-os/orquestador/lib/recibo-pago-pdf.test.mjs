// EL PDF DEL RECIBO FIRMADO — lo que sube la VM al legajo. Sin base y sin red.
//
// MUTACIONES QUE LO PONEN EN ROJO:
//   · no anexar la foto del papel (queda una hoja sola cuando el recibo se firmó en papel).
//   · leer el `date` de pg en UTC (un día corrido: el período del PDF diría otra quincena).
//   · aceptar una foto HEIC en silencio (pdf-lib no la embebe: tiene que fallar con su motivo).

import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { PDFParse } from 'pdf-parse'
import { diaDe, pdfDelRecibo } from './recibo-pago-pdf.mjs'

// Un PNG de 1×1 válido.
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const TRAZO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"><path d="M10 20L40 60L80 30L120 90" fill="none" stroke="#1F1F1E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const fila = {
  codigo: 'REC-2026-0412', persona_nombre: 'AGÜERO MARIO', obra: 'QP - SALÓN COMERCIAL',
  desde: new Date(2026, 8, 16), hasta: new Date(2026, 8, 30), horas: '96.00', bruto: '725400.00', adelanto: '42000.00',
  ya_transferido: '0.00', total: '683400.00', por_banco: '341700.00', en_efectivo: '341700.00',
  trazo: TRAZO, firmado_en: new Date('2026-09-30T21:42:00Z'), archivado_en: new Date('2026-10-01T13:00:00Z'), papel_path: null,
}

async function texto(bytes) {
  const p = new PDFParse({ data: new Uint8Array(bytes) })
  const t = await p.getText()
  await p.destroy()
  return t.text
}

test('el `date` de pg (medianoche local) se lee con los componentes locales', () => {
  assert.equal(diaDe(new Date(2026, 8, 16)), '2026-09-16')
  assert.equal(diaDe('2026-09-16'), '2026-09-16')
})

test('firmado en el teléfono: una hoja, con la foto de los importes y el período', async () => {
  const bytes = await pdfDelRecibo(fila, null)
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getPageCount(), 1)
  const t = await texto(bytes)
  for (const s of ['REC-2026-0412', 'AGÜERO MARIO', '16 al 30 de septiembre de 2026', '725.400', '- 42.000', '$ 683.400', 'conformidad interna']) {
    assert.ok(t.includes(s), `falta «${s}» en el PDF`)
  }
})

test('firmado en papel: la foto va en la hoja siguiente; conviven con el trazo', async () => {
  const bytes = await pdfDelRecibo({ ...fila, papel_path: 'u/recibo/r-1.png' }, PNG)
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2)
})

test('papel en PDF: sus páginas se anexan; HEIC falla con su motivo', async () => {
  const otro = await PDFDocument.create()
  otro.addPage(); otro.addPage()
  const bytes = await pdfDelRecibo({ ...fila, papel_path: 'u/recibo/r-1.pdf' }, await otro.save())
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 3)
  await assert.rejects(pdfDelRecibo({ ...fila, papel_path: 'u/recibo/r-1.heic' }, PNG), /heic/)
})
