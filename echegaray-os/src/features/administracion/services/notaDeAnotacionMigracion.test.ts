// EL CONTRATO DE 20261002T2200: lo que ya costó caídas en este repo, dicho como prueba.
//
// Defectos que atrapa: RLS sin GRANT (la tabla nace muda para `authenticated`), escritura abierta con un grant de
// insert/update, policy sin initplan, función definer sin `search_path` o sin chequeo de permiso adentro, begin/commit
// propios (los pone `aplicar-migracion.mjs`) y PostgREST sin recargar el esquema.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations/20261002T2200_liquidacion_nota_de_anotacion.sql'), 'utf8')
const codigo = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

test('idempotente y sin transacción propia', () => {
  assert.match(codigo, /create table if not exists public\.liquidacion_cambio_nota/)
  assert.match(codigo, /drop policy if exists liquidacion_cambio_nota_lee_admin/)
  assert.match(codigo, /create or replace function public\.liquidacion_nota_guardar/)
  assert.doesNotMatch(codigo, /^\s*(begin|commit)\s*;/im)
})

test('la nota cuelga de (cambio, posición) del log y guarda el importe para no pegarse a otro pago', () => {
  assert.match(codigo, /references public\.liquidacion_cambio\(id\) on delete cascade/)
  assert.match(codigo, /primary key \(cambio_id, posicion\)/)
  assert.match(codigo, /importe\s+numeric/)
  assert.match(codigo, /char_length\(texto\) between 1 and 200/)
})

test('RLS + GRANT de lectura, sin escritura directa para nadie', () => {
  assert.match(codigo, /enable row level security/)
  assert.match(codigo, /using \(\(select public\.liquida_sueldos\(\)\)\)/, 'policy en initplan')
  assert.match(codigo, /revoke all on public\.liquidacion_cambio_nota from anon, authenticated/)
  assert.match(codigo, /grant select on public\.liquidacion_cambio_nota to authenticated/)
  assert.doesNotMatch(codigo, /grant [^;]*(insert|update|delete|all)[^;]* on public\.liquidacion_cambio_nota/i)
})

test('la escritura es una función definer con search_path y el permiso preguntado adentro', () => {
  const f = codigo.slice(codigo.indexOf('create or replace function public.liquidacion_nota_guardar'))
  assert.match(f, /security definer\s+set search_path = public/)
  assert.match(f, /if not coalesce\(public\.liquida_sueldos\(\), false\) then\s+raise exception/)
  assert.match(f, /auth\.uid\(\)/, 'sella quién la escribió')
  assert.match(f, /delete from public\.liquidacion_cambio_nota/, 'vacío borra')
  assert.match(codigo, /revoke all on function public\.liquidacion_nota_guardar\(bigint, integer, numeric, text\) from public, anon/)
  assert.match(codigo, /grant execute on function public\.liquidacion_nota_guardar\(bigint, integer, numeric, text\) to authenticated/)
})

test('termina recargando el esquema de PostgREST', () => {
  assert.match(codigo.trim(), /notify pgrst, 'reload schema';$/)
})
