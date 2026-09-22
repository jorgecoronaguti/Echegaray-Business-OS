import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notasDeLaDeuda } from './notasDeDeuda.ts'
import type { CompraConSaldo, DeudaDeProveedor, LineaDeuda } from './deudaProveedores.ts'

const fila = (clave: string): DeudaDeProveedor => ({
  clave, proveedorId: null, nombre: clave, vencido: 0, porVencer: 0, sinFecha: 0, aFavor: 0, total: 0, comprobantes: 1,
  masViejaVencida: null, proximoVencimiento: null,
})
const compra = (n: number, proveedor: string) => ({ fila: n, proveedor }) as unknown as CompraConSaldo
const linea = (clave: string, n: number, saldo: number) => ({ clave, fila: n, saldo }) as unknown as LineaDeuda

test('la nota sale de la grafía de Compras normalizada, como la guarda el Sheet', () => {
  const r = notasDeLaDeuda({
    filas: [fila('uuid-h')], compras: [compra(10, 'HORMISERV ')], lineas: [linea('uuid-h', 10, 500)],
    notas: [{ clave: 'hormiserv', nota: 'esperar al cobrador', actualizado_en: '2026-09-01' }], pedidos: [],
  })
  assert.deepEqual(r.get('uuid-h'), {
    proveedorSheet: 'HORMISERV', claveNota: 'hormiserv', nota: 'esperar al cobrador', pendiente: null, rechazo: null,
  })
})

test('dos grafías en una ficha: gana la que más se debe, salvo que sólo la otra tenga nota', () => {
  const base = { filas: [fila('f')], compras: [compra(1, 'Corralón Progreso'), compra(2, 'Corralon Progreso SRL')],
    lineas: [linea('f', 1, 100), linea('f', 2, 900)], pedidos: [] }
  assert.equal(notasDeLaDeuda({ ...base, notas: [] }).get('f')?.proveedorSheet, 'Corralon Progreso SRL')
  const conNota = notasDeLaDeuda({ ...base, notas: [{ clave: 'corralon progreso', nota: 'cheque', actualizado_en: null }] })
  assert.equal(conNota.get('f')?.nota, 'cheque')
})

test('un pedido vivo se muestra aparte y NO reemplaza la nota vigente; un rechazo viejo no se muestra', () => {
  const base = { filas: [fila('h')], compras: [compra(1, 'Hormiserv')], lineas: [linea('h', 1, 1)],
    notas: [{ clave: 'hormiserv', nota: 'a', actualizado_en: '2026-09-17T12:00:00Z' }] }
  const vivo = notasDeLaDeuda({ ...base, pedidos: [{ clave: 'hormiserv', nota_nueva: 'b', estado: 'pendiente', motivo: null, creado_at: '2026-09-17T13:00:00Z' }] })
  assert.deepEqual([vivo.get('h')?.nota, vivo.get('h')?.pendiente], ['a', 'b'])
  const viejo = notasDeLaDeuda({ ...base, pedidos: [{ clave: 'hormiserv', nota_nueva: 'b', estado: 'rechazado', motivo: 'conflicto', creado_at: '2026-09-16T00:00:00Z' }] })
  assert.equal(viejo.get('h')?.rechazo, null)
  const nuevo = notasDeLaDeuda({ ...base, pedidos: [{ clave: 'hormiserv', nota_nueva: 'b', estado: 'rechazado', motivo: 'conflicto: gana el Sheet', creado_at: '2026-09-17T13:00:00Z' }] })
  assert.equal(nuevo.get('h')?.rechazo, 'No se guardó: conflicto: gana el Sheet')
})

test('un borrado retenido del Sheet se muestra como conflicto, sin «No se guardó»', () => {
  const r = notasDeLaDeuda({
    filas: [fila('h')], compras: [compra(1, 'Hormiserv')], lineas: [linea('h', 1, 1)],
    notas: [{ clave: 'hormiserv', nota: 'a', actualizado_en: '2026-09-17T12:00:00Z' }],
    pedidos: [{ clave: 'hormiserv', nota_nueva: '', estado: 'rechazado', motivo: 'conflicto: en el Sheet la nota aparece borrada', creado_at: '2026-09-17T13:00:00Z', origen: 'sheet' }],
  })
  assert.equal(r.get('h')?.rechazo, 'conflicto: en el Sheet la nota aparece borrada')
  assert.equal(r.get('h')?.nota, 'a', 'la nota NO se borró')
})
