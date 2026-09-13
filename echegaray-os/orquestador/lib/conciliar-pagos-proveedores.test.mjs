// Cada test nombra el error que atrapa. Los casos con importes reales salen de lo medido el 13/09.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conciliar, pagosDeFuentes, subconjuntosExactos, cuitDelConcepto, resumenPorProveedor, celdasDeFila, serialDe,
} from './conciliar-pagos-proveedores.mjs'

const H = '30681641730' // Hormiserv
const OTRO = '20379240195'
const fila = (o) => ({ id: o.fila, proveedor: 'Hormiserv', cuit: H, estado: 'Pendiente', pagado: 0, parcial2: 0, fecha2: '', ...o })
const pago = (o) => ({ fuente: 'banco', ref: '', cuit: H, detalle: '', ...o })

test('importe exacto, pago posterior, mismo CUIT ⇒ propuesta contra esa fila', () => {
  const filas = [fila({ fila: 792, fecha: '2026-08-04', total: 2355724.8, saldo: 2355724.8 })]
  const r = conciliar(filas, [pago({ fecha: '2026-08-27', importe: 2355724.8 })])
  assert.equal(r.propuestas.length, 1)
  assert.equal(r.propuestas[0].filas[0].fila, 792)
  assert.equal(r.propuestas[0].regla, 'importe exacto')
})

test('un pago ANTERIOR a la factura no la cancela, aunque el importe dé exacto', () => {
  const filas = [fila({ fila: 792, fecha: '2026-08-04', total: 1000, saldo: 1000 })]
  const r = conciliar(filas, [pago({ fecha: '2026-08-03', importe: 1000 })])
  assert.equal(r.propuestas.length, 0)
  assert.equal(r.huerfanos.length, 1)
})

test('otro CUIT no cuenta: el contador «robles» no paga a «Robles Pintureria»', () => {
  const filas = [fila({ fila: 859, proveedor: 'Robles Pintureria', cuit: '30711355223', fecha: '2026-08-25', total: 696502.61, saldo: 696502.61 })]
  const r = conciliar(filas, [pago({ cuit: OTRO, fecha: '2026-09-09', importe: 696502.61 })])
  assert.equal(r.propuestas.length, 0)
})

test('una fila sin CUIT nunca se concilia (no se empareja por nombre)', () => {
  const filas = [fila({ fila: 881, proveedor: 'PEDRO TELLO', cuit: null, fecha: '2026-08-27', total: 2700000, saldo: 2161818.18 })]
  const r = conciliar(filas, [pago({ cuit: null, fecha: '2026-09-11', importe: 2161818.18 })])
  assert.equal(r.propuestas.length, 0)
})

test('suma de pagos: dos transferencias posteriores que juntas dan el saldo de una fila', () => {
  const filas = [fila({ fila: 10, fecha: '2026-09-01', total: 300000, saldo: 300000 })]
  const r = conciliar(filas, [pago({ fecha: '2026-09-02', importe: 100000, ref: 'a' }), pago({ fecha: '2026-09-09', importe: 200000, ref: 'b' })])
  assert.equal(r.propuestas.length, 1)
  assert.equal(r.propuestas[0].regla, 'suma de 2 pagos')
  assert.equal(r.huerfanos.length, 0)
})

test('suma de pagos: si uno de los pagos es anterior a la factura, la suma no vale', () => {
  const filas = [fila({ fila: 10, fecha: '2026-09-05', total: 300000, saldo: 300000 })]
  const r = conciliar(filas, [pago({ fecha: '2026-09-02', importe: 100000, ref: 'a' }), pago({ fecha: '2026-09-09', importe: 200000, ref: 'b' })])
  assert.equal(r.propuestas.length, 0)
})

test('un pago contra un conjunto de facturas pendientes del mismo CUIT', () => {
  const filas = [fila({ fila: 1, fecha: '2026-08-01', total: 100, saldo: 100 }), fila({ fila: 2, fecha: '2026-08-02', total: 250, saldo: 250 })]
  const r = conciliar(filas, [pago({ fecha: '2026-08-10', importe: 350 })])
  assert.equal(r.propuestas[0].filas.length, 2)
})

test('YA APLICADO GANA: el echeq 373 es f701 − NC f787 y no se aplica a la f792 pendiente', () => {
  const filas = [
    fila({ fila: 701, estado: 'Pagado', fecha: '2026-06-05', total: 3640067.2, saldo: 0 }),
    fila({ fila: 787, estado: 'Pagado', fecha: '2026-07-29', total: -686070, saldo: 0 }),
    fila({ fila: 792, fecha: '2026-08-04', total: 2355724.8, saldo: 2355724.8 }),
  ]
  const r = conciliar(filas, [pago({ fuente: 'cheque', fecha: '2026-08-20', importe: 2953997.2 })])
  assert.equal(r.propuestas.length, 0)
  assert.deepEqual(r.yaAplicados[0].filas.map((f) => f.fila), [701, 787])
})

test('ambiguo: dos facturas pendientes por el mismo importe ⇒ no se elige ninguna', () => {
  const filas = [fila({ fila: 1, fecha: '2026-08-01', total: 680000, saldo: 680000 }), fila({ fila: 2, fecha: '2026-08-01', total: 680000, saldo: 680000 })]
  const r = conciliar(filas, [pago({ fecha: '2026-08-10', importe: 680000 })])
  assert.equal(r.propuestas.length, 0)
  assert.equal(r.ambiguos.length, 1)
})

test('cheque sin fecha de emisión: se declara y no se aplica (el vencimiento no prueba la emisión)', () => {
  const pagos = pagosDeFuentes({ cheques: [{ numero: '9', contraparte_cuit: H, fecha_pago: '2026-09-20', importe: 1000, estado: 'Aceptado' }] })
  const r = conciliar([fila({ fila: 1, fecha: '2026-08-01', total: 1000, saldo: 1000 })], pagos)
  assert.equal(r.propuestas.length, 0)
  assert.equal(r.sinFecha.length, 1)
})

test('la transferencia del banco y su comprobante del mail son UN pago; dos del banco iguales son dos', () => {
  const uno = pagosDeFuentes({
    banco: [{ fecha: '2026-09-09', concepto: 'Transferencia inmediata - A x / - fac / 30681641730', importe: -500, referencia: '876' }],
    transferencias: [{ cuit: H, comprobante_fecha: '2026-09-09', comprobante_importe: 500, comprobante_numero: '876' }],
  })
  assert.equal(uno.length, 1)
  const dos = pagosDeFuentes({ banco: [
    { fecha: '2026-09-09', concepto: 'a / 30681641730', importe: -500, referencia: '1' },
    { fecha: '2026-09-10', concepto: 'b / 30681641730', importe: -500, referencia: '2' },
  ] })
  assert.equal(dos.length, 2)
})

test('cuitDelConcepto toma la contraparte y descarta el CUIT propio', () => {
  assert.equal(cuitDelConcepto('Transferencia inmediata - A jose maria robles / - hon / 20379240195'), OTRO)
  assert.equal(cuitDelConcepto('Pago / 30716304643'), null)
})

test('subconjuntosExactos admite negativos (nota de crédito) y corta en el tope', () => {
  // Centavos: la tolerancia es $1 = 100, así que los importes van en escala real.
  assert.deepEqual(subconjuntosExactos([364006720, -68607000, 500000], 295399720), [[0, 1]])
  assert.equal(subconjuntosExactos([100000, 100000, 100000], 100000).length, 2)
})

test('resumen: la deuda real es la publicada menos lo que tiene pago con evidencia', () => {
  const filas = [fila({ fila: 1, fecha: '2026-08-01', total: 100, saldo: 100 }), fila({ fila: 2, fecha: '2026-08-01', total: 40, saldo: 40 })]
  const r = conciliar(filas, [pago({ fecha: '2026-08-10', importe: 100 })])
  const [t] = resumenPorProveedor(filas, r.propuestas)
  assert.deepEqual([t.publicada, t.sinAplicar, t.real], [140, 100, 40])
})

test('bisturí: escribe W = O − T y V; X sólo si estaba pisada; nada si una persona ya usó V/W o la fila cambió', () => {
  const esperada = { fila: 792, id: 792, proveedor: 'Hormiserv', total: 2355724.8, saldo: 2355724.8 }
  const actual = fila({ fila: 792, fecha: '2026-08-04', total: 2355724.8, saldo: 2355724.8 })
  const ok = celdasDeFila(esperada, actual, '=IF($E="";"";…)', '2026-08-27')
  assert.deepEqual(ok.celdas, { V: serialDe('2026-08-27'), W: 2355724.8 })
  assert.equal(celdasDeFila(esperada, actual, 'Pendiente', '2026-08-27').celdas.X, 'Pagado')
  assert.ok(celdasDeFila(esperada, { ...actual, parcial2: 5 }, '=X', '2026-08-27').problema)
  assert.ok(celdasDeFila(esperada, { ...actual, saldo: 1 }, '=X', '2026-08-27').problema)
})
