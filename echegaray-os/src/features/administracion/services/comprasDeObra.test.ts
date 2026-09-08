import test from 'node:test'
import assert from 'node:assert/strict'
import {
  esCompraDeObra, esDudosa, motivoFuera, separarComprasDeObra, totalFuera,
  type Clasificable,
} from './comprasDeObra.ts'

/** Una fila de la pestaña. Los valores por defecto son una compra de obra normal. */
const fila = (p: Partial<Clasificable> = {}): Clasificable => ({
  proveedor: 'Corralon Progreso', concepto: 'Art de plomeria', detalle_obra: null,
  unidad_negocio: 'Civil', estado: 'Pagado', ...p,
})

// ── LO QUE ENTRA (filas reales de `compra_sheet`, 08/09/2026) ───────────────────────────────────

test('los tres rubros que nombró el dueño entran', () => {
  for (const rubro of ['Civil', 'Estructura', 'Mantenimiento']) {
    assert.equal(esCompraDeObra(fila({ unidad_negocio: rubro })), true, rubro)
  }
})

test('el gasto de estructura entra: el dueño lo nombró explícitamente', () => {
  // Movistar 13 filas, Google 5, JL Libreria 2, honorarios 9 — todas Estructura.
  assert.equal(esCompraDeObra(fila({ proveedor: 'Movistar', concepto: 'Plan', unidad_negocio: 'Estructura' })), true)
  assert.equal(esCompraDeObra(fila({
    proveedor: 'Robles Jose Maria', concepto: 'Honorarios Profesionales Agosto 2026',
    unidad_negocio: 'Estructura',
  })), true)
})

test('una sigla que CONTIENE una palabra de la lista no saca al proveedor', () => {
  // «Goldstein Automores SACI» es una concesionaria con 2 compras reales. Buscar «SAC» dentro del
  // nombre la sacaría; por eso las siglas cortas se comparan contra el nombre COMPLETO.
  assert.equal(esCompraDeObra(fila({
    proveedor: 'Goldstein Automores SACI', concepto: 'Service', unidad_negocio: 'Estructura',
  })), true)
})

test('una fila anulada de un proveedor de obra sigue siendo una compra: anular no es «no es obra»', () => {
  // Fila 640, «Gruas San Blas · PM1000 y mantenimiento gral», estado ELIMINADO. La pantalla ya la
  // dibuja tachada; sacarla acá cambiaría dos cosas a la vez y el total dejaría de cerrar.
  assert.equal(esCompraDeObra(fila({
    proveedor: 'Gruas San Blas', concepto: 'PM1000 y mantenimiento gral',
    unidad_negocio: 'Estructura', estado: 'ELIMINADO',
  })), true)
})

test('EL TALLER ENTRA — pedido textual del dueño: «dejar solo lo que va a obra o TALLER»', () => {
  // Destino Taller: 73 filas + TALLER 5 + Almacen 24. Son herramientas, vehículos, máquinas y su
  // mantenimiento; vienen con rubro Estructura o Mantenimiento y entran por ahí.
  for (const destino of ['Taller', 'TALLER', 'Almacen']) {
    assert.equal(esCompraDeObra(fila({
      proveedor: 'Neumagom', concepto: `Neumaticos · ${destino}`, unidad_negocio: 'Estructura',
    })), true, destino)
  }
  assert.equal(esCompraDeObra(fila({
    proveedor: 'Perera Walter Daniel', concepto: 'Arreglo camion', unidad_negocio: 'Mantenimiento',
  })), true)
})

test('el destino Taller NO rescata una fila que no es una compra', () => {
  // «Banco · Crédito Prendario» imputado al taller sigue siendo una cuota. Y la fila 884 —proveedor
  // «Sueldos», «Arreglo de camion 608 y orden en fondo del taller»— es mano de obra: sale.
  assert.equal(esCompraDeObra(fila({
    proveedor: 'Banco', concepto: 'Credito Prendario', unidad_negocio: 'Financiero',
  })), false)
  assert.equal(motivoFuera(fila({
    proveedor: 'Sueldos', concepto: 'Arreglo de camion 608 y orden en fondo del taller',
    unidad_negocio: 'Estructura',
  })), 'proveedor')
})

// ── LO QUE SALE ─────────────────────────────────────────────────────────────────────────────────

test('el rubro Impuestos sale entero — ARCA, F931, planes, FCL, SINDICATOS', () => {
  assert.equal(motivoFuera(fila({
    proveedor: 'ARCA', concepto: 'Plan F931 W303094', unidad_negocio: 'Impuestos',
  })), 'rubro')
  assert.equal(motivoFuera(fila({
    proveedor: 'SINDICATOS', concepto: 'Agosto', unidad_negocio: 'Impuestos',
  })), 'rubro')
  assert.equal(motivoFuera(fila({ proveedor: 'FCL', concepto: '', unidad_negocio: 'Impuestos' })), 'rubro')
})

test('el rubro Financiero sale entero — el préstamo de la camioneta no es una compra', () => {
  assert.equal(motivoFuera(fila({
    proveedor: 'Banco', concepto: 'Préstamo Camioneta Ford XLS · Crédito Prendario',
    unidad_negocio: 'Financiero',
  })), 'rubro')
})

test('SUELDOS y SAC salen aunque el rubro sea de obra: es el defecto que el rubro solo no ve', () => {
  // 62 filas de «Sueldos» (19 Civil, 42 Estructura, 1 Mantenimiento) y 6 de «SAC» (Estructura).
  // El dueño imputa la mano de obra a la obra que la consumió — correcto para el costo, y por eso
  // filtrar sólo por rubro las dejaría a todas adentro.
  assert.equal(motivoFuera(fila({
    proveedor: 'Sueldos', concepto: 'SAN FRANCISCO', unidad_negocio: 'Civil',
  })), 'proveedor')
  assert.equal(motivoFuera(fila({
    proveedor: 'SAC', concepto: 'Junio', unidad_negocio: 'Estructura', estado: 'Pagado',
  })), 'proveedor')
  assert.equal(motivoFuera(fila({
    proveedor: 'Sueldos', concepto: 'Junio - Segunda', unidad_negocio: 'Mantenimiento',
  })), 'proveedor')
})

test('el organismo con apellido también sale: se busca la palabra, no el nombre exacto', () => {
  for (const p of ['Banco Santander', 'ARCA · F931', 'UOCRA Seccional San Juan', 'IERIC']) {
    assert.equal(esCompraDeObra(fila({ proveedor: p, unidad_negocio: 'Estructura' })), false, p)
  }
})

test('«sale por …» es la marca del propio dueño: esa plata no se paga acá', () => {
  assert.equal(motivoFuera(fila({
    proveedor: 'Otro', concepto: 'sale por Jornales por Quincena', unidad_negocio: 'Estructura',
    estado: 'Pendiente',
  })), 'sale-por-otro-lado')
  assert.equal(motivoFuera(fila({
    proveedor: 'Otro', concepto: null, detalle_obra: 'sale por Cargas Sociales',
    unidad_negocio: 'Civil', estado: 'Pagado',
  })), 'sale-por-otro-lado')
})

test('Cancelado sale aunque el proveedor y el rubro sean de obra', () => {
  assert.equal(motivoFuera(fila({ estado: 'Cancelado' })), 'cancelada')
})

test('SAC y ARCA salen también en PROYECTADO: no hace falta que estén canceladas', () => {
  // Precisión del dueño (08/09): «sacar todo eso» — no sólo lo que él ya marcó Cancelado. Las dos
  // filas de SAC de julio ($7.000.000 y $1.500.000) están Proyectado y son las que la captura
  // mostraba como «SAC · Segunda - 15 Empleados».
  assert.equal(motivoFuera(fila({
    proveedor: 'SAC', concepto: 'Segunda - 15 Empleados', unidad_negocio: 'Estructura',
    estado: 'Proyectado',
  })), 'proveedor')
  assert.equal(motivoFuera(fila({
    proveedor: 'ARCA', concepto: 'F931 Agosto', unidad_negocio: 'Impuestos', estado: 'Proyectado',
  })), 'rubro')
})

// ── LO DESCONOCIDO NO SE ESCONDE ────────────────────────────────────────────────────────────────

test('un rubro que no está en ninguna lista ENTRA y queda marcado como dudoso', () => {
  const f = fila({ unidad_negocio: 'Vialidad', proveedor: 'Corralon Progreso' })
  assert.equal(esCompraDeObra(f), true)
  assert.equal(esDudosa(f), true)
})

test('una fila de rubro conocido NO es dudosa, y una que salió tampoco', () => {
  assert.equal(esDudosa(fila()), false)
  assert.equal(esDudosa(fila({ unidad_negocio: 'Impuestos', proveedor: 'ARCA' })), false)
})

test('un rubro vacío no alcanza para esconder una compra', () => {
  assert.equal(esCompraDeObra(fila({ unidad_negocio: null })), true)
  assert.equal(esDudosa(fila({ unidad_negocio: null })), true)
})

// ── EL CORTE COMPLETO ───────────────────────────────────────────────────────────────────────────

test('separar devuelve las de obra, la cuenta por motivo y las dudosas', () => {
  const filas = [
    fila(),
    fila({ proveedor: 'Sueldos', unidad_negocio: 'Civil' }),
    fila({ proveedor: 'ARCA', unidad_negocio: 'Impuestos' }),
    fila({ estado: 'Cancelado' }),
    fila({ proveedor: 'Ferretec', concepto: 'sale por Cargas Sociales' }),
    fila({ unidad_negocio: 'Vialidad' }),
  ]
  const corte = separarComprasDeObra(filas)
  assert.equal(corte.deObra.length, 2)
  assert.deepEqual(corte.fuera, { rubro: 1, proveedor: 1, cancelada: 1, 'sale-por-otro-lado': 1 })
  assert.equal(totalFuera(corte.fuera), 4)
  assert.equal(corte.dudosas.length, 1)
})

test('la fila que sale se cuenta UNA sola vez, con el motivo más fuerte', () => {
  // «ARCA · sale por Cargas Sociales · Cancelado» cumple tres condiciones a la vez. Si se contara en
  // las tres, el pie declararía haber sacado 84 filas cuando sacó 28 y nadie podría cuadrarlo.
  const corte = separarComprasDeObra([
    fila({ proveedor: 'ARCA', concepto: 'sale por Cargas Sociales', unidad_negocio: 'Impuestos', estado: 'Cancelado' }),
  ])
  assert.equal(totalFuera(corte.fuera), 1)
  assert.equal(corte.fuera.rubro, 1)
})
