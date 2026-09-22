import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { candidatos, categorias, sugerencias, cuentaPorEstado, filtrar, filtrosDeURL, queryDe } from './inventario.ts'
import { faltaMigracion } from './falta-migracion.ts'
import { activo, ubicacion } from './fixture.test-util.ts'

function parque() {
  return armarParque({
    ubicaciones: [ubicacion({ id: 'u-t', tipo: 'taller', nombre: 'Taller' }), ubicacion({ id: 'u-o', tipo: 'obra', obra_id: 'ob' })],
    obras: [{ id: 'ob', codigo: 'OB-0012', nombre: 'PISOS ARCOR', estado: 'activa', cliente: null }],
    activos: [
      activo({ id: '1', codigo: 'HER-0001', nombre: 'Amoladora Bosch', categoria: 'Eléctrica', ubicacion_id: 'u-o', estado: 'requiere_mantenimiento' }),
      activo({ id: '2', codigo: 'HER-0002', nombre: 'Amoladora Makita', categoria: 'Eléctrica', ubicacion_id: 'u-t', estado_asumido: true }),
      activo({ id: '3', codigo: 'HER-0003', nombre: 'Amoladora Stanley', estado: 'baja', baja_motivo: 'robada', baja_en: '2026-07-03T00:00:00Z' }),
      activo({ id: '4', codigo: 'HER-0004', nombre: 'Pala', categoria: null }),
      activo({ id: 'r', codigo: 'ROD-0001', clase: 'rodado', nombre: 'Hilux', patente: 'NMN898' }),
    ],
    movimientos: [], incidencias: [], nombres: {},
  })
}

test('la URL manda; lo que no se reconoce cae al valor por defecto', () => {
  const f = filtrosDeURL({ clase: 'cualquiera', estado: 'baja', q: '  amol ', filtro: 'nada' })
  assert.deepEqual(f, { clase: 'herramienta', estado: 'baja', ubicacion: null, categoria: null, q: 'amol', especial: null })
  assert.equal(queryDe(filtrosDeURL({})), '')
  assert.equal(queryDe({ ...filtrosDeURL({}), q: 'amol', activo: 'HER-0001' }), '?q=amol&activo=HER-0001')
})

test('buscar encuentra por nombre, código y por el lugar rotulado desde el índice de obras', () => {
  const p = parque()
  const f = filtrosDeURL({})
  assert.deepEqual(filtrar(p, { ...f, q: 'amolad' }).map((a) => a.id), ['1', '2'], '«Todos» es el inventario vivo: la baja no aparece')
  assert.deepEqual(filtrar(p, { ...f, q: 'amolad', estado: 'baja' }).map((a) => a.id), ['3'], 'la baja se ve en su solapa')
  assert.deepEqual(filtrar(p, { ...f, q: 'her 4' }).map((a) => a.id), ['4'], '«her 4» es HER-0004')
  assert.deepEqual(filtrar(p, { ...f, q: 'HER-0004' }).map((a) => a.id), ['4'])
  assert.deepEqual(filtrar(p, { ...f, q: 'arcor' }).map((a) => a.id), ['1'])
})

test('filtros de clase, ubicación, categoría y especiales', () => {
  const p = parque()
  const f = filtrosDeURL({})
  assert.deepEqual(filtrar(p, { ...f, clase: 'rodado' }).map((a) => a.id), ['r'])
  assert.deepEqual(filtrar(p, { ...f, ubicacion: 'sin' }).map((a) => a.id), ['4'])
  assert.deepEqual(filtrar(p, { ...f, ubicacion: 'obras' }).map((a) => a.id), ['1'])
  assert.deepEqual(filtrar(p, { ...f, categoria: 'sin' }).map((a) => a.id), ['4'])
  assert.deepEqual(filtrar(p, { ...f, especial: 'asumido' }).map((a) => a.id), ['2'])
  assert.deepEqual(filtrar(p, { ...f, especial: 'repetidos' }).map((a) => a.id), [])
})

test('cada solapa de estado cuenta sobre lo que queda con los otros filtros', () => {
  const p = parque()
  const c = cuentaPorEstado(candidatos(p, { ...filtrosDeURL({}), q: 'amol' }))
  assert.equal(c.todos, 2, 'la baja no cuenta en «Todos»')
  assert.equal(c.requiere_mantenimiento, 1)
  assert.equal(c.baja, 1)
  assert.equal(c.fuera_servicio, 0)
})

test('categorías: las cargadas, y si hay alguna sin cargar', () => {
  assert.deepEqual(categorias(parque().activos), { valores: ['Eléctrica'], haySin: true })
})

test('la tabla que no existe es «falta la migración», no «no hay herramientas»', () => {
  assert.equal(faltaMigracion({ code: 'PGRST205', message: "Could not find the table 'public.activo' in the schema cache" }), true)
  assert.equal(faltaMigracion({ code: '42P01', message: 'relation "public.activo" does not exist' }), true)
  assert.equal(faltaMigracion({ code: 'PGRST202', message: 'Could not find the function public.mover_activos' }), true)
  assert.equal(faltaMigracion({ code: '42501', message: 'permission denied for table activo' }), false)
  assert.equal(faltaMigracion(null), false)
})

test('el buscador sugiere mientras se tipea: código exacto primero, bajas nunca', () => {
  const p = parque()
  assert.deepEqual(sugerencias(p, 'amol').map((a) => a.id), ['1', '2'], 'la Stanley está dada de baja')
  assert.deepEqual(sugerencias(p, 'her 4').map((a) => a.id), ['4'], 'el código tipeado a medias encuentra el activo')
  assert.deepEqual(sugerencias(p, 'arcor').map((a) => a.id), ['1'], 'también por dónde está')
  assert.deepEqual(sugerencias(p, 'nmn').map((a) => a.id), ['r'], 'y por patente')
  assert.deepEqual(sugerencias(p, '   '), [])
  assert.equal(sugerencias(p, 'a', 2).length, 2)
})
