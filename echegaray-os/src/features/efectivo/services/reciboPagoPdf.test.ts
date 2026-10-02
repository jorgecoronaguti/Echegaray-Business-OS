// EL PAPEL DEL RECIBO DE PAGO EN EFECTIVO — se lee el PDF que sale, no la función que lo arma.
// Una hoja A4; ORIGINAL y DUPLICADO con el mismo número, importe y frase; renglones de firma; logo; ANULADO.
import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFName, PDFRawStream, PDFArray, type PDFRef } from 'pdf-lib'
import { pdfDeReciboPago, pdfDeRecibosPago } from './reciboPagoPdf.ts'
import type { ReciboPagoImpreso } from '../logica/reciboPago.ts'

const TELLO: ReciboPagoImpreso = {
  codigo: 'RP-000042', fecha: '2026-10-02', aNombreDe: 'PEDRO TELLO', documento: '20123456783', importe: 950_000,
  concepto: 'mano de obra pisos industriales', obra: 'OB-0011 · SF - PISOS INDUSTRIALES', anulado: false,
}

/** El texto de la página, en el orden en que se dibujó: los `<hex> Tj` de pdf-lib, decodificados. */
async function leer(bytes: Uint8Array, hoja = 0): Promise<{ paginas: number; ancho: number; alto: number; texto: string; imagenes: number }> {
  const doc = await PDFDocument.load(bytes)
  const p = doc.getPages()[hoja]
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

test('por defecto UNA copia (dueño 02/10: «no quiero duplicado»): cada dato una vez, sin ORIGINAL/DUPLICADO', async () => {
  const l = await leer(await pdfDeReciboPago(TELLO))
  assert.equal(l.paginas, 1)
  const veces = (t: string) => l.texto.split(t).length - 1
  assert.equal(veces('ORIGINAL'), 0)
  assert.equal(veces('DUPLICADO'), 0)
  assert.equal(veces('Recibo N° RP-000042 · 02/10/2026'), 1)
  assert.equal(veces('$ 950.000,00'), 1)
  assert.equal(veces('novecientos cincuenta mil'), 1)
  assert.equal(veces('ECHEGARAY CONSTRUCCIONES S.A.S.'), 2, 'encabezado y frase')
  for (const r of ['Firma', 'Aclaración', 'DNI / CUIT', 'Forma de pago: Efectivo', 'San Juan, 02/10/2026']) assert.equal(veces(r), 1, r)
  assert.ok(l.imagenes >= 1, 'el logo')
})

test('con duplicado: una hoja A4 con ORIGINAL y DUPLICADO, cada uno con número, importe, frase, obra, efectivo, lugar y firma', async () => {
  const l = await leer(await pdfDeReciboPago(TELLO, { duplicado: true }))
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
  const l = await leer(await pdfDeReciboPago({ ...TELLO, obra: null, documento: null, anulado: true }, { duplicado: true }))
  assert.equal(l.texto.includes('Obra:'), false)
  assert.equal(l.texto.split('ANULADO').length - 1, 2)
  await assert.rejects(pdfDeReciboPago({ ...TELLO, importe: 0 }))
})

test('en lote, sin duplicado: un solo PDF, dos recibos de personas distintas por hoja, cada uno una vez', async () => {
  const lote: ReciboPagoImpreso[] = [
    { ...TELLO, codigo: 'RP-000050', aNombreDe: 'AGÜERO', importe: 55_000, obra: null },
    { ...TELLO, codigo: 'RP-000051', aNombreDe: 'ALANIZ', importe: 16_000, obra: null },
    { ...TELLO, codigo: 'RP-000052', aNombreDe: 'RETA', importe: 17_000, obra: null },
  ]
  const bytes = await pdfDeRecibosPago(lote)
  const hojas = [await leer(bytes, 0), await leer(bytes, 1)]
  assert.equal(hojas[0].paginas, 2, '3 recibos = 2 hojas')
  const veces = (h: number, t: string) => hojas[h].texto.split(t).length - 1
  for (const [i, r] of lote.entries()) {
    const h = Math.floor(i / 2)
    assert.equal(veces(h, `Recibo N° ${r.codigo}`), 1, r.codigo)
    assert.equal(veces(h, r.aNombreDe), 1, r.aNombreDe)
    assert.equal(veces(h, `$ ${r.importe.toLocaleString('es-AR')},00`), 1)
  }
  assert.equal(veces(0, 'DUPLICADO') + veces(1, 'DUPLICADO'), 0)
  // Con duplicado, una hoja por recibo con las dos copias.
  const conDup = await pdfDeRecibosPago(lote, { duplicado: true })
  const h2 = await leer(conDup, 2)
  assert.equal(h2.paginas, 3)
  assert.equal(h2.texto.split('Recibo N° RP-000052').length - 1, 2)
  // Un recibo sin importe frena el lote entero: no sale una hoja en blanco entre las firmadas.
  await assert.rejects(pdfDeRecibosPago([lote[0], { ...lote[1], importe: 0 }]))
  await assert.rejects(pdfDeRecibosPago([]))
})
