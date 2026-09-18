// EL CARGADOR CONTRA LA BASE REAL, DENTRO DE UNA TRANSACCIÓN QUE SE DESHACE.
//
// La base falsa del test unitario no lee el SQL: una mutación en el WHERE del DELETE o en el ON CONFLICT
// del UPSERT pasaba igual (auditoría, 18/09/2026). Acá lo que se prueba es lo que Postgres hace con las
// sentencias reales: la UNIQUE por clave, el borrado de la carga vieja de la MISMA fuente y sólo de ésa,
// y la relectura. Fuente de prueba propia: no toca las filas del certificado real, y todo se revierte.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool, closePool } from './db.mjs'
import { escribir, prepararCertificado } from '../scripts/haberes-certificado-cargar.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const CSV = 'nombre_banco;cuil;fecha;importe\nUno;20111111111;2026-01-16;100.50\nDos;20222222222;2026-01-16;200.00\n'
const FUENTE = 'prueba haberes-certificado.pg.test'
const OTRA = 'prueba haberes-certificado.pg.test · otra fuente'

test('el cargador contra Postgres', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params)
  const cuenta = async (fuente) => (await q(
    'select count(*)::int n, coalesce(sum(round(importe*100)),0)::bigint cent, array_agg(clave order by clave) claves from public.haberes_acreditados_banco where fuente=$1',
    [fuente])).rows[0]
  try {
    await q('begin')
    const cert = prepararCertificado(CSV, { fuente: FUENTE, totalCentavos: 30050, filas: 2 })
    const clas = cert.acreditaciones.map((a) => ({ ...a, persona_id: null, clase: 'a_confirmar', periodo_desde: null, periodo_hasta: null, confianza: null, evidencia: 't' }))

    await t.test('una carga vieja de la misma fuente se borra; la de OTRA fuente queda', async () => {
      const ins = `insert into public.haberes_acreditados_banco (cuil, nombre_banco, fecha, importe, clase, evidencia, fuente, clave, certificado_hash)
                   values ($1, 'X', '2026-01-16', 1, 'a_confirmar', 't', $2, $3, 'h')`
      await q(ins, ['20333333333', FUENTE, 'vieja-misma-fuente'])
      await q(ins, ['20333333333', OTRA, 'vieja-otra-fuente'])
      const r = await escribir(c, cert, clas)
      assert.equal(r.borradas, 1)
      const mia = await cuenta(FUENTE)
      assert.equal(mia.n, 2); assert.equal(Number(mia.cent), 30050)
      assert.deepEqual(mia.claves, clas.map((x) => x.clave).sort())
      assert.equal((await cuenta(OTRA)).n, 1, 'el DELETE se llevó filas de otra fuente')
    })

    await t.test('la segunda pasada no duplica: la UNIQUE por clave + ON CONFLICT lo impiden en la base', async () => {
      const r = await escribir(c, cert, clas)
      assert.equal(r.filas, 2); assert.equal(r.borradas, 0)
      assert.equal((await cuenta(FUENTE)).n, 2)
    })

    await t.test('si la base no cierra con el certificado, escribir tira (y la transacción se deshace)', async () => {
      await assert.rejects(() => escribir(c, { ...cert, totalCentavos: 30051 }, clas), /se deshace/)
    })
  } finally {
    await q('rollback').catch(() => {})
    c.release()
    await closePool()
  }
})
