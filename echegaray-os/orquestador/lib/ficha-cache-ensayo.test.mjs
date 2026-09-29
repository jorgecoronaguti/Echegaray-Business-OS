// La guarda del ensayo es lo único que separa un script que escribe en la base de la base de
// producción: se prueba sin base, con URLs de la forma real (pooler con usuario postgres.<ref>,
// directa db.<ref>.supabase.co, https de la API) y con contraseñas que rompen `new URL`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refDeUrl, motivoParaNegarse, fallasDe } from './ficha-cache-ensayo.mjs'

const PROD = 'abcdefghijklmnopqrst'
const RAMA = 'zyxwvutsrqponmlkjihg'
const pooler = (ref, clave = 'x') => `postgresql://postgres.${ref}:${clave}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
const ENV = { DATABASE_URL: pooler(PROD, 'a/b#c@d'), NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }

test('refDeUrl lee el ref en las tres formas, aun con contraseña que rompe new URL', () => {
  assert.equal(refDeUrl(pooler(PROD)), PROD)
  assert.equal(refDeUrl(pooler(PROD, 'p/q#r@s')), PROD)
  assert.equal(refDeUrl(`postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres`), PROD)
  assert.equal(refDeUrl(`https://${PROD}.supabase.co`), PROD)
  assert.equal(refDeUrl('postgresql://u:p@localhost:54322/postgres'), null)
  assert.equal(refDeUrl(undefined), null)
})

test('se niega con producción en cualquier forma', () => {
  assert.match(motivoParaNegarse(pooler(PROD, 'otra'), ENV), /producción/)
  assert.match(motivoParaNegarse(`postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres`, ENV), /producción/)
  assert.match(motivoParaNegarse(`postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres`, { SUPABASE_URL: `https://${PROD}.supabase.co` }), /producción/)
})

test('falla cerrado: sin URL, sin saber cuál es producción, o sin ref legible', () => {
  assert.ok(motivoParaNegarse('', ENV))
  assert.ok(motivoParaNegarse(pooler(RAMA), {}))
  assert.ok(motivoParaNegarse('postgresql://postgres:x@algo.supabase.co:5432/postgres', ENV))
  assert.ok(motivoParaNegarse(pooler(RAMA), { DATABASE_URL: 'postgresql://u:p@db.interna:5432/postgres' }))
})

test('se niega con otro host igual al de DATABASE_URL aunque no sea Supabase', () => {
  const env = { DATABASE_URL: 'postgresql://u:p@db.interna:5432/postgres' }
  assert.ok(motivoParaNegarse('postgresql://otro:q@db.interna:5432/postgres', env))
})

test('deja pasar una rama por pooler (mismo host que producción) y una base local', () => {
  assert.equal(motivoParaNegarse(pooler(RAMA), ENV), null)
  assert.equal(motivoParaNegarse(`postgresql://postgres:x@db.${RAMA}.supabase.co:5432/postgres`, ENV), null)
  assert.equal(motivoParaNegarse('postgresql://u:p@localhost:54322/postgres', ENV), null)
})

const verde = () => ({
  call: { ms: 900, candadosQueQuedan: 0 },
  sinEspera: { ms: 900, muestras: 10, esperas: [], filas: 2, marcasDelEscritor: 1 },
  lectura: { antes: true, conMarca: false, despues: true, marcasQueQuedan: 0 },
})

test('fallasDe: verde da vacío y cada campo roto da su falla', () => {
  assert.deepEqual(fallasDe(verde()), [])
  const roturas = [
    (r) => { r.call.candadosQueQuedan = 1 },
    (r) => { r.sinEspera.esperas = [{ pid: 1, locktype: 'relation' }] },
    (r) => { r.sinEspera.muestras = 1 },
    (r) => { r.sinEspera.filas = 1 },
    (r) => { r.sinEspera.marcasDelEscritor = 0 },
    (r) => { r.lectura.antes = false },
    (r) => { r.lectura.conMarca = true },
    (r) => { r.lectura.despues = false },
    (r) => { r.lectura.marcasQueQuedan = 1 },
  ]
  for (const romper of roturas) {
    const r = verde()
    romper(r)
    assert.equal(fallasDe(r).length, 1, String(romper))
  }
})
