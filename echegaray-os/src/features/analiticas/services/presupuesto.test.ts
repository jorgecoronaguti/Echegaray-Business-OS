import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFINICION_RUBRO, leerEconomiaRubros, RUBROS, rubroDeDb } from './presupuesto.ts'
import { filaDe, presupuestoDe } from './presupuesto.fixture.ts'
import { armarObra, precioDe } from './obras.ts'
import { celda } from './agregados.ts'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'

const obra = (id: string, gasto: Record<string, unknown> | null, f: ReturnType<typeof presupuestoDe> | null) => armarObra(
  { obra_id: id, nombre: id, cliente_id: 'c', cliente_slug: 'c', cliente_nombre: 'C', estado: 'activa', n_comprobantes: 1, avance_pct: null },
  f, gasto ? armarCostosPorObra([{ obra_id: id, ...gasto }])?.get(id) : null)!

test('LOS CUATRO RUBROS son los de la base y del lector de Drive (orquestador/lib/presupuesto-rubros.mjs), con la misma definición', async () => {
  const lib = await import('../../../../orquestador/lib/presupuesto-rubros.mjs')
  assert.deepEqual(RUBROS.map((r) => r.db), [...lib.RUBROS])
  for (const r of RUBROS) {
    assert.equal(DEFINICION_RUBRO[r.clave], lib.DEFINICION_RUBRO[r.db], `la definición de ${r.db} difiere entre la pantalla y el lector`)
    assert.equal(r.rotulo, lib.ROTULO_RUBRO[r.db])
  }
  assert.equal(rubroDeDb('subcontratistas'), 'subcontratos')
  assert.equal(rubroDeDb('cualquiera'), null)
})

test('no se pudo leer ≠ no hay presupuesto: cada uno con su motivo', () => {
  assert.equal(leerEconomiaRubros(null).motivo, 'no se pudo leer el presupuesto ni el contrato')
  assert.deepEqual(leerEconomiaRubros([]).motivo, 'sin presupuesto cargado')
  assert.equal(leerEconomiaRubros([{ obra_canonica_id: 'x', contratado: 'no es un número' }]).porObra.size, 0, 'una fila que no parsea no entra')
})

test('una obra sin presupuesto trae SU motivo (messina-bsa); una sin fila dice «sin presupuesto cargado»', () => {
  const motivo = 'la recotización 2026 aprobada no tiene costo cotizado'
  const o = obra('messina-bsa', { materiales: 5e6 }, filaDe('messina-bsa', { motivo }))
  assert.equal(o.presupuesto, null)
  assert.equal(o.motivoPresupuesto, motivo)
  assert.equal(o.presupuestoRubros, null)
  assert.equal(celda(o, 'materiales').cotizadoAusente, motivo)
  const sinFila = obra('z', { materiales: 1 }, null)
  assert.equal(sinFila.motivoPresupuesto, 'sin presupuesto cargado')
})

test('RUBRO CONTRA RUBRO: Quattropani cotizó mano de obra, el fondo de materiales y otros; subcontratistas quedó fuera de la oferta', () => {
  const q = obra('quattropani', { mano_obra: 30e6, materiales: 37e6, subcontratos: 3e6, otros: 0.2e6 },
    presupuestoDe('quattropani', { MO: 39.35e6, MAT: 44.11e6, SUB: null, OTR: 0.23e6 }, { motivos: { SUB: 'la oferta es sólo mano de obra: fuera del precio' } }))
  assert.equal(q.presupuesto, 39.35e6 + 44.11e6 + 0.23e6)
  assert.equal(q.consumoComparable, 30e6 + 37e6 + 0.2e6, 'los subcontratos no entran: no tienen presupuesto')
  assert.equal(celda(q, 'subcontratos').cotizadoAusente, 'la oferta es sólo mano de obra: fuera del precio')
  assert.deepEqual(celda(q, 'subcontratos').lectura, { tipo: 'sinPresupuesto', monto: null })
  assert.deepEqual(celda(q, 'manoObra').lectura, { tipo: 'queda', monto: 9.35e6 })
  assert.deepEqual(celda(q, 'otros').lectura, { tipo: 'queda', monto: 0.03e6 })
  assert.equal(q.fuentePresupuesto, 'cot.xlsm · 27/07/2026')
})

test('un rubro previsto en CERO no es una ausencia: si se gastó, «no previsto» con lo gastado entero', () => {
  const o = obra('p', { subcontratos: 3e6, mano_obra: 1e6 }, presupuestoDe('p', { MO: 5e6, MAT: 0, SUB: 0, OTR: 0 }))
  assert.equal(o.presupuesto, 5e6)
  assert.equal(o.consumoComparable, 4e6, 'los subcontratos entran: el rubro tiene presupuesto (cero)')
  assert.deepEqual(celda(o, 'subcontratos').lectura, { tipo: 'noPrevisto', monto: 3e6 })
  assert.deepEqual(celda(o, 'materiales').lectura, { tipo: 'sinMovimiento', monto: null })
})

test('estimado lo dice el rubro: un ajuste en mano de obra no vuelve estimados los materiales', () => {
  const f = presupuestoDe('l', { MO: 34e6, MAT: 47e6, SUB: 0, OTR: 0 }, { estimados: ['manoObra'] })
  assert.deepEqual(f.presupuesto?.estimados, ['manoObra'])
  assert.equal(f.presupuesto?.estimado, true)
  const o = obra('l', { mano_obra: 1e6 }, f)
  assert.equal(celda(o, 'manoObra').estimado, true)
  assert.equal(celda(o, 'materiales').estimado, false)
})

test('el detalle del presupuesto viaja por rubro, con lo que quedó fuera de la oferta marcado', () => {
  const f = presupuestoDe('e', { MO: 3.83e6, MAT: null, SUB: 0, OTR: 0 }, {
    detalle: {
      MO: [{ item: 'OFICIAL ESPECIALIZADO', unidad: 'hs', cantidad: 121.5, importe: 826200, porque: 'unidad hs' }],
      MAT: [{ item: 'CAÑO ESTRUCTURAL 150X50X2', unidad: 'UN', cantidad: 3, importe: 381398, fuera_de_oferta: true }],
    },
    motivos: { MAT: 'los materiales los provee el cliente' },
  })
  const r = f.presupuesto!.rubros
  assert.equal(r.manoObra.detalle[0].item, 'OFICIAL ESPECIALIZADO')
  assert.equal(r.manoObra.detalle[0].fueraDeOferta, false)
  assert.equal(r.materiales.monto, null)
  assert.equal(r.materiales.motivo, 'los materiales los provee el cliente')
  assert.equal(r.materiales.detalle[0].fueraDeOferta, true)
  assert.equal(r.subcontratos.detalle.length, 0)
})

test('las horas cotizadas vienen de la misma vista', () => {
  const o = obra('h', { horas_valorizadas: 150 }, presupuestoDe('h', { MO: 1, MAT: 0, SUB: 0, OTR: 0 }, { hh: 200 }))
  assert.equal(o.hhPresupuestadas, 200)
  assert.deepEqual(celda(o, 'horas').lectura, { tipo: 'queda', monto: 50 })
})

test('el contratado sale de la misma fila: precio salvo suma viva; una pata en dólares sin valuar se dice', () => {
  assert.deepEqual(precioDe(filaDe('a', { contrato: { contratado: 40e6, contratado_origen: 'presupuesto' } }).contrato), { precio: 40e6, ausencia: null })
  assert.deepEqual(precioDe(filaDe('b', { contrato: { contratado: 17.7e6, contratado_origen: 'suma-viva' } }).contrato), { precio: null, ausencia: 'sin precio' })
  assert.deepEqual(precioDe(filaDe('c', { contrato: { contratado: null, contratado_usd: 63000, contratado_origen: 'contrato' } }).contrato), { precio: null, ausencia: 'sin valuar' })
  assert.deepEqual(precioDe(filaDe('d', { contrato: { contratado: 5008661, contratado_origen: 'formulario' } }).contrato), { precio: 5008661, ausencia: null })
})
