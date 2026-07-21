import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizar, resumen, clave, facturasAnuladasCargadas, isoDe } from './notas-credito.mjs'

// El caso real de ACEROLATINA, tal como está en comprobantes_arca.
const ACEROLATINA = [
  { tipo_comprobante: '1', emisor_cuit: '30500', punto_venta: '7', numero: '21385', fecha_emision: '2026-04-07', imp_total: 9823178 },
  { tipo_comprobante: '3', emisor_cuit: '30500', punto_venta: '17', numero: '6948', fecha_emision: '2026-05-22', imp_total: 9823178 },
  { tipo_comprobante: '1', emisor_cuit: '30500', punto_venta: '17', numero: '10223', fecha_emision: '2026-05-22', imp_total: 9823175 },
]

test('ACEROLATINA es una refacturación, no una devolución', () => {
  const [a] = analizar(ACEROLATINA)
  assert.equal(a.clase, 'refacturacion')
  assert.equal(clave(a.anula[0]), '7-21385', 'anula la factura de abril')
  assert.equal(clave(a.refactura[0]), '17-10223', 'la reemplaza la de mayo')
})

test('una nota que anula sin factura nueva es devolución', () => {
  // BOTAS MERCADO: la NC 4-209 anula la 4-6554 y no hay reemplazo. El costo baja de verdad.
  const botas = [
    { tipo_comprobante: '1', emisor_cuit: '20111', punto_venta: '4', numero: '6554', fecha_emision: '2026-06-20', imp_total: 970226 },
    { tipo_comprobante: '3', emisor_cuit: '20111', punto_venta: '4', numero: '209', fecha_emision: '2026-06-24', imp_total: 970226 },
  ]
  const [a] = analizar(botas)
  assert.equal(a.clase, 'devolucion')
  assert.equal(a.refactura.length, 0)
})

test('una nota parcial queda para revisar, no se fuerza a una clase', () => {
  // Un descuento no anula ninguna factura por su importe exacto. Decir "devolución" sería inventar.
  const c = [
    { tipo_comprobante: '1', emisor_cuit: '20111', punto_venta: '1', numero: '1', fecha_emision: '2026-03-01', imp_total: 500000 },
    { tipo_comprobante: '3', emisor_cuit: '20111', punto_venta: '1', numero: '9', fecha_emision: '2026-03-05', imp_total: 50000 },
  ]
  const [a] = analizar(c)
  assert.equal(a.clase, 'revisar')
})

test('una anulación no se refactura a sí misma', () => {
  // Sin excluir la factura ya anulada, toda devolución se clasificaría como refacturación cuando
  // la nota y la factura llevan la misma fecha.
  const c = [
    { tipo_comprobante: '1', emisor_cuit: '20111', punto_venta: '1', numero: '1', fecha_emision: '2026-03-05', imp_total: 100 },
    { tipo_comprobante: '3', emisor_cuit: '20111', punto_venta: '1', numero: '9', fecha_emision: '2026-03-05', imp_total: 100 },
  ]
  assert.equal(analizar(c)[0].clase, 'devolucion')
})

test('no cruza notas de un proveedor con facturas de otro', () => {
  const c = [
    { tipo_comprobante: '1', emisor_cuit: 'AAA', punto_venta: '1', numero: '1', fecha_emision: '2026-03-01', imp_total: 1000 },
    { tipo_comprobante: '3', emisor_cuit: 'BBB', punto_venta: '1', numero: '2', fecha_emision: '2026-03-02', imp_total: 1000 },
  ]
  assert.equal(analizar(c)[0].clase, 'revisar')
})

test('el resumen separa el costo que sigue del que baja', () => {
  const r = resumen(analizar([...ACEROLATINA,
    { tipo_comprobante: '1', emisor_cuit: '20111', punto_venta: '4', numero: '6554', fecha_emision: '2026-06-20', imp_total: 970226 },
    { tipo_comprobante: '3', emisor_cuit: '20111', punto_venta: '4', numero: '209', fecha_emision: '2026-06-24', imp_total: 970226 },
  ]))
  assert.equal(r.refacturaciones, 1)
  assert.equal(r.costoQueSigue, 9823178, 'esto NO es un ahorro')
  assert.equal(r.devoluciones, 1)
  assert.equal(r.costoQueBaja, 970226)
})

test('detecta que Compras tiene cargada la factura ANULADA', () => {
  // El hallazgo caro: el importe cierra, el comprobante ya no existe y el mes está mal.
  const a = analizar(ACEROLATINA)
  const mal = facturasAnuladasCargadas(a, new Set(['7-21385']))
  assert.equal(mal.length, 1)
  assert.equal(mal[0].monto, 9823178)
  assert.equal(clave(mal[0].reemplazos[0]), '17-10223', 'dice cuál es la que corresponde')
})

test('no marca nada si Compras tiene la factura correcta', () => {
  assert.equal(facturasAnuladasCargadas(analizar(ACEROLATINA), new Set(['17-10223'])).length, 0)
})

test('funciona igual con Date que con texto — el bug que dio dos resultados distintos', () => {
  // El driver de Postgres devuelve `date` como objeto Date. String(Date).slice(0,10) da "Tue Apr
  // 07" y la comparación ordena por el nombre del día. La prueba suelta usaba fecha_emision::text
  // y andaba; el script real traía Date y ACEROLATINA perdía la factura que anula.
  const conDate = ACEROLATINA.map((c) => ({ ...c, fecha_emision: new Date(c.fecha_emision + 'T00:00:00Z') }))
  const [a] = analizar(conDate)
  assert.equal(a.clase, 'refacturacion')
  assert.equal(clave(a.anula[0]), '7-21385')
  assert.equal(clave(a.refactura[0]), '17-10223')
})

test('isoDe normaliza los formatos que llegan de verdad', () => {
  assert.equal(isoDe(new Date('2026-04-07T00:00:00Z')), '2026-04-07')
  assert.equal(isoDe('2026-04-07'), '2026-04-07')
  assert.equal(isoDe('2026-04-07T13:22:00.000Z'), '2026-04-07')
  assert.equal(isoDe(null), '')
  assert.equal(isoDe('cualquier cosa'), '')
})
