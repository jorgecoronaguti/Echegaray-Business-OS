// EL PAPEL DEL RECIBO DE PAGO EN EFECTIVO — se lee el PDF que sale, no la función que lo arma.
// Una hoja A4; ORIGINAL y DUPLICADO con el mismo número, importe y frase; renglones de firma; logo; ANULADO.
import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFName, PDFRawStream, PDFArray, type PDFRef } from 'pdf-lib'
import { pdfDeReciboPago } from './reciboPagoPdf.ts'
import type { ReciboPagoImpreso } from '../logica/reciboPago.ts'

const TELLO: ReciboPagoImpreso = {
  codigo: 'RP-000042', fecha: '2026-10-02', aNombreDe: 'PEDRO TELLO', documento: '20123456783', importe: 950_000,
  concepto: 'mano de obra pisos industriales', obra: 'OB-0011 · SF - PISOS INDUSTRIALES', anulado: false,
}

/** El texto de la página, en el orden en que se dibujó: los `<hex> Tj` de pdf-lib, decodificados. */
async function leer(bytes: Uint8Array): Promise<{ paginas: number; ancho: number; alto: number; texto: string; imagenes: number }> {
  const doc = await PDFDocument.load(bytes)
  const [p] = doc.getPages()
  const contenidos = p.node.Contents()
  const refs = contenidos instanceof PDFArray ? contenidos.asArray() : [contenidos]
  let crudo = ''
  for (const r of refs) {
    const s = doc.context.lookup(r as PDFRef)
    assert.ok(s instanceof PDFRawStream)
    const filtro = s.dict.get(PDFName.of('Filter'))
    crudo += Buffer.from(filtro ? inflateSync(s.contents) : s.contents).toString('latin1')
  }
  const texto = [...crudo.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('\n')
  const imagenes = (crudo.match(/\/Image-\d+[^\n]*Do|Do\b/g) ?? []).length
  return { paginas: doc.getPageCount(), ancho: p.getWidth(), alto: p.getHeight(), texto, imagenes }
}

test('una hoja A4 con ORIGINAL y DUPLICADO, cada uno con número, importe, frase, obra, efectivo, lugar y firma', async () => {
  const l = await leer(await pdfDeReciboPago(TELLO))
  assert.equal(l.paginas, 1)
  assert.equal(Math.round(l.ancho), 595)
  assert.equal(Math.round(l.alto), 842)
  const veces = (t: string) => l.texto.split(t).length - 1
  assert.equal(veces('ORIGINAL'), 1)
  assert.equal(veces('DUPLICADO'), 1)
  assert.equal(veces('Recibo N° RP-000042 · 02/10/2026'), 2)
  assert.equal(veces('$ 950.000,00'), 2, 'el importe en la caja del encabezado, en las dos copias')
  assert.equal(veces('novecientos cincuenta mil'), 2)
  assert.equal(veces('ECHEGARAY CONSTRUCCIONES S.A.S.'), 4, 'encabezado y frase, en las dos copias')
  assert.equal(veces('Obra: OB-0011 · SF - PISOS INDUSTRIALES'), 2)
  assert.equal(veces('Forma de pago: Efectivo'), 2)
  assert.equal(veces('San Juan, 02/10/2026'), 2)
  for (const r of ['Firma', 'Aclaración', 'DNI / CUIT']) assert.equal(veces(r), 2, r)
  assert.equal(veces('ANULADO'), 0)
  assert.ok(l.imagenes >= 2, 'el logo, una vez por copia')
})

test('sin obra no dice «Obra:»; anulado lo dice en las dos copias; importe inválido no arma papel', async () => {
  const l = await leer(await pdfDeReciboPago({ ...TELLO, obra: null, documento: null, anulado: true }))
  assert.equal(l.texto.includes('Obra:'), false)
  assert.equal(l.texto.split('ANULADO').length - 1, 2)
  await assert.rejects(pdfDeReciboPago({ ...TELLO, importe: 0 }))
})
