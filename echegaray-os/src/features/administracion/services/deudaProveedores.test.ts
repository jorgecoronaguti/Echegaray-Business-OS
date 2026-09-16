import test from 'node:test'
import assert from 'node:assert/strict'
import {
  centavos, conceptoConCuotaAdelante, cotejoDeDeuda, detalleDeProveedor, deudaPorProveedor,
  estadoDeVencimiento, etiquetaDeCuota, lineasDeDeuda, totalesDeuda,
  type CompraConSaldo, type ProveedorResuelto,
} from './deudaProveedores.ts'

// LO QUE ESTOS TESTS ATRAPAN, defecto por defecto:
//
//  · Una anulada o una saldada contando como deuda → se le reclama plata a quien no se le debe.
//  · Un vencimiento futuro contado como vencido (o al revés) → se paga antes o después de tiempo.
//  · Una fila con dos vencimientos cayendo entera en la primera fecha → una cuota adelantada.
//  · Dos grafías del mismo proveedor en dos filas distintas → la deuda repartida entre dos fichas.
//  · Un texto marcado «no es proveedor» con fila propia → un acreedor inventado.
//  · Sumas de float sin redondear → un pie que no cierra con las filas que lo componen.
//  · Un orden que no pone primero lo vencido → la tabla deja de decir a quién pagar.

const HOY = '2026-09-16'

/** Una fila de Compras mínima. Todo lo que no se nombra queda en su valor inerte. */
function compra(p: Partial<CompraConSaldo> & { fila: number }): CompraConSaldo {
  return {
    proveedor: 'Corralon Progreso', cuit: null, fecha: '2026-09-01', comprobante: 'FC A 1',
    concepto: null, total: 1000, fecha_prevista: '2026-09-30', fecha_prevista_2: null,
    monto_pagado: 0, monto_parcial_2: null, saldo_pendiente: 1000, estado: 'Pendiente',
    estado_pago: null, tramo_vencimiento: null, anulada: false, obra_id: null, ...p,
  }
}

const SIN_RESOLVER = new Map<string, ProveedorResuelto>()
const resolver = (...rs: ProveedorResuelto[]) => new Map(rs.map((r) => [r.nombre_norm, r]))

const armar = (compras: CompraConSaldo[], resueltos = SIN_RESOLVER, hoy = HOY) => {
  const lineas = lineasDeDeuda(compras, resueltos, hoy)
  return { lineas, filas: deudaPorProveedor(lineas, resueltos, compras) }
}

// ═══ QUÉ ENTRA Y QUÉ NO ═══

test('una compra anulada no es deuda, aunque su saldo sea positivo', () => {
  const { filas } = armar([compra({ fila: 1, anulada: true, saldo_pendiente: 5000 })])
  assert.deepEqual(filas, [])
})

test('un saldo de cero o negativo no es deuda: la fila no existe', () => {
  const { filas } = armar([
    compra({ fila: 1, saldo_pendiente: 0 }),
    compra({ fila: 2, saldo_pendiente: -120 }),
    compra({ fila: 3, saldo_pendiente: null }),
  ])
  assert.deepEqual(filas, [])
})

test('un texto marcado «no es proveedor» no genera acreedor', () => {
  const resueltos = resolver({ nombre_norm: 'SUELDOS', proveedor_id: null, proveedor_nombre: null, estado: 'no_es_proveedor' })
  const { filas } = armar([compra({ fila: 1, proveedor: 'Sueldos', saldo_pendiente: 900000 })], resueltos)
  assert.deepEqual(filas, [])
})

test('un proveedor sin ficha en el maestro aparece igual, con la grafía de Compras y sin id', () => {
  const { filas } = armar([compra({ fila: 1, proveedor: 'PEDRO TELLO', saldo_pendiente: 1000 })])
  assert.equal(filas.length, 1)
  assert.equal(filas[0].proveedorId, null)
  assert.equal(filas[0].nombre, 'PEDRO TELLO')
  assert.equal(filas[0].clave, 'txt:PEDRO TELLO')
})

// ═══ AGRUPAR ═══

test('dos grafías del mismo proveedor vinculado son UNA fila, con el nombre del maestro', () => {
  const resueltos = resolver(
    { nombre_norm: 'PEDRO TELLO', proveedor_id: 'p-1', proveedor_nombre: 'Pedro Tello', estado: 'vinculado' },
  )
  const { filas } = armar([
    compra({ fila: 1, proveedor: 'PEDRO TELLO', saldo_pendiente: 100, fecha_prevista: '2026-09-30' }),
    compra({ fila: 2, proveedor: '  pedro   tello ', saldo_pendiente: 50, fecha_prevista: '2026-09-30' }),
  ], resueltos)
  assert.equal(filas.length, 1)
  assert.equal(filas[0].nombre, 'Pedro Tello')
  assert.equal(filas[0].proveedorId, 'p-1')
  assert.equal(filas[0].total, 150)
  assert.equal(filas[0].comprobantes, 2)
})

test('una fila partida en dos cuotas sigue siendo UN comprobante', () => {
  const { filas } = armar([compra({
    fila: 7, saldo_pendiente: 1000, fecha_prevista: '2026-09-30',
    fecha_prevista_2: '2026-10-30', monto_parcial_2: 400,
  })])
  assert.equal(filas[0].comprobantes, 1)
  assert.equal(filas[0].total, 1000)
})

// ═══ VENCIDO / POR VENCER ═══

test('el corte es «fecha prevista ≤ hoy»: el día de hoy ya está vencido', () => {
  assert.equal(estadoDeVencimiento('2026-09-15', HOY), 'vencido')
  assert.equal(estadoDeVencimiento('2026-09-16', HOY), 'vencido')
  assert.equal(estadoDeVencimiento('2026-09-17', HOY), 'por_vencer')
  assert.equal(estadoDeVencimiento(null, HOY), 'sin_fecha')
})

test('lo vencido y lo por vencer van separados, con su fecha más vieja y la próxima', () => {
  const { filas } = armar([
    compra({ fila: 1, saldo_pendiente: 300, fecha_prevista: '2026-09-10' }),
    compra({ fila: 2, saldo_pendiente: 200, fecha_prevista: '2026-09-02' }),
    compra({ fila: 3, saldo_pendiente: 500, fecha_prevista: '2026-09-25' }),
    compra({ fila: 4, saldo_pendiente: 700, fecha_prevista: '2026-10-02' }),
  ])
  const f = filas[0]
  assert.equal(f.vencido, 500)
  assert.equal(f.porVencer, 1200)
  assert.equal(f.total, 1700)
  assert.equal(f.masViejaVencida, '2026-09-02')
  assert.equal(f.proximoVencimiento, '2026-09-25')
})

test('sin fecha prevista la deuda NO se cuenta como vencida: viaja aparte y suma al total', () => {
  const { filas } = armar([compra({ fila: 1, saldo_pendiente: 800, fecha_prevista: null })])
  const f = filas[0]
  assert.equal(f.vencido, 0)
  assert.equal(f.porVencer, 0)
  assert.equal(f.sinFecha, 800)
  assert.equal(f.total, 800)
  assert.equal(f.masViejaVencida, null)
})

// ═══ CUOTAS PARCIALES ═══

test('una fila con segundo vencimiento reparte el saldo entre las dos fechas', () => {
  const { lineas } = armar([compra({
    fila: 7, saldo_pendiente: 1000, fecha_prevista: '2026-09-10',
    fecha_prevista_2: '2026-10-30', monto_parcial_2: 400,
  })])
  assert.equal(lineas.length, 2)
  assert.deepEqual(lineas.map((l) => [l.cuota, l.saldo, l.vence, l.estado]), [
    ['1 de 2', 600, '2026-09-10', 'vencido'],
    ['2 de 2', 400, '2026-10-30', 'por_vencer'],
  ])
})

test('si la segunda cuota se come el saldo entero, hay un solo vencimiento y es el segundo', () => {
  const { lineas } = armar([compra({
    fila: 8, saldo_pendiente: 400, fecha_prevista: '2026-09-10',
    fecha_prevista_2: '2026-10-30', monto_parcial_2: 400,
  })])
  assert.equal(lineas.length, 1)
  assert.equal(lineas[0].vence, '2026-10-30')
  assert.equal(lineas[0].cuota, null)
  assert.equal(lineas[0].saldo, 400)
})

test('una segunda fecha sin importe no parte nada', () => {
  const { lineas } = armar([compra({
    fila: 9, saldo_pendiente: 500, fecha_prevista: '2026-09-30',
    fecha_prevista_2: '2026-10-30', monto_parcial_2: 0,
  })])
  assert.equal(lineas.length, 1)
  assert.equal(lineas[0].vence, '2026-09-30')
})

// ═══ REDONDEO ═══

test('los subtotales cierran al centavo: tres saldos de 0,1 suman 0,30 y no 0,30000000000000004', () => {
  const { filas } = armar([
    compra({ fila: 1, saldo_pendiente: 0.1, fecha_prevista: '2026-09-30' }),
    compra({ fila: 2, saldo_pendiente: 0.1, fecha_prevista: '2026-09-30' }),
    compra({ fila: 3, saldo_pendiente: 0.1, fecha_prevista: '2026-09-30' }),
  ])
  assert.equal(filas[0].porVencer, 0.3)
  assert.equal(filas[0].total, 0.3)
  assert.equal(totalesDeuda(filas).total, 0.3)
})

test('la cuota que se parte no pierde ni gana un centavo', () => {
  const { lineas } = armar([compra({
    fila: 1, saldo_pendiente: 2137866.67, fecha_prevista: '2026-09-30',
    fecha_prevista_2: '2026-10-30', monto_parcial_2: 712622.23,
  })])
  assert.equal(centavos(lineas[0].saldo + lineas[1].saldo), 2137866.67)
})

test('un numeric que PostgREST sirve como texto se suma como número, no se concatena', () => {
  const { filas } = armar([
    compra({ fila: 1, saldo_pendiente: '1000.50', fecha_prevista: '2026-09-30' }),
    compra({ fila: 2, saldo_pendiente: '2000.25', fecha_prevista: '2026-09-30' }),
  ])
  assert.equal(filas[0].total, 3000.75)
})

// ═══ ORDEN Y PIE ═══

test('ordena por vencido desc y después por el próximo vencimiento', () => {
  const resueltos = resolver(
    { nombre_norm: 'A', proveedor_id: 'a', proveedor_nombre: 'A', estado: 'vinculado' },
    { nombre_norm: 'B', proveedor_id: 'b', proveedor_nombre: 'B', estado: 'vinculado' },
    { nombre_norm: 'C', proveedor_id: 'c', proveedor_nombre: 'C', estado: 'vinculado' },
  )
  const { filas } = armar([
    compra({ fila: 1, proveedor: 'A', saldo_pendiente: 100, fecha_prevista: '2026-09-01' }),
    compra({ fila: 2, proveedor: 'B', saldo_pendiente: 900, fecha_prevista: '2026-10-30' }),
    compra({ fila: 3, proveedor: 'C', saldo_pendiente: 900, fecha_prevista: '2026-09-20' }),
  ], resueltos)
  // A tiene $100 vencidos y va primero aunque deba nueve veces menos: es lo que hay que pagar hoy.
  assert.deepEqual(filas.map((f) => f.nombre), ['A', 'C', 'B'])
})

test('el pie suma exactamente las filas que la tabla dibuja', () => {
  const resueltos = resolver(
    { nombre_norm: 'A', proveedor_id: 'a', proveedor_nombre: 'A', estado: 'vinculado' },
    { nombre_norm: 'B', proveedor_id: 'b', proveedor_nombre: 'B', estado: 'vinculado' },
  )
  const { filas } = armar([
    compra({ fila: 1, proveedor: 'A', saldo_pendiente: 81000, fecha_prevista: '2026-09-14' }),
    compra({ fila: 2, proveedor: 'B', saldo_pendiente: 2355724.8, fecha_prevista: '2026-09-18' }),
    compra({ fila: 3, proveedor: 'B', saldo_pendiente: 500000, fecha_prevista: null }),
  ], resueltos)
  const t = totalesDeuda(filas)
  assert.deepEqual(t, {
    proveedores: 2, comprobantes: 3, vencido: 81000, porVencer: 2355724.8,
    sinFecha: 500000, total: 2936724.8,
  })
})

// ═══ EL DETALLE DEL PANEL ═══

test('el detalle trae sólo las líneas de ese proveedor, lo vencido primero y de la más vieja', () => {
  const resueltos = resolver(
    { nombre_norm: 'A', proveedor_id: 'a', proveedor_nombre: 'A', estado: 'vinculado' },
    { nombre_norm: 'B', proveedor_id: 'b', proveedor_nombre: 'B', estado: 'vinculado' },
  )
  const { lineas, filas } = armar([
    compra({ fila: 1, proveedor: 'A', saldo_pendiente: 100, fecha_prevista: '2026-09-30' }),
    compra({ fila: 2, proveedor: 'A', saldo_pendiente: 200, fecha_prevista: '2026-09-02' }),
    compra({ fila: 3, proveedor: 'A', saldo_pendiente: 300, fecha_prevista: '2026-09-10' }),
    compra({ fila: 4, proveedor: 'B', saldo_pendiente: 999, fecha_prevista: '2026-09-02' }),
  ], resueltos)
  const a = filas.find((f) => f.nombre === 'A')
  assert.ok(a)
  const d = detalleDeProveedor(lineas, a)
  assert.deepEqual(d.lineas.map((l) => l.fila), [2, 3, 1])
  assert.equal(d.vencido, 500)
  assert.equal(d.porVencer, 100)
  assert.equal(d.total, 600)
  // El panel cierra contra la fila de la tabla: son el mismo número por dos caminos.
  assert.equal(d.total, a.total)
})

// ═══ EL COTEJO CONTRA `proveedor_deuda` ═══

test('el cotejo calla cuando cierran y habla cuando no', () => {
  const resueltos = resolver({ nombre_norm: 'A', proveedor_id: 'a', proveedor_nombre: 'A', estado: 'vinculado' })
  const { filas } = armar([compra({ fila: 1, proveedor: 'A', saldo_pendiente: 1000.5 })], resueltos)
  assert.equal(cotejoDeDeuda(filas[0], 1000.5), null)
  assert.equal(cotejoDeDeuda(filas[0], null), null, 'sin fila canónica no hay descuadre que declarar')
  assert.match(cotejoDeDeuda(filas[0], 900) ?? '', /difieren en 100,?\.?50/)
})

// ═══ LA CUOTA ADELANTE ═══
//
// Defecto visto en la pantalla el 16/09/2026: las nueve líneas de Pedro Tello se dibujaban idénticas
// porque lo único que las distingue —«pago 2 de 4»— vive al final de un concepto que el recorte
// corta. Nueve renglones iguales con nueve importes distintos no se pueden auditar.

test('la cuota se reconoce al final del concepto y pasa adelante', () => {
  const c = 'Hormigonado 2.144 m² × $4.400 = $9.433.600 · a cuenta $1.250.000 · pago 2 de 4 (vence 18/09/2026)'
  assert.equal(etiquetaDeCuota(c), 'pago 2 de 4')
  assert.match(conceptoConCuotaAdelante(c) ?? '', /^pago 2 de 4 · Hormigonado/)
  // No se pierde nada del texto original: sólo se mueve el tramo.
  assert.match(conceptoConCuotaAdelante(c) ?? '', /a cuenta \$1\.250\.000/)
  assert.match(conceptoConCuotaAdelante(c) ?? '', /\(vence 18\/09\/2026\)/)
})

test('«cuota N de M» también, y dos conceptos distintos dejan de verse iguales', () => {
  const a = 'Hormigonado pisos industriales · resto 1.466 m² × $4.400 · cuota 1 de 6 (vence 18/09/2026)'
  const b = 'Hormigonado pisos industriales · resto 1.466 m² × $4.400 · cuota 4 de 6 (vence 09/10/2026)'
  const [ra, rb] = [conceptoConCuotaAdelante(a), conceptoConCuotaAdelante(b)]
  assert.match(ra ?? '', /^cuota 1 de 6 · /)
  assert.match(rb ?? '', /^cuota 4 de 6 · /)
  // LO QUE ESTE TEST PROTEGE: los primeros 40 caracteres —lo único que la celda muestra— difieren.
  assert.notEqual(ra?.slice(0, 40), rb?.slice(0, 40))
})

test('un concepto sin cuota vuelve tal cual, y un concepto vacío no se inventa', () => {
  assert.equal(etiquetaDeCuota('Thinner sello oro 1L'), null)
  assert.equal(conceptoConCuotaAdelante('Thinner sello oro 1L'), 'Thinner sello oro 1L')
  assert.equal(conceptoConCuotaAdelante(null), null)
})
