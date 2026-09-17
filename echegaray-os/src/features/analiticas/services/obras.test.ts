import test from 'node:test'
import assert from 'node:assert/strict'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'
import { armarEconomiaDeObras } from '../../clientes/services/economiaObras.ts'
import { agruparPorSemaforo, armarObra, elegirObra, costoObjetivoValido, estadoDe, fraseDeObra, grupoDe, pasaEstado, precioDe, type ObraPanel } from './obras.ts'
import { presupuestoDe } from './presupuesto.fixture.ts'

// Las filas se construyen con las MISMAS funciones de producción que convierten la respuesta de la base.
const panel = (id: string, extra: Partial<ObraPanel> = {}): ObraPanel => ({
  obra_id: id, nombre: id.toUpperCase(), cliente_id: 'c1', cliente_slug: 'messina', cliente_nombre: 'Messina',
  estado: 'activa', n_comprobantes: 3, avance_pct: null, ...extra,
})
const eco = (fila: Record<string, unknown>) => armarEconomiaDeObras([{ obra_canonica_id: 'x', ...fila }]).get('x')
const costo = (fila: Record<string, unknown>) => armarCostosPorObra([{ obra_id: 'x', ...fila }])?.get('x')

test('una obra sin presupuesto va a «Sin presupuesto», nunca a «Dentro» al 0 %', () => {
  const o = armarObra(panel('x'), eco({ origen: null }), costo({ materiales: 5e6 }), null)
  assert.equal(o?.grupo, 'sinPresupuesto')
  assert.equal(o?.avanceGasto, null)
  assert.equal(fraseDeObra(o!), 'sin presupuesto cargado')
})

test('EL CONTRATO NO ES PRESUPUESTO: con contrato firmado y sin presupuesto, la obra no se compara', () => {
  const e = eco({ contratado: 1, origen: 'oc-pesos', contrato_total: 100e6, contrato_mano_obra: 100e6, contrato_materiales: 0, contrato_cita: 'OC 1' })
  const o = armarObra(panel('x'), e, costo({ materiales: 85e6 }), null)!
  assert.equal(o.precio, 100e6, 'el contrato sigue a la vista como referencia')
  assert.equal(o.presupuesto, null)
  assert.equal(o.grupo, 'sinPresupuesto')
  assert.equal(o.presupuestoRubros, null)
})

test('la suma viva de Cobranzas NO es un precio: medir contra ella da siempre «dentro»', () => {
  assert.deepEqual(precioDe(eco({ contratado: 17704199, origen: 'suma-viva' })), { precio: null, ausencia: 'sin precio' })
  assert.deepEqual(precioDe(eco({ contratado: 5008661, origen: 'formulario' })), { precio: 5008661, ausencia: null })
})

test('una pata en dólares sin valuar se dice «sin valuar», no «sin precio»', () => {
  assert.deepEqual(precioDe(eco({ contrato_mano_obra_usd: 63000, contrato_mano_obra: null, contrato_total: null, origen: 'oc-usd-x-tc' })),
    { precio: null, ausencia: 'sin valuar' })
})

test('con presupuesto por rubro se mide contra su total, aunque el contrato sea mayor', () => {
  const e = eco({ contratado: 1, origen: 'oc-pesos', contrato_total: 100e6, contrato_mano_obra: 100e6, contrato_materiales: 0, contrato_cita: 'OC 1' })
  const con = armarObra(panel('x'), e, costo({ materiales: 85e6 }), presupuestoDe('x', [['MA', 50e6], ['MO', 20e6], ['CS', 10e6]]))!
  assert.equal(con.presupuesto, 80e6)
  assert.equal(con.grupo, 'pasadas')
  assert.equal(fraseDeObra(con), 'se pasó $ 5,00 M')
  assert.deepEqual(con.presupuestoRubros, { manoObra: 30e6, materiales: 50e6, subcontratos: null, otros: null })
})

test('umbrales del semáforo: >100 % pasada, ≥80 % cerca, <80 % dentro, sin gasto va a «sin movimiento» y NO a dentro', () => {
  assert.equal(grupoDe(100, 100.01), 'pasadas')
  assert.equal(grupoDe(100, 100), 'cerca')
  assert.equal(grupoDe(100, 80), 'cerca')
  assert.equal(grupoDe(100, 79.99), 'dentro')
  assert.equal(grupoDe(100, null), 'sinMovimiento')
  assert.equal(grupoDe(100, 0), 'sinMovimiento')
  const o = armarObra(panel('x'), eco({ contratado: 10e6, origen: 'oc-pesos' }), null, presupuestoDe('x', [['MA', 10e6]]))!
  assert.equal(fraseDeObra(o), 'sin movimiento todavía')
  assert.equal(o.grupo, 'sinMovimiento')
  assert.equal(o.gasto.total, null, 'sin fila de costo el gasto es null, no 0')
})

test('el gasto suma mano de obra, subcontratos y materiales; las horas no son plata', () => {
  const o = armarObra(panel('x'), eco({ contratado: 10e6, origen: 'oc-pesos' }),
    costo({ mano_obra: 2e6, subcontratos: 1e6, materiales: 3e6, horas_valorizadas: 400, horas_sin_tarifa: 100 }), presupuestoDe('x', [['MA', 10e6]]))!
  assert.equal(o.gasto.total, 6e6)
  assert.equal(o.gasto.horas, 500)
  assert.equal(o.gasto.horasValorizadas, 400)
  assert.equal(fraseDeObra(o), 'le quedan $ 7,00 M', 'materiales contra MA: 10 − 3')
})

test('una obra sin cliente (prueba, galpones sin dueño) no entra a la cartera', () => {
  assert.equal(armarObra(panel('x', { cliente_id: null, cliente_slug: null }), null, null, null), null)
})

test('estado de obra: cerrada = terminada; activa sin comprobantes ni avance = sin iniciar', () => {
  assert.equal(estadoDe({ estado: 'cerrada', n_comprobantes: 0, avance_pct: null }), 'terminada')
  assert.equal(estadoDe({ estado: 'activa', n_comprobantes: 0, avance_pct: null }), 'sinIniciar')
  assert.equal(estadoDe({ estado: 'activa', n_comprobantes: 0, avance_pct: 10 }), 'curso')
  assert.equal(pasaEstado('sinIniciar', 'curso'), false)
  assert.equal(pasaEstado('terminada', 'todas'), true)
})

test('los grupos salen en el orden del semáforo y la más pasada primero', () => {
  const e = eco({ contratado: 10e6, origen: 'oc-pesos' })
  const a = armarObra(panel('a'), e, costo({ materiales: 11e6 }), presupuestoDe('a', [['MA', 10e6]]))!
  const b = armarObra(panel('b'), e, costo({ materiales: 15e6 }), presupuestoDe('b', [['MA', 10e6]]))!
  const g = agruparPorSemaforo([a, b])
  assert.deepEqual([...g.keys()], ['pasadas', 'cerca', 'dentro', 'sinMovimiento', 'sinPresupuesto'])
  assert.deepEqual(g.get('pasadas')?.map((o) => o.id), ['b', 'a'])
})

test('un pedazo de presupuesto convertido no es el costo objetivo de la obra (Quattropani, 2 partidas)', () => {
  assert.equal(costoObjetivoValido(1766784.47, 'partidas congeladas convertidas a esta obra (2)'), null)
  assert.equal(costoObjetivoValido(132944255, 'costo directo del presupuesto v1 (aprobado)'), 132944255)
  assert.equal(costoObjetivoValido(0, 'costo directo del presupuesto v1 (aprobado)'), null)
})

test('la obra de la vista Obras: la pedida si pasa los filtros; si no, la que más consumió', () => {
  const a = armarObra(panel('a'), null, costo({ materiales: 1e6 }), null)!
  const b = armarObra(panel('b'), null, costo({ materiales: 9e6 }), null)!
  assert.equal(elegirObra([a, b], 'a')?.id, 'a')
  assert.equal(elegirObra([a, b], 'no-esta-en-el-filtro')?.id, 'b')
  assert.equal(elegirObra([a, b], null)?.id, 'b')
  assert.equal(elegirObra([], 'a'), null)
})
