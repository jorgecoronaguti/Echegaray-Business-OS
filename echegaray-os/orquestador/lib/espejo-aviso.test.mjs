// El aviso del espejo: cuándo se manda y que su falla no rompa el sync. Con una base de mentira; la
// comparación SQL de verdad se prueba en `espejo-aviso.pg.test.mjs`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { avisarSiCambio, lineaDeAviso, planDeAviso, sqlDelConteo, tablaDeFoto } from './espejo-aviso.mjs'

/** Una base que responde el conteo pedido y anota cada sentencia. */
function baseFalsa(conteo, { sendFalla = false } = {}) {
  const sentencias = []
  return {
    sentencias,
    async query(sql, params) {
      sentencias.push({ sql, params })
      if (sql.includes('as altas')) return { rows: [conteo] }
      if (sql.includes('realtime.send') && sendFalla) throw new Error('function realtime.send does not exist')
      return { rows: [] }
    },
  }
}
const envios = (db) => db.sentencias.filter((s) => s.sql.includes('realtime.send'))

test('una recarga idéntica NO avisa', async () => {
  const db = baseFalsa({ altas: 0, bajas: 0, cambios: 0 })
  const r = await avisarSiCambio(db, { tabla: 'public.compra_sheet', clave: 'fila' })
  assert.equal(r.avisar, false)
  assert.equal(envios(db).length, 0)
  assert.match(lineaDeAviso(r), /no cambió/)
})

test('un importe cambiado SÍ avisa, con la tabla y sin datos de fila', async () => {
  const db = baseFalsa({ altas: 0, bajas: 0, cambios: 1 })
  const r = await avisarSiCambio(db, { tabla: 'public.compra_sheet', clave: 'fila' })
  assert.equal(r.enviado, true)
  const [envio] = envios(db)
  assert.deepEqual(JSON.parse(envio.params[0]), { tabla: 'compra_sheet', op: 'SYNC' })
  assert.deepEqual(envio.params.slice(1), ['cambio', 'os:cambios'])
})

test('altas o bajas sin cambios también avisan', () => {
  assert.equal(planDeAviso({ altas: 1, bajas: 0, cambios: 0 }, 't').avisar, true)
  assert.equal(planDeAviso({ altas: 0, bajas: 2, cambios: 0 }, 't').avisar, true)
})

test('si Realtime falla, el sync sigue: se vuelve al savepoint y no se tira', async () => {
  const db = baseFalsa({ altas: 0, bajas: 0, cambios: 3 }, { sendFalla: true })
  const r = await avisarSiCambio(db, { tabla: 'public.compra_sheet', clave: 'fila' })
  assert.equal(r.enviado, false)
  assert.ok(db.sentencias.some((s) => s.sql === 'rollback to savepoint espejo_aviso'))
  assert.match(lineaDeAviso(r), /NO se pudo enviar/)
})

test('un conteo ilegible no se interpreta como «sin cambios»', () => {
  assert.throws(() => planDeAviso({ altas: 'x', bajas: 0, cambios: 0 }, 't'), /ilegible/)
})

test('el SQL ignora los sellos y no acepta nombres inyectables', () => {
  const sql = sqlDelConteo({ antes: tablaDeFoto('public.compra_sheet'), despues: 'public.compra_sheet', clave: 'fila' })
  assert.match(sql, /'sincronizado_en'/)
  assert.match(sql, /pg_temp\.compra_sheet_antes/)
  assert.throws(() => sqlDelConteo({ antes: 'a; drop table x', despues: 'b', clave: 'fila' }), /no es un nombre/)
})

test('los sellos se restan de LOS DOS lados de la comparación', () => {
  const sql = sqlDelConteo({ antes: 'pg_temp.a', despues: 'public.compra_sheet', clave: 'fila' })
  assert.equal(sql.match(/to_jsonb\(t\) - array\[/g)?.length, 2, 'un lado sin restar los sellos cuenta cada corrida como cambio')
})
