import test from 'node:test'
import assert from 'node:assert/strict'
import { repartirCobertura, aCubrirPorMes, normComprobante, hallarPestana } from './cheques-cobertura.mjs'

const eq = (a, b, m) => assert.equal(a, b, m)

test('el comprobante se normaliza: "0001-000036" y "1-36" son el mismo', () => {
  assert.equal(normComprobante('0001-000036'), '1-36')
  assert.equal(normComprobante('0001-000036'), normComprobante('00001-0000036'))
  assert.equal(normComprobante(''), '')
})

test('separa lo ya contemplado de lo que falta cargar', () => {
  // El caso real: un cheque cuya factura SÍ está en Compras ya viajó al cash flow por su rubro.
  // Sumarlo otra vez sería duplicar — que es justamente la regla de oro del dueño.
  // "7-7206" NO está en Compras: es el caso de falta confirmada.
  const enCompras = new Set(['6-6452', '3-242'])
  const r = repartirCobertura([
    { comprobante: '06-006452', monto: 880018 },
    { comprobante: '03-000242', monto: 1002331 },
    { comprobante: '0007-0007206', monto: 265000 },
    { comprobante: '', monto: 500000 },
  ], enCompras)
  assert.equal(r.contemplados.length, 2)
  assert.equal(r.monto_contemplado, 1882349)
  // La distinción que importa: uno tiene número y no está en Compras (falta confirmada), el otro
  // no tiene número (no se puede saber). Mezclarlos exagera el problema.
  assert.equal(r.falta_factura.length, 1)
  assert.equal(r.monto_falta_factura, 265000)
  assert.equal(r.sin_numero_comprobante.length, 1)
  assert.equal(r.monto_sin_numero, 500000)
  assert.equal(r.sin_registrar.length, 2)
  assert.equal(r.monto_sin_registrar, 765000)
  assert.equal(r.total, 2647349)
})

test('una llave pobre no se usa; una de dos partes sí, aunque sea corta', () => {
  // "72" solo podría colisionar con cualquier cosa: mejor tratarlo como sin número.
  const pobre = repartirCobertura([{ comprobante: '72', monto: 100 }], new Set(['72']))
  assert.equal(pobre.contemplados.length, 0)
  assert.equal(pobre.sin_numero, 1)
  // Pero "00045-00000009" → "45-9" son sólo 3 dígitos y ES una factura perfectamente identificada.
  // Descartarla dejaba las 12 cuotas de la tarjeta de Modica como "sin factura en Compras".
  const buena = repartirCobertura([{ comprobante: '00045-00000009', monto: 355413 }], new Set(['45-9']))
  assert.equal(buena.contemplados.length, 1)
  assert.equal(buena.sin_numero, 0)
})

test('a cubrir es otra pregunta: cuánta plata tiene que haber y cuándo', () => {
  // No importa si la factura está registrada. Un cheque emitido y no debitado es un compromiso en
  // firme, más firme que una factura con fecha prevista.
  const r = aCubrirPorMes([
    { monto: 100, fecha_pago: 'agosto 26', debitado: 'SI' },
    { monto: 200, fecha_pago: 'agosto 26', debitado: 'NO' },
    { monto: 300, fecha_pago: 'agosto 26', debitado: '' },
    { monto: 400, fecha_pago: 'septiembre 26', debitado: 'no' },
  ])
  assert.equal(r.total, 900, 'lo ya debitado no se cuenta')
  assert.deepEqual(r.por_mes.map((m) => [m.mes, m.cantidad, m.monto]), [
    ['agosto 26', 2, 500], ['septiembre 26', 1, 400],
  ])
})

// Un nombre de pestaña es del dueño: renombrar "Cheques" a "Cheques Emitidos" no puede romper el
// agente. Antes de este test, ese renombre hacía fallar la corrida entera con un 400 de la API.
test('hallarPestana tolera que el dueño renombre la pestaña', () => {
  const hojas = [{ title: 'Compras' }, { title: 'Cheques Emitidos' }, { title: 'Tarjeta de Credito' }]
  eq(hallarPestana(hojas, 'Cheques').title, 'Cheques Emitidos', 'encuentra por prefijo')
  eq(hallarPestana([{ title: 'Cheques' }], 'Cheques').title, 'Cheques', 'el nombre exacto sigue andando')
  // Exacto le gana a prefijo: si existen las dos, no hay ambigüedad que resolver.
  eq(hallarPestana([{ title: 'Cheques Emitidos' }, { title: 'Cheques' }], 'Cheques').title, 'Cheques', 'exacto primero')
  let rompio = false
  try { hallarPestana([{ title: 'Cheques A' }, { title: 'Cheques B' }], 'Cheques') } catch { rompio = true }
  eq(rompio, true, 'con dos candidatas avisa en vez de elegir al azar')
  rompio = false
  try { hallarPestana([{ title: 'Compras' }], 'Cheques') } catch { rompio = true }
  eq(rompio, true, 'si no está, avisa')
})
