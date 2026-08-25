// EL DUPLICADO LO IMPIDE LA BASE, NO EL CÓDIGO — probado contra Postgres real.
//
// La comprobación de `identidadOcupadaPor` corre ANTES del insert y por lo tanto no puede impedir
// una carrera: entre que lee y que escribe, otro proceso puede haber creado el mismo CUIT. El bot
// procesa fotos en paralelo, así que la carrera no es hipotética. Lo único que la cierra es el
// índice único de la tabla, y eso es lo que se prueba acá: contra la base viva, no contra un doble.
//
// TODO PASA DENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK. No queda una fila. Sin base, se
// saltea — un verde inventado sería peor que un test que no corrió.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aplicarAltas, planDeAltas, resolverNoMatcheado } from './alta-proveedor.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

// CUIT con DV válido que no existe en el padrón real de la empresa: si se usara uno vivo, el test
// mediría el estado del mundo en vez de la regla.
const CUIT = '30999999995'
const OTRO = '30999999960'

test('el alta automática contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params)
  try {
    await q('begin')
    // Mismo lock que el resto de los pg-tests que escriben tablas calientes: los serializa entre sí
    // y se libera solo con el rollback.
    await q('select pg_advisory_xact_lock(20260822)')

    await t.test('el índice único por CUIT existe y es parcial', async () => {
      const { rows } = await q(
        `select indexdef from pg_indexes where tablename = 'proveedores' and indexname = 'proveedores_cuit_unico'`)
      assert.equal(rows.length, 1, 'sin este índice, dos altas simultáneas dejan dos filas')
      assert.match(rows[0].indexdef, /UNIQUE/)
      assert.match(rows[0].indexdef, /WHERE \(cuit IS NOT NULL\)/i, 'los 14 proveedores sin CUIT tienen que poder convivir')
    })

    await t.test('dos altas del mismo CUIT dejan UNA fila, y la segunda devuelve la que ya estaba', async () => {
      const plan = planDeAltas([resolverNoMatcheado({ nombre: 'QA ALTA UNO 20260825', cuit: CUIT }, {})])
      const a = await aplicarAltas(plan, { query: q })
      assert.equal(a.creados.length, 1)

      // La segunda corrida NO ve al primero (simula la carrera: leyó el maestro antes del insert).
      const plan2 = planDeAltas([resolverNoMatcheado({ nombre: 'QA ALTA DOS 20260825', cuit: CUIT }, {})])
      const b = await aplicarAltas(plan2, { query: q })
      assert.equal(b.creados.length, 0, 'la base rechazó el segundo insert')
      assert.equal(b.yaEstaban[0].id, a.creados[0].id, 'y se devolvió el proveedor que ya existía')

      const { rows } = await q('select count(*)::int n from public.proveedores where cuit = $1', [CUIT])
      assert.equal(rows[0].n, 1, 'una sola fila para un CUIT')
    })

    await t.test('el nombre ocupado por otro CUIT se rechaza, no revienta', async () => {
      const plan = planDeAltas([resolverNoMatcheado({ nombre: 'qa alta uno 20260825', cuit: OTRO }, {})])
      const r = await aplicarAltas(plan, { query: q })
      assert.equal(r.creados.length, 0)
      assert.equal(r.rechazos[0].motivo, 'nombre_ocupado_en_la_base',
        'el índice sobre normalizar_nombre_proveedor(nombre) lo frena aunque cambie la caja')
    })

    await t.test('el alias automático queda colgado del proveedor y se puede auditar', async () => {
      const plan = planDeAltas([
        resolverNoMatcheado({ nombre: 'QA VARIANTE 20260825', cuit: CUIT },
          { proveedores: [{ id: null, nombre: 'QA ALTA UNO 20260825', cuit: CUIT }] }),
      ])
      // El id real sale de la base, no del plan: se relee el proveedor recién creado.
      const { rows } = await q('select id from public.proveedores where cuit = $1', [CUIT])
      plan.alias[0].proveedorId = rows[0].id
      const r = await aplicarAltas(plan, { query: q, comprobante: 'F A 0001-00000001' })
      assert.equal(r.alias.length, 1)
      const { rows: al } = await q(
        'select nombre_norm, proveedor_id, estado, notas from public.proveedor_alias where id = $1', [r.alias[0].id])
      assert.equal(al[0].nombre_norm, 'QA VARIANTE 20260825')
      assert.equal(al[0].proveedor_id, rows[0].id)
      assert.equal(al[0].estado, 'vinculado')
      assert.match(al[0].notas, /^alta automática por CUIT/, 'sin la marca no se puede distinguir de una decisión humana')
    })

    await t.test('un alias que ya existe NO se pisa: la decisión anterior manda', async () => {
      const plan = { altas: [], alias: [{ nombre_norm: 'QA VARIANTE 20260825', nombre_origen: 'otra grafía', cuit: CUIT, proveedorId: null }] }
      const { rows } = await q('select id from public.proveedores where cuit = $1', [CUIT])
      plan.alias[0].proveedorId = rows[0].id
      const r = await aplicarAltas(plan, { query: q })
      assert.equal(r.alias.length, 0)
      assert.equal(r.rechazos[0].motivo, 'el_nombre_ya_estaba_resuelto')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
