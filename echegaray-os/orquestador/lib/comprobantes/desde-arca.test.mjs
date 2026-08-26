import test from 'node:test'
import assert from 'node:assert/strict'
import { buscarEnArca, comprobanteSinModelo, partesDelNumero, soloDigitos } from './desde-arca.mjs'
import { comprobanteDesdeQr } from './qr-afip.mjs'

const qr = (o) => `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(o)).toString('base64')}`
// Corralón Progreso (PEREZ GARCIA MARISOL BIBIANA), factura A 0004-00003727 — fila real de ARCA.
const REAL = { ver: 1, fecha: '2026-08-20', cuit: 23369111574, ptoVta: 4, tipoCmp: 1, nroCmp: 3727, importe: 18539.39, moneda: 'PES', ctz: 1, tipoDocRec: 80, nroDocRec: 30716304643, tipoCodAut: 'E', codAut: 86349811111111 }
const FILA_ARCA = {
  emisor_nombre: 'PEREZ GARCIA MARISOL BIBIANA', emisor_cuit: '23369111574', punto_venta: '4',
  numero: '3727', fecha_emision: '2026-08-20', tipo_comprobante: '1', cae: '86349811111111',
  neto_gravado: '15510.29', neto_no_gravado: null, exento: null, total_iva: '3029.1',
  otros_tributos: null, imp_total: '18539.39', iva_por_alicuota: null,
}
const consultarCon = (rows) => async () => ({ rows })

test('el CUIT cruza con guiones, con puntos o pelado', () => {
  for (const v of ['23-36911157-4', '23369111574', '23.369.111.57-4']) assert.equal(soloDigitos(v), '23369111574')
})

test('el número de la pestaña se parte sin los ceros de relleno', () => {
  assert.deepEqual(partesDelNumero('0004-00003755'), { puntoVenta: 4, numero: 3755 })
  assert.deepEqual(partesDelNumero(' 121 - 21683 '), { puntoVenta: 121, numero: 21683 })
  for (const x of ['N/A W303094', '', null, 'ABC-123']) assert.equal(partesDelNumero(x), null, String(x))
})

test('ARCA completa lo que el QR no trae: razón social, neto e IVA', async () => {
  const a = await buscarEnArca(consultarCon([FILA_ARCA]), { cuit: '23-36911157-4', puntoVenta: 4, numero: 3727 })
  assert.equal(a.razonSocial, 'PEREZ GARCIA MARISOL BIBIANA')
  assert.equal(a.neto, 15510.29)
  assert.equal(a.iva, 3029.1)
  assert.equal(a.via, 'arca')
})

test('el cruce consulta SÓLO el libro recibido — un emitido es una venta, no un gasto', async () => {
  let sql = ''
  await buscarEnArca(async (q) => { sql = q; return { rows: [] } }, { cuit: '20111111112', puntoVenta: 1, numero: 1 })
  assert.match(sql, /tipo_libro\s*=\s*'R'/)
})

test('DOS filas para la misma identidad NO se resuelven adivinando', async () => {
  // Es un duplicado en el libro. Devolver la primera cargaría una de las dos al azar.
  assert.equal(await buscarEnArca(consultarCon([FILA_ARCA, FILA_ARCA]), { cuit: '23369111574', puntoVenta: 4, numero: 3727 }), null)
})

test('QR + ARCA arman el comprobante entero, sin ningún modelo', async () => {
  const r = await comprobanteSinModelo(consultarCon([FILA_ARCA]), comprobanteDesdeQr(qr(REAL)))
  assert.equal(r.completo, true)
  assert.deepEqual(r.falta, [])
  assert.equal(r.via, 'qr_afip+arca')
  assert.equal(r.comprobante.proveedor, 'PEREZ GARCIA MARISOL BIBIANA')
  assert.equal(r.comprobante.comprobante, '0004-00003727')
  assert.equal(r.comprobante.neto, 15510.29)
  assert.equal(r.comprobante.total, 18539.39)
})

test('sin par en ARCA se dice QUÉ falta, no se completa con ceros', async () => {
  const r = await comprobanteSinModelo(consultarCon([]), comprobanteDesdeQr(qr(REAL)))
  assert.equal(r.completo, false)
  assert.deepEqual(r.falta, ['proveedor', 'neto', 'iva'])
  assert.equal(r.comprobante.neto, null, 'null es «no se sabe»; 0 afirmaría que no hubo neto')
  assert.equal(r.comprobante.total, 18539.39, 'el total sí lo trae el QR')
  assert.equal(r.via, 'qr_afip')
})

test('sin QR no hay nada — no se arranca una lectura a medias', async () => {
  const r = await comprobanteSinModelo(consultarCon([FILA_ARCA]), null)
  assert.equal(r.completo, false)
  assert.deepEqual(r.falta, ['qr'])
})

test('el total del QR manda sobre el de ARCA — lo firmó el emisor', async () => {
  const r = await comprobanteSinModelo(consultarCon([{ ...FILA_ARCA, imp_total: '99999' }]), comprobanteDesdeQr(qr(REAL)))
  assert.equal(r.comprobante.total, 18539.39)
})

test('LA OBRA NO SALE DE ACÁ, y no se inventa', async () => {
  const r = await comprobanteSinModelo(consultarCon([FILA_ARCA]), comprobanteDesdeQr(qr(REAL)))
  assert.equal(r.comprobante.obra, undefined, 'ni el QR ni ARCA saben a qué obra va el gasto')
})

test('el nombre del MAESTRO gana sobre la razón social del padrón', async () => {
  // «PEREZ GARCIA MARISOL BIBIANA» es quien factura; «Corralon Progreso» es como se llama en la
  // pestaña. Escribir la razón social en la columna E la dejaría fuera del desplegable estricto.
  const consultar = async (sql) => sql.includes('proveedores')
    ? { rows: [{ nombre: 'Corralon Progreso' }] }
    : { rows: [FILA_ARCA] }
  const r = await comprobanteSinModelo(consultar, comprobanteDesdeQr(qr(REAL)))
  assert.equal(r.comprobante.proveedor, 'Corralon Progreso')
  assert.equal(r.comprobante.razonSocialPadron, 'PEREZ GARCIA MARISOL BIBIANA')
  assert.match(r.via, /maestro/)
})

test('el maestro resuelve el proveedor AUNQUE ARCA no tenga el comprobante todavía', async () => {
  // Es el caso del día: la factura se emitió hace cinco minutos y ARCA va días atrás.
  const consultar = async (sql) => sql.includes('proveedores')
    ? { rows: [{ nombre: 'Corralon Progreso' }] }
    : { rows: [] }
  const r = await comprobanteSinModelo(consultar, comprobanteDesdeQr(qr(REAL)))
  assert.equal(r.comprobante.proveedor, 'Corralon Progreso')
  assert.deepEqual(r.falta, ['neto', 'iva'], 'ya no falta el proveedor')
  assert.equal(r.via, 'qr_afip+maestro')
})

test('dos proveedores con el mismo CUIT no se resuelven eligiendo uno', async () => {
  const consultar = async (sql) => sql.includes('proveedores')
    ? { rows: [{ nombre: 'A' }, { nombre: 'B' }] }
    : { rows: [] }
  const r = await comprobanteSinModelo(consultar, comprobanteDesdeQr(qr(REAL)))
  assert.equal(r.comprobante.proveedor, null)
})
