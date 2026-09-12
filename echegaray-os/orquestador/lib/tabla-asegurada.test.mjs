// EL DEFECTO QUE ATRAPAN ESTOS TESTS: que una lectura vuelva a correr DDL sobre una tabla que ya
// está. No es un test de «se creó la tabla» —eso ya andaba—: es un test de CUÁNTAS sentencias de DDL
// salieron, porque el costo medido no estaba en el DDL sino en la recarga de esquema que despierta.
//
// Si se revierte el cambio (volver a `create table if not exists` en cada lectura), el primer test se
// pone rojo: `ddl` deja de ser 0.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asegurarRelacion, faltaAlgo, olvidarVerificaciones } from './tabla-asegurada.mjs'

/** Una base falsa que anota qué se le preguntó y distingue catálogo de DDL. */
function baseFalsa(columnas) {
  const sentencias = []
  const query = async (sql, params) => {
    sentencias.push(sql.trim())
    if (sql.includes('pg_attribute')) {
      assert.equal(params?.length, 1, 'la verificación va parametrizada, nunca interpolada')
      return { rows: columnas.map((col) => ({ col })) }
    }
    return { rows: [] }
  }
  const esDdl = (s) => /^\s*(create|alter|drop|comment|grant|revoke|do )/i.test(s)
  return {
    query,
    sentencias,
    get ddl() { return sentencias.filter(esDdl) },
    get catalogo() { return sentencias.filter((s) => s.includes('pg_attribute')) },
  }
}

const COLUMNAS = ['file_id', 'pestana', 'rotulo']

test('la tabla ya está: NI UNA sentencia de DDL sale a la base', async () => {
  olvidarVerificaciones()
  const b = baseFalsa(COLUMNAS)
  let creo = 0
  await asegurarRelacion({
    query: b.query, relacion: 'public.t_ya_esta', columnas: COLUMNAS,
    crear: async () => { creo++; await b.query('create table if not exists public.t_ya_esta ()') },
  })
  assert.equal(creo, 0, 'no debió intentar crear nada')
  assert.deepEqual(b.ddl, [], `salió DDL y no debía: ${b.ddl.join(' | ')}`)
  assert.equal(b.catalogo.length, 1, 'una sola pregunta al catálogo')
})

test('falta una columna: el DDL SÍ corre (la garantía vieja no se perdió)', async () => {
  olvidarVerificaciones()
  const b = baseFalsa(['file_id', 'pestana'])
  let creo = 0
  await asegurarRelacion({
    query: b.query, relacion: 'public.t_vieja', columnas: COLUMNAS,
    crear: async () => { creo++; await b.query('alter table public.t_vieja add column if not exists rotulo text') },
  })
  assert.equal(creo, 1)
  assert.equal(b.ddl.length, 1)
})

test('la relación no existe: el DDL SÍ corre', async () => {
  olvidarVerificaciones()
  const b = baseFalsa([])
  let creo = 0
  await asegurarRelacion({
    query: b.query, relacion: 'public.t_nueva', columnas: COLUMNAS,
    crear: async () => { creo++; await b.query('create table public.t_nueva ()') },
  })
  assert.equal(creo, 1)
  assert.equal(await faltaAlgo(b.query, 'public.t_nueva', COLUMNAS), 'no existe')
})

test('veintidós pestañas de una corrida preguntan UNA vez, no veintidós', async () => {
  olvidarVerificaciones()
  const b = baseFalsa(COLUMNAS)
  await Promise.all(Array.from({ length: 22 }, () => asegurarRelacion({
    query: b.query, relacion: 'public.t_memo', columnas: COLUMNAS, crear: async () => {},
  })))
  // Era exactamente este número el que el pipeline del Flujo de Caja multiplicaba: ~22 pestañas por
  // corrida × 3 sentencias de DDL = las 408 llamadas de 27 horas.
  assert.equal(b.catalogo.length, 1, `preguntó ${b.catalogo.length} veces al catálogo`)
})

test('un error de conexión NO se memoiza: la lectura siguiente vuelve a preguntar', async () => {
  olvidarVerificaciones()
  let intentos = 0
  const query = async () => { intentos++; throw new Error('connection terminated unexpectedly') }
  const uno = asegurarRelacion({ query, relacion: 'public.t_corte', columnas: COLUMNAS, crear: async () => {} })
  await assert.rejects(uno, /connection terminated/)
  await assert.rejects(
    asegurarRelacion({ query, relacion: 'public.t_corte', columnas: COLUMNAS, crear: async () => {} }),
    /connection terminated/,
  )
  assert.equal(intentos, 2, 'memoizó el rechazo y dejó el proceso sin tabla para siempre')
})
