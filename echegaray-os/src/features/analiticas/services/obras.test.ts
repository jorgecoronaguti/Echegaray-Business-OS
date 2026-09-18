import test from 'node:test'
import assert from 'node:assert/strict'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'
import { baseDelContrato } from '../../clientes/services/contratoDeObra.ts'
import { agruparPorSemaforo, armarObra, elegirObra, costoObjetivoValido, estadoDe, fraseDeObra, grupoDe, pasaEstado, precioDe, rubrosComparables, type ObraPanel } from './obras.ts'
import { filaDe, presupuestoDe } from './presupuesto.fixture.ts'

// Las filas se construyen con las MISMAS funciones de producción que convierten la respuesta de la base.
const panel = (id: string, extra: Partial<ObraPanel> = {}): ObraPanel => ({
  obra_id: id, nombre: id.toUpperCase(), cliente_id: 'c1', cliente_slug: 'messina', cliente_nombre: 'Messina',
  estado: 'activa', n_comprobantes: 3, avance_pct: null, ...extra,
})
const costo = (fila: Record<string, unknown>) => armarCostosPorObra([{ obra_id: 'x', ...fila }])?.get('x')

test('una obra sin presupuesto va a «Sin presupuesto», nunca a «Dentro» al 0 %', () => {
  const o = armarObra(panel('x'), filaDe('x'), costo({ materiales: 5e6 }))
  assert.equal(o?.grupo, 'sinPresupuesto')
  assert.equal(o?.avanceGasto, null)
  assert.equal(fraseDeObra(o!), 'sin presupuesto cargado')
})

test('EL CONTRATO NO ES PRESUPUESTO: con contrato firmado y sin presupuesto, la obra no se compara', () => {
  const f = filaDe('x', { contrato: { contratado: 100e6, contratado_origen: 'contrato', contrato_total: 100e6, contrato_mano_obra: 100e6, contrato_materiales: 0, contrato_cita: 'OC 1' } })
  const o = armarObra(panel('x'), f, costo({ materiales: 85e6 }))!
  assert.equal(o.precio, 100e6, 'el contrato sigue a la vista como referencia')
  assert.equal(o.contrato.conPapel, true)
  assert.equal(o.contrato.materialesDelCliente, true)
  assert.equal(o.presupuesto, null)
  assert.equal(o.grupo, 'sinPresupuesto')
  assert.equal(o.presupuestoRubros, null)
})

test('el precio de Analíticas es baseDelContrato, también con origen suma-viva (dueño 18/09: la cifra de la ficha)', () => {
  assert.deepEqual(precioDe(filaDe('x', { contrato: { contratado: 17704199, contratado_origen: 'suma-viva' } }).contrato), { precio: 17704199, ausencia: null })
  assert.deepEqual(precioDe(filaDe('x', { contrato: { contratado: 5008661, contratado_origen: 'formulario' } }).contrato), { precio: 5008661, ausencia: null })
  assert.deepEqual(precioDe(null), { precio: null, ausencia: 'sin precio' })
})

test('una pata en dólares sin valuar se dice «sin valuar», no «sin precio»', () => {
  assert.deepEqual(precioDe(filaDe('x', { contrato: { contrato_mano_obra_usd: 63000, contrato_mano_obra: null, contratado: null, contratado_origen: 'contrato' } }).contrato),
    { precio: null, ausencia: 'sin valuar' })
})

test('con presupuesto por rubro se mide contra su total, aunque el contrato sea mayor', () => {
  const f = filaDe('x', { contrato: { contratado: 100e6, contratado_origen: 'contrato', contrato_total: 100e6 }, rubros: { MO: 30e6, MAT: 50e6, SUB: null, OTR: null } })
  const con = armarObra(panel('x'), f, costo({ materiales: 85e6 }))!
  assert.equal(con.presupuesto, 80e6)
  assert.equal(con.grupo, 'pasadas')
  assert.equal(fraseDeObra(con), 'se pasó $ 5,00 M')
  assert.deepEqual(con.presupuestoRubros, { manoObra: 30e6, materiales: 50e6, subcontratos: null, otros: null })
  assert.deepEqual(rubrosComparables(con.presupuestoRubros), ['manoObra', 'materiales'])
  assert.deepEqual(rubrosComparables({ manoObra: 1, materiales: 0, subcontratos: 0, otros: null }), ['manoObra', 'materiales', 'subcontratos'], 'cero es un presupuesto: previsto en nada')
})

test('umbrales del semáforo: >100 % pasada, ≥80 % cerca, <80 % dentro, sin gasto va a «sin movimiento» y NO a dentro', () => {
  assert.equal(grupoDe(100, 100.01), 'pasadas')
  assert.equal(grupoDe(100, 100), 'cerca')
  assert.equal(grupoDe(100, 80), 'cerca')
  assert.equal(grupoDe(100, 79.99), 'dentro')
  assert.equal(grupoDe(100, null), 'sinMovimiento')
  assert.equal(grupoDe(100, 0), 'sinMovimiento')
  assert.equal(grupoDe(0, 5), 'pasadas', 'previsto en cero y gastado: pasada')
  const o = armarObra(panel('x'), presupuestoDe('x', { MAT: 10e6 }), null)!
  assert.equal(fraseDeObra(o), 'sin movimiento todavía')
  assert.equal(o.grupo, 'sinMovimiento')
  assert.equal(o.gasto.total, null, 'sin fila de costo el gasto es null, no 0')
})

test('el gasto suma mano de obra, subcontratos, materiales y otros; las horas no son plata', () => {
  const o = armarObra(panel('x'), presupuestoDe('x', { MAT: 10e6 }),
    costo({ mano_obra: 2e6, subcontratos: 1e6, materiales: 3e6, otros: 0.5e6, horas_valorizadas: 400, horas_sin_tarifa: 100 }))!
  assert.equal(o.gasto.total, 6.5e6)
  assert.equal(o.gasto.otros, 0.5e6)
  assert.equal(o.gasto.horas, 500)
  assert.equal(o.gasto.horasValorizadas, 400)
  assert.equal(fraseDeObra(o), 'le quedan $ 7,00 M', 'materiales contra materiales: 10 − 3; los otros rubros no tienen presupuesto')
})

test('una obra sin cliente (prueba, galpones sin dueño) no entra a la cartera', () => {
  assert.equal(armarObra(panel('x', { cliente_id: null, cliente_slug: null }), null, null), null)
})

test('estado de obra: cerrada = terminada; activa sin comprobantes ni avance = sin iniciar', () => {
  assert.equal(estadoDe({ estado: 'cerrada', n_comprobantes: 0, avance_pct: null }), 'terminada')
  assert.equal(estadoDe({ estado: 'activa', n_comprobantes: 0, avance_pct: null }), 'sinIniciar')
  assert.equal(estadoDe({ estado: 'activa', n_comprobantes: 0, avance_pct: 10 }), 'curso')
  assert.equal(pasaEstado('sinIniciar', 'curso'), true, '«En curso» es lo activo, como en Clientes: incluye lo que todavía no consumió')
  assert.equal(pasaEstado('terminada', 'curso'), false)
  assert.equal(pasaEstado('curso', 'sinIniciar'), false)
  assert.equal(pasaEstado('terminada', 'todas'), true)
})

test('los grupos salen en el orden del semáforo y la más pasada primero', () => {
  const a = armarObra(panel('a'), presupuestoDe('a', { MAT: 10e6 }), costo({ materiales: 11e6 }))!
  const b = armarObra(panel('b'), presupuestoDe('b', { MAT: 10e6 }), costo({ materiales: 15e6 }))!
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
  const a = armarObra(panel('a'), null, costo({ materiales: 1e6 }))!
  const b = armarObra(panel('b'), null, costo({ materiales: 9e6 }))!
  assert.equal(elegirObra([a, b], 'a')?.id, 'a')
  assert.equal(elegirObra([a, b], 'no-esta-en-el-filtro')?.id, 'b')
  assert.equal(elegirObra([a, b], null)?.id, 'b')
  assert.equal(elegirObra([], 'a'), null)
})

// ═══ UNA SOLA DEFINICIÓN DEL CONTRATADO (dueño, 18/09/2026) ═══
// La ficha de la obra y el CRM muestran `baseDelContrato({ contratoTotal, contratado })`. Analíticas
// tiene que mostrar EXACTAMENTE lo mismo, al peso, para cualquier fila: si alguien vuelve a poner una
// regla propia en `precioDe` (excluir un origen, exigir > 0, redondear), esto falla.
test('Analíticas y la ficha dicen el mismo contratado, al peso, en toda combinación de la fila', () => {
  const totales = [null, 0, 139_000_000, 44_110_000.55]
  const contratados = [null, 0, 17_704_199, 40_000_000, 102_500_000.1]
  const origenes = [null, 'contrato', 'oc-pesos', 'oc-usd-x-tc', 'suma-viva', 'formulario']
  let n = 0
  for (const contrato_total of totales) for (const contratado of contratados) for (const contratado_origen of origenes) {
    const fila = filaDe('x', { contrato: { contrato_total, contratado, contratado_origen } })
    const ficha = baseDelContrato({ contratoTotal: contrato_total, contratado })
    assert.equal(precioDe(fila.contrato).precio, ficha, `total ${contrato_total} · contratado ${contratado} · ${contratado_origen}`)
    assert.equal(armarObra(panel('x'), fila, null)?.precio ?? null, ficha)
    n++
  }
  assert.equal(n, 120)
})
