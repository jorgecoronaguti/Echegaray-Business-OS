// EL PLAN DE ESCRITURA DE UN PAGO contra el encabezado REAL de Compras. Lo que más se prueba es
// cuándo NO escribe: un pago a medias deja «Estado = Pagado» sobre una factura impaga y pone en cero
// el «Saldo pendiente (OS)» del que cuelga toda la pestaña Proveedores.
import test from 'node:test'
import assert from 'node:assert/strict'
import { celdaDice, planificarPago, relecturaConfirmaPago } from './bisturi-compras-pago.mjs'
import { COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'
import { claveDeCompra, contratoDeColumnas, filaACompra } from './compras-fila.mjs'
import { planDePago } from './pagos-de-compra.mjs'

/** Una fila por rótulo: el test no sabe letras, igual que el código. */
function filaDe(encabezado, valores) {
  const f = new Array(encabezado.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) f[encabezado.indexOf(rotulo)] = v
  return f
}

const COMPRA = {
  ID: 53, Proveedor: 'CORRALÓN EL NORTE', Tipo: 'F A', 'N° Comprobante': '0003-00012345',
  'CUIT (OS)': '30712345678', Total: 121000, Importe: 100000, IVA: 21000, Estado: 'Pendiente',
}
const CLAVE = claveDeCompra({ cuit: '30712345678', tipo: 'F A', comprobante: '0003-00012345', proveedor: 'CORRALÓN EL NORTE' })

/** El plan que la app encoló: se arma con la función de PRODUCCIÓN, no con celdas escritas a mano. */
const plan = (accion) => planDePago({
  compra: {
    fila: 57, total: 121000, monto_pagado: 0, monto_parcial_2: 0, pago_total_o_parcial: null,
    tipo_pago: null, estado: 'Pendiente', fecha_prevista: '2026-09-30', fecha_prevista_2: null,
    saldo_pendiente: 121000, anulada: false,
  },
  accion,
  hoy: '2026-09-16',
})

const cambio = (p) => ({ id: 'k-1', fila: 57, clave: CLAVE, sheet_id: 53, tipo: 'pago', celdas: p.celdas, intentos: 1 })
const filaViva = (extra = {}) => filaDe(COMPRAS_CON_OBRA, { ...COMPRA, ...extra })
const compraDe = (fila) => filaACompra(fila, contratoDeColumnas(COMPRAS_CON_OBRA), 57)

test('un pago total escribe SUS celdas, cada una en la columna de su rótulo', () => {
  const p = plan({ tipo: 'total', fecha: '2026-09-16', medio: 'Transferencia' })
  const r = planificarPago({ cambio: cambio(p), encabezado: COMPRAS_CON_OBRA, fila: filaViva() })
  assert.equal(r.accion, 'escribir')
  const por = Object.fromEntries(r.celdas.map((c) => [c.rotulo, c]))
  // Con «Obra» insertada en L: Tipo pago Q, Total o Parcial T, Monto Pagado U, Estado Y.
  assert.equal(por['Monto Pagado'].celda, 'Compras!U57')
  assert.equal(por['Monto Pagado'].escribir, 121000)
  assert.equal(por['Total o Parcial'].celda, 'Compras!T57')
  assert.equal(por.Estado.celda, 'Compras!Y57')
  assert.equal(por.Estado.escribir, 'Pagado')
  assert.equal(por['Tipo pago'].celda, 'Compras!Q57')
})

test('la letra sale del rótulo vivo: si se mueve una columna, el pago la sigue', () => {
  // La misma pestaña sin «Obra»: todo lo de la derecha se corre una letra hacia atrás.
  const sinObra = COMPRAS_CON_OBRA.filter((r) => r !== 'Obra')
  const p = plan({ tipo: 'total', fecha: '2026-09-16' })
  const r = planificarPago({ cambio: cambio(p), encabezado: sinObra, fila: filaDe(sinObra, COMPRA) })
  assert.equal(r.accion, 'escribir')
  assert.equal(r.celdas.find((c) => c.rotulo === 'Monto Pagado').celda, 'Compras!T57')
})

test('la fecha del tramo 2 viaja como dd/mm/yyyy y el importe como número', () => {
  const p = plan({ tipo: 'parcial', monto: 50000, fecha: '2026-09-16', fechaResto: '2026-10-15' })
  const r = planificarPago({ cambio: cambio(p), encabezado: COMPRAS_CON_OBRA, fila: filaViva() })
  const por = Object.fromEntries(r.celdas.map((c) => [c.rotulo, c]))
  assert.equal(por['Fecha prevista de pago 2'].escribir, '15/10/2026')
  assert.equal(por['Monto Pagado'].escribir, 50000)
  assert.equal(typeof por['Monto Pagado'].escribir, 'number')
})

test('UNA celda cambiada rechaza el pago ENTERO: un pago a medias es un dato falso', () => {
  const p = plan({ tipo: 'total', fecha: '2026-09-16' })
  // Alguien tocó «Monto Pagado» en el Sheet entre que se encoló y el worker aplicó.
  const r = planificarPago({ cambio: cambio(p), encabezado: COMPRAS_CON_OBRA, fila: filaViva({ 'Monto Pagado': 60000 }) })
  assert.equal(r.accion, 'rechazar')
  assert.equal(r.motivo, 'celda_cambio')
  assert.match(r.detalle, /Monto Pagado/)
  assert.equal(r.celdas, undefined, 'ni una sola celda se escribe')
})

test('la fila que ya no es la misma compra no recibe el pago', () => {
  const p = plan({ tipo: 'total', fecha: '2026-09-16' })
  const otra = filaDe(COMPRAS_CON_OBRA, { ...COMPRA, 'N° Comprobante': '0003-00099999' })
  const r = planificarPago({ cambio: cambio(p), encabezado: COMPRAS_CON_OBRA, fila: otra })
  assert.equal(r.accion, 'rechazar')
  assert.equal(r.motivo, 'huella_distinta')
})

test('si las celdas YA dicen lo pedido, se cierra sin volver a escribir', () => {
  const p = plan({ tipo: 'total', fecha: '2026-09-16', medio: 'Transferencia' })
  const aplicada = filaViva({
    'Monto Pagado': 121000, 'Total o Parcial': 'Total', Estado: 'Pagado', 'Tipo pago': 'Transferencia',
  })
  const r = planificarPago({ cambio: cambio(p), encabezado: COMPRAS_CON_OBRA, fila: aplicada })
  assert.equal(r.accion, 'ya_aplicado')
})

test('sin las columnas de pago difiere: no elige una letra de respaldo', () => {
  const mutilado = COMPRAS_CON_OBRA.map((r) => (r === 'Monto Parcial 2' ? 'Monto Parcial Dos' : r))
  const p = plan({ tipo: 'parcial', monto: 50000, fecha: '2026-09-16', fechaResto: '2026-10-15' })
  const r = planificarPago({ cambio: cambio(p), encabezado: mutilado, fila: filaDe(mutilado, COMPRA) })
  assert.equal(r.accion, 'diferir')
  // Lo que importa no es CUÁL de las dos guardas lo cazó (el contrato A→AN ya exige los seis
  // rótulos), sino que difiera nombrando el que falta en vez de elegir una letra de respaldo.
  assert.match(r.detalle, /Monto Parcial 2/)
  assert.equal(r.celdas, undefined)
})

test('un rótulo que no es de entrada se rechaza aunque venga en la cola', () => {
  const p = plan({ tipo: 'total', fecha: '2026-09-16' })
  const envenenado = { ...cambio(p), celdas: [...p.celdas, { rotulo: 'Saldo pendiente (OS)', valor: 0, anterior: 121000, especie: 'importe' }] }
  const r = planificarPago({ cambio: envenenado, encabezado: COMPRAS_CON_OBRA, fila: filaViva() })
  assert.equal(r.accion, 'rechazar')
  assert.equal(r.motivo, 'rotulo_invalido')
  assert.match(r.detalle, /Saldo pendiente/)
})

test('la comparación es por especie: la cola binaria de un flotante no es «la celda cambió»', () => {
  const compra = compraDe(filaViva({ 'Monto Pagado': 121000.000000004 }))
  assert.equal(celdaDice(compra, 'Monto Pagado', 121000), true)
  assert.equal(celdaDice(compra, 'Monto Pagado', 121000.5), false)
  // Una celda vacía y un null son lo mismo: no hay dato.
  assert.equal(celdaDice(compraDe(filaViva()), 'Tipo pago', null), true)
  assert.equal(celdaDice(compraDe(filaViva()), 'Tipo pago', ''), true)
})

test('la relectura prueba la escritura celda por celda, y nombra la que no aterrizó', () => {
  const p = plan({ tipo: 'total', fecha: '2026-09-16' })
  const r = planificarPago({ cambio: cambio(p), encabezado: COMPRAS_CON_OBRA, fila: filaViva() })
  const buena = compraDe(filaViva({ 'Monto Pagado': 121000, 'Total o Parcial': 'Total', Estado: 'Pagado' }))
  assert.equal(relecturaConfirmaPago(buena, r.celdas).ok, true)
  const mala = compraDe(filaViva({ 'Monto Pagado': 121000, 'Total o Parcial': 'Total', Estado: 'Pendiente' }))
  const v = relecturaConfirmaPago(mala, r.celdas)
  assert.equal(v.ok, false)
  assert.match(v.detalle, /Estado/)
})

test('una cola sin celdas no escribe nada', () => {
  const r = planificarPago({ cambio: { fila: 57, clave: CLAVE, celdas: [] }, encabezado: COMPRAS_CON_OBRA, fila: filaViva() })
  assert.equal(r.accion, 'rechazar')
  assert.equal(r.motivo, 'sin_celdas')
})

// ═══ IMPUTAR A UNA ENTREGA DE EFECTIVO (24/09/2026) ═══ La base (`_efectivo_encolar_tipo_pago`, migración
// 20260925T1000) encola UNA celda con esta forma exacta. El worker la tiene que escribir en «Tipo pago» sin
// tocar ninguna otra, y NO pisarla si alguien cambió esa celda en el Sheet mientras tanto.
const aRendir = { rotulo: 'Tipo pago', especie: 'texto', valor: 'A rendir', anterior: 'Efectivo', escribir: 'A rendir' }

test('imputar a una entrega: una sola celda, «Tipo pago» ← «A rendir»', () => {
  const r = planificarPago({ cambio: cambio({ celdas: [aRendir] }), encabezado: COMPRAS_CON_OBRA, fila: filaViva({ 'Tipo pago': 'Efectivo' }) })
  assert.equal(r.accion, 'escribir')
  assert.deepEqual(r.celdas.map((c) => [c.celda, c.escribir]), [['Compras!Q57', 'A rendir']])
  assert.equal(relecturaConfirmaPago(compraDe(filaViva({ 'Tipo pago': 'A rendir' })), r.celdas).ok, true)
})

test('imputar a una entrega: si el Sheet ya no dice «Efectivo», no se pisa; si ya dice «A rendir», se cierra', () => {
  const editada = planificarPago({ cambio: cambio({ celdas: [aRendir] }), encabezado: COMPRAS_CON_OBRA, fila: filaViva({ 'Tipo pago': 'Transferencia' }) })
  assert.equal(editada.accion, 'rechazar')
  const ya = planificarPago({ cambio: cambio({ celdas: [aRendir] }), encabezado: COMPRAS_CON_OBRA, fila: filaViva({ 'Tipo pago': 'A rendir' }) })
  assert.equal(ya.accion, 'ya_aplicado')
  // Y el inverso (deshacer) es la misma celda al revés.
  const inverso = { ...aRendir, valor: 'Efectivo', anterior: 'A rendir', escribir: 'Efectivo' }
  const d = planificarPago({ cambio: cambio({ celdas: [inverso] }), encabezado: COMPRAS_CON_OBRA, fila: filaViva({ 'Tipo pago': 'A rendir' }) })
  assert.deepEqual(d.celdas.map((c) => [c.celda, c.escribir]), [['Compras!Q57', 'Efectivo']])
})
