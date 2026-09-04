// LA CAPA DE IDENTIDAD CONTRA POSTGRES REAL: lo que un doble no puede probar.
//
// Tres cosas que sólo la base viva contesta: que la resolución QUEDA escrita con el texto original
// intacto, que correrlo de nuevo no escribe nada (idempotencia), y que la traza llega de verdad
// —que es lo que falló el 04/09, cuando el proceso salía antes que el INSERT—.
//
// TODO CORRE DENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK. No queda una fila. Sin base se
// saltea: un verde inventado es peor que un test que no corrió.

import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getPool } from '../db.mjs'
import { resolverLote, claveConsulta } from './identidad-lote.mjs'
import { registrarTraza, drenarTrazas } from './traza.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

// Un padrón inventado: si usara los proveedores reales, el test mediría el estado de la empresa en
// vez de la regla, y cambiaría de color el día que alguien dé de alta un proveedor.
const PADRON = [
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'PROVEEDOR DE PRUEBA UNO', cuit: '30999999995' },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'PROVEEDOR DE PRUEBA DOS', cuit: '30999999960' },
]

test('la resolución queda escrita, con el texto ORIGINAL intacto', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260904)')
    const escrito = 'Proveedor de Prueba Uno  S.R.L.'
    const ejecutar = (sql, params) => c.query(sql, params)
    const { porClave, metricas } = await resolverLote(
      [{ nombre: escrito, cuit: '30-99999999-5' }],
      { entidad: 'proveedor', fuente: 'pg-test-identidad', padron: PADRON, aliases: new Map(),
        usarEmbeddings: false, reusar: false, ejecutar })

    assert.equal(metricas.unicas, 1)
    const r = porClave.get(claveConsulta({ nombre: escrito, cuit: '30-99999999-5' }))
    assert.equal(r.estado, 'auto_resuelto')
    assert.equal(r.metodo, 'strong_id')

    // LO QUE PRUEBA LA ESCRITURA ES EL DATO LEÍDO EN SU DESTINO.
    const f = await c.query(
      'select valor_original, cuit_original, entidad_id, estado, metodo from public.ml_resolucion where id = $1',
      [r.resolucionId])
    assert.equal(f.rows.length, 1)
    assert.equal(f.rows[0].valor_original, escrito, 'el texto se guarda como se escribió, sin normalizar')
    assert.equal(f.rows[0].cuit_original, '30999999995')
    assert.equal(f.rows[0].entidad_id, PADRON[0].id)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test('correrlo de nuevo NO escribe: la resolución vigente se reusa', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260904)')
    const consultas = [{ nombre: 'PROVEEDOR DE PRUEBA DOS', cuit: '30999999960' }]
    const opciones = { entidad: 'proveedor', fuente: 'pg-test-idempotencia', padron: PADRON,
      aliases: new Map(), usarEmbeddings: false, ejecutar: (sql, params) => c.query(sql, params) }

    const a = await resolverLote(consultas, opciones)
    assert.equal(a.metricas.reusadas, 0)
    const n1 = await c.query("select count(*)::int n from public.ml_resolucion where fuente = 'pg-test-idempotencia'")

    const b = await resolverLote(consultas, opciones)
    assert.equal(b.metricas.reusadas, 1, 'la segunda corrida reusa la decisión escrita')
    const n2 = await c.query("select count(*)::int n from public.ml_resolucion where fuente = 'pg-test-idempotencia'")
    assert.equal(n2.rows[0].n, n1.rows[0].n, 'la segunda corrida no agrega ni una fila')
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test('un texto escrito de dos formas guarda DOS filas y calcula UNA vez', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260904)')
    const { metricas } = await resolverLote(
      [{ nombre: 'Proveedor de Prueba Uno S.R.L.', cuit: null },
       { nombre: 'PROVEEDOR DE PRUEBA UNO  SRL', cuit: null }],
      { entidad: 'proveedor', fuente: 'pg-test-memo', padron: PADRON, aliases: new Map(),
        usarEmbeddings: false, reusar: false, ejecutar: (sql, params) => c.query(sql, params) })
    assert.equal(metricas.unicas, 2, 'cada texto original conserva su fila')
    assert.equal(metricas.calculadas, 1, 'la escalera corre una sola vez')
    assert.equal(metricas.memoizadas, 1)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test('la traza LLEGA a Postgres cuando el proceso drena antes de salir', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const ejecutar = (sql, params) => c.query(sql, params)
    const modulo = `pg-test-traza-${randomUUID().slice(0, 8)}`
    registrarTraza({ traceId: randomUUID(), capacidad: 'entidad.resolver', metodo: 'regla',
      ms: 3, confianza: 1, accion: 'aplicar', sensibilidad: 'interno' }, { modulo, ejecutar })
    const drenadas = await drenarTrazas()
    assert.equal(drenadas, 1)
    // LO QUE PRUEBA LA ESCRITURA ES EL DATO LEÍDO EN SU DESTINO, no la promesa que resolvió.
    const f = await c.query('select count(*)::int n from orq.ml_traza where modulo = $1', [modulo])
    assert.equal(f.rows[0].n, 1, 'la fila está en su destino, no en una promesa colgada')
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test('drenar devuelve cuántas trazas esperaba, y drenar dos veces no espera de nuevo', { skip: !hayBase }, async () => {
  // Ésta es la señal con la que un script sabe que ya puede salir. Sin ella, `process.exit()` se
  // lleva los INSERT sin escribir — que es exactamente lo que dejó `orq.ml_traza` en cero el 04/09.
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const ejecutar = (sql, params) => c.query(sql, params)
    const modulo = `pg-test-drenaje-${randomUUID().slice(0, 8)}`
    for (let i = 0; i < 3; i += 1) {
      registrarTraza({ traceId: randomUUID(), capacidad: 'entidad.resolver', metodo: 'regla',
        ms: 1, accion: 'aplicar', sensibilidad: 'interno' }, { modulo, ejecutar })
    }
    assert.equal(await drenarTrazas(), 3)
    assert.equal(await drenarTrazas(), 0)
    const f = await c.query('select count(*)::int n from orq.ml_traza where modulo = $1', [modulo])
    assert.equal(f.rows[0].n, 3)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
