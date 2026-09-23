import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CANALES, TIPOS, debeAvisar, debeAvisarA, esCanal, esTipo, preferenciasDe } from './notificaciones.mjs'

test('sin fila se avisa; con fila apagada no; con fila prendida sí; tipo desconocido se avisa', () => {
  assert.equal(debeAvisar([], 'efectivo_firma', 'mattermost_dm'), true)
  assert.equal(debeAvisar([{ tipo: 'efectivo_firma', canal: 'mattermost_dm', activo: false }], 'efectivo_firma', 'mattermost_dm'), false)
  assert.equal(debeAvisar([{ tipo: 'efectivo_firma', canal: 'mattermost_dm', activo: true }], 'efectivo_firma', 'mattermost_dm'), true)
  // Apagar el DM no apaga el correo, ni otro tipo.
  assert.equal(debeAvisar([{ tipo: 'efectivo_firma', canal: 'mattermost_dm', activo: false }], 'efectivo_firma', 'correo'), true)
  assert.equal(debeAvisar([{ tipo: 'efectivo_firma', canal: 'mattermost_dm', activo: false }], 'efectivo_anulacion', 'mattermost_dm'), true)
  assert.equal(debeAvisar(null, 'lo_que_sea', 'mattermost_dm'), true)
})

test('debeAvisarA lee la tabla del usuario y sin uid avisa; sin migración (42P01) avisa', async () => {
  const port = { query: async (_sql, [uid]) => ({ rows: uid === 'u1' ? [{ tipo: 'sistema', canal: 'mattermost_dm', activo: false }] : [] }) }
  assert.equal(await debeAvisarA(port, 'u1', 'sistema', 'mattermost_dm'), false)
  assert.equal(await debeAvisarA(port, 'u2', 'sistema', 'mattermost_dm'), true)
  assert.equal(await debeAvisarA(port, null, 'sistema', 'mattermost_dm'), true)
  const sinTabla = { query: async () => { throw Object.assign(new Error('relation does not exist'), { code: '42P01' }) } }
  assert.deepEqual(await preferenciasDe(sinTabla, 'u1'), [])
})

test('el catálogo coincide con el CHECK de la migración y con el espejo de la pantalla', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260923T2610_preferencias_de_aviso_por_usuario.sql', import.meta.url), 'utf8')
  for (const t of TIPOS) assert.ok(sql.includes(`'${t.clave}'`), `${t.clave} no está en el CHECK de tipo`)
  for (const c of CANALES) assert.ok(sql.includes(`'${c.clave}'`), `${c.clave} no está en el CHECK de canal`)
  const ts = readFileSync(new URL('../../src/features/mi-cuenta/services/notificaciones.ts', import.meta.url), 'utf8')
  for (const t of TIPOS) assert.ok(ts.includes(`'${t.clave}'`), `${t.clave} no está en la pantalla`)
  assert.ok(esTipo('sistema') && !esTipo('otro') && esCanal('correo') && !esCanal('sms'))
})
