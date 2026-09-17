import test from 'node:test'
import assert from 'node:assert/strict'
import { leerPresupuestos, presupuestoPorObra, rubroDeCodigo } from './presupuesto.ts'
import { presupuestoDe } from './presupuesto.fixture.ts'
import { armarObra } from './obras.ts'
import { celda, totalesPorRubro } from './agregados.ts'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'

const cab = (obra: string, extra: Record<string, unknown> = {}) => ({
  id: `p-${obra}`, obra_canonica_id: obra, estado: 'aprobado', costo_directo_presupuestado: '100', costo_pendiente_motivo: null, fuente_legacy: 'x.xlsm', ...extra,
})
const obra = (id: string, gasto: Record<string, unknown> | null, p: ReturnType<typeof presupuestoDe>) => armarObra(
  { obra_id: id, nombre: id, cliente_id: 'c', cliente_slug: 'c', cliente_nombre: 'C', estado: 'activa', n_comprobantes: 1, avance_pct: null },
  null, gasto ? armarCostosPorObra([{ obra_id: id, ...gasto }])?.get(id) : null, p)!

test('no se pudo leer ≠ no hay presupuesto: cada uno con su motivo', () => {
  assert.equal(leerPresupuestos(null, null).motivo, 'no se pudo leer el presupuesto')
  assert.deepEqual(leerPresupuestos([], []), { cabeceras: [], filas: [], motivo: 'sin presupuesto cargado' })
})

test('sólo el aprobado es presupuesto: «reemplazado» y «cotizado» no entran', () => {
  const l = leerPresupuestos([cab('a', { estado: 'reemplazado' }), cab('b', { estado: 'cotizado' }), cab('c')], [])
  assert.deepEqual(l.cabeceras.map((x) => x.obraId), ['c'])
})

test('un aprobado sin costo se muestra con SU motivo (messina-bsa), y un costo NULL sin motivo no entra', () => {
  const motivo = 'recotización 2026 sin costo cotizado; pedido al dueño'
  const l = leerPresupuestos([cab('messina-bsa', { costo_directo_presupuestado: null, costo_pendiente_motivo: motivo }), cab('z', { costo_directo_presupuestado: null })], [])
  assert.deepEqual(l.cabeceras.map((x) => [x.obraId, x.costoTotal, x.motivo]), [['messina-bsa', null, motivo]])
  const o = obra('messina-bsa', { materiales: 5e6 }, presupuestoPorObra(l).get('messina-bsa') ?? null)
  assert.equal(o.presupuesto, null)
  assert.equal(o.motivoPresupuesto, motivo)
  assert.equal(celda(o, 'materiales').cotizadoAusente, motivo)
})

test('códigos de partida → rubro: MO y CS son mano de obra; MA y EQ materiales; SC y lo desconocido, otros', () => {
  assert.deepEqual(['MO', 'CS', 'ADIC-MO', 'RAMPA-MOCS', 'MA', 'RAMPA-EQ', 'ADIC-MA', 'SC', 'ADIC-SC', 'XYZ', null].map(rubroDeCodigo),
    ['manoObra', 'manoObra', 'manoObra', 'manoObra', 'materiales', 'materiales', 'materiales', 'otros', 'otros', 'otros', 'otros'])
})

test('RUBRO CONTRA RUBRO: una obra que sólo cotizó MO+CS no mide sus materiales contra ese presupuesto (Quattropani)', () => {
  const o = obra('quattropani', { mano_obra: 30e6, materiales: 37e6 }, presupuestoDe('quattropani', [['MO', 20e6], ['CS', 19e6]]))
  assert.equal(o.presupuesto, 39e6)
  assert.equal(o.consumoComparable, 30e6, 'sólo la mano de obra')
  assert.equal(o.grupo, 'dentro', 'con los materiales adentro daría «pasada» al 172 %')
  assert.equal(celda(o, 'materiales').cotizadoAusente, 'sin presupuesto de este rubro')
  assert.deepEqual(celda(o, 'materiales').lectura, { tipo: 'sinPresupuesto', monto: null })
  assert.deepEqual(celda(o, 'manoObra').lectura, { tipo: 'queda', monto: 9e6 })
})

test('el total del cliente por rubro no suma el gasto de obras que no presupuestaron ese rubro', () => {
  const q = obra('q', { materiales: 37e6 }, presupuestoDe('q', [['MO', 10e6]]))
  const p = obra('p', { materiales: 3e6 }, presupuestoDe('p', [['MA', 4e6]]))
  const mat = totalesPorRubro([q, p]).find((x) => x.item === 'materiales')!
  assert.equal(mat.gastado, 40e6, 'lo gastado se muestra entero')
  assert.deepEqual(mat.lectura, { tipo: 'queda', monto: 1e6 }, 'pero se compara sólo lo de la obra que presupuestó materiales')
})

test('INFERENCIA se rotula «estimado» por rubro; «otros» presupuestado no tiene consumo con qué compararse', () => {
  const o = obra('pisos', { mano_obra: 1e6 }, presupuestoDe('pisos', [['MO', 2e6, 'Piso · Mano de obra · INFERENCIA'], ['SC', 1e6]]))
  assert.equal(celda(o, 'manoObra').estimado, true)
  assert.equal(celda(o, 'otros').estimado, false)
  assert.deepEqual(celda(o, 'otros').lectura, { tipo: 'sinConsumo', monto: null })
  assert.equal(o.presupuesto, 2e6, '«otros» no entra a lo comparable')
})

test('una partida negativa, sin cabecera aprobada o con monto no numérico no entra', () => {
  const l = leerPresupuestos([cab('a')], [
    { presupuesto_id: 'p-a', codigo: 'MO', descripcion: 'ok', monto: '10' },
    { presupuesto_id: 'p-a', codigo: 'MA', descripcion: 'neg', monto: -1 },
    { presupuesto_id: 'p-otro', codigo: 'MO', descripcion: 'huérfana', monto: 5 },
    { presupuesto_id: 'p-a', codigo: 'CS', descripcion: 'texto', monto: 'mucho' },
  ])
  assert.deepEqual(l.filas.map((f) => [f.rubro, f.monto]), [['manoObra', 10]])
})
