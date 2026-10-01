// LAS GARANTÍAS DEL RECIBO FIRMADO QUE VIVEN EN LA BASE Y EN LA RUTA, leídas del código (no hay base en el test).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('../../../../', import.meta.url).pathname
const leer = (r: string) => readFileSync(`${RAIZ}${r}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(--|\/\/).*$/gm, '')
const SQL = leer('supabase/migrations/20261001T0900_efectivo_recibo_firmado.sql')
const RUTA = leer('src/app/(main)/administracion/compras/recibo-efectivo/[rendicion]/route.ts')

test('la base: sólo firma quien rinde, sólo un gasto manual, y una sola vez', () => {
  const fn = SQL.slice(SQL.indexOf('create or replace function public.firmar_recibo_gasto_manual'))
  assert.match(fn, /_efectivo_actua_por\(e\.persona_id\)/)
  assert.match(fn, /origen is distinct from 'manual'/)
  assert.match(fn, /efectivo_recibo_firma where rendicion_id = p_rendicion[\s\S]{0,120}ya está firmado/)
  // El ensayo de «firmar dos veces» lo corta la PK, y el trigger impide pisar lo firmado.
  assert.match(SQL, /rendicion_id\s+uuid primary key/)
  assert.match(SQL, /before update or delete on public\.efectivo_recibo_firma/)
})

test('la tabla nace con RLS, política de lectura y sin escritura directa', () => {
  assert.match(SQL, /enable row level security/)
  assert.match(SQL, /create policy efectivo_recibo_firma_select/)
  assert.match(SQL, /revoke all on public\.efectivo_recibo_firma from anon, public, authenticated/)
  assert.match(SQL, /grant select on public\.efectivo_recibo_firma to authenticated/)
  assert.doesNotMatch(SQL, /grant (insert|update|delete|all)[^;]*efectivo_recibo_firma/i)
})

test('el PDF sólo se entrega con firma y sale de lo firmado, no de la rendición viva', () => {
  assert.ok(RUTA.indexOf('leerReciboFirmado(') > 0)
  assert.ok(RUTA.indexOf('leerReciboFirmado(') < RUTA.indexOf('pdfDeReciboFirmado('))
  assert.match(RUTA, /if \(!firma\) return noHay\(/)
  assert.doesNotMatch(RUTA, /from\('efectivo_rendicion'\)/)
})
