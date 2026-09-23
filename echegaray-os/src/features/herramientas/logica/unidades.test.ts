import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigoDeUnidad, codigosParaEtiquetas, individualizable, partesDeUnidad, unidadesDe, type Unidad } from './unidades.ts'
import { activo } from './fixture.test-util.ts'

const u = (p: Partial<Unidad> & Pick<Unidad, 'id' | 'activo_id' | 'numero' | 'codigo'>): Unidad =>
  ({ estado: 'operativo', ubicacion_id: null, nota: null, creado_en: '2026-09-23T12:00:00Z', ...p })

test('el código de una unidad es el del lote, una barra y el número; se lee de vuelta', () => {
  assert.equal(codigoDeUnidad('BAL-001', 3), 'BAL-001/3')
  assert.deepEqual(partesDeUnidad('BAL-001/3'), { lote: 'BAL-001', numero: 3 })
  assert.deepEqual(partesDeUnidad(' bal-001/12 '), { lote: 'BAL-001', numero: 12 }, 'tipeado a mano, en minúsculas')
  assert.deepEqual(partesDeUnidad('HER-0042/1'), { lote: 'HER-0042', numero: 1 }, 'los códigos del esquema anterior tienen 4 cifras')
  assert.equal(partesDeUnidad('BAL-001'), null, 'el código del lote no es una unidad')
  assert.equal(partesDeUnidad('BAL-001/0'), null, 'la numeración arranca en 1')
  assert.equal(partesDeUnidad('BAL-001/3/4'), null)
})

test('un lote de 7 con 2 códigos puede recibir 5 más; se proponen los que faltan', () => {
  const lote = activo({ id: 'l', codigo: 'BAL-001', nombre: 'Balde · lote', cantidad: 7 })
  const unidades = [u({ id: 'a', activo_id: 'l', numero: 1, codigo: 'BAL-001/1' }), u({ id: 'b', activo_id: 'l', numero: 2, codigo: 'BAL-001/2' })]
  assert.deepEqual(individualizable(lote, unidades), { puede: true, tiene: 2, faltan: 5, propuesta: 5 })
})

test('un lote de 580 propone una hoja de etiquetas (24), no las 580 de golpe', () => {
  const lote = activo({ id: 'p', codigo: 'PUN-004', nombre: 'Puntal', cantidad: 580 })
  const r = individualizable(lote, [])
  assert.ok(r.puede)
  assert.equal(r.propuesta, 24)
  assert.equal(r.faltan, 580)
})

test('una sola unidad ya tiene su código; un lote completo no recibe más; la baja tampoco; sin migración se dice', () => {
  const rodado = activo({ id: 'r', codigo: 'TOY-001', nombre: 'Hilux', cantidad: 1, clase: 'rodado' })
  assert.deepEqual(individualizable(rodado, []), { puede: false, motivo: 'una_sola', tiene: 0 })
  const lote = activo({ id: 'l', codigo: 'BAL-001', nombre: 'Balde', cantidad: 2 })
  const todas = [u({ id: 'a', activo_id: 'l', numero: 1, codigo: 'BAL-001/1' }), u({ id: 'b', activo_id: 'l', numero: 2, codigo: 'BAL-001/2' })]
  assert.deepEqual(individualizable(lote, todas), { puede: false, motivo: 'completo', tiene: 2 })
  assert.deepEqual(individualizable({ ...lote, estado: 'baja' }, []), { puede: false, motivo: 'baja', tiene: 0 })
  assert.deepEqual(individualizable(lote, null), { puede: false, motivo: 'sin_migracion', tiene: 0 })
})

test('las unidades de un lote salen por número y las de otro lote no se mezclan; la baja no se imprime', () => {
  const unidades = [
    u({ id: 'c', activo_id: 'l', numero: 3, codigo: 'BAL-001/3' }),
    u({ id: 'x', activo_id: 'otro', numero: 1, codigo: 'REG-003/1' }),
    u({ id: 'a', activo_id: 'l', numero: 1, codigo: 'BAL-001/1', estado: 'baja' }),
    u({ id: 'b', activo_id: 'l', numero: 2, codigo: 'BAL-001/2' }),
  ]
  const mias = unidadesDe(unidades, 'l')
  assert.deepEqual(mias.map((x) => x.numero), [1, 2, 3])
  assert.equal(codigosParaEtiquetas(mias), 'BAL-001/2,BAL-001/3')
  assert.deepEqual(unidadesDe(null, 'l'), [])
})
