// LO QUE SOSTIENE EL RECIBO DE PAGO A UN TERCERO EN LA BASE, leído de la migración (no hay base en el test).
// Cada caso es un defecto concreto si se invierte: un hueco en la serie RP, un recibo escrito por la API sin
// portero, uno reescrito o borrado después de firmado, un doble clic que gasta dos números.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('../../../../', import.meta.url).pathname
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '')
const SQL = sinComentarios(readFileSync(`${RAIZ}supabase/migrations/20261002T2300_recibo_pago_efectivo_a_terceros.sql`, 'utf8'))

const cuerpo = (fn: string): string => {
  const i = SQL.indexOf(`create or replace function public.${fn}(`)
  assert.ok(i >= 0, `no está ${fn}`)
  return SQL.slice(i, SQL.indexOf('end $$', i))
}

test('sin begin/commit propios y con recarga del esquema de PostgREST', () => {
  assert.doesNotMatch(SQL, /^\s*(begin|commit)\s*;/im)
  assert.match(SQL, /notify pgrst, 'reload schema';\s*$/)
})

test('la API sólo lee, y sólo Dirección/Administración: nada de insert/update/delete para authenticated', () => {
  assert.match(SQL, /alter table public\.recibo_pago_efectivo enable row level security;/)
  assert.match(SQL, /revoke all on public\.recibo_pago_efectivo from anon, public, authenticated;/)
  assert.match(SQL, /grant select on public\.recibo_pago_efectivo to authenticated;/)
  assert.doesNotMatch(SQL, /grant (insert|update|delete|all)[^;]*recibo_pago_efectivo\b(?!\()/i)
  assert.match(SQL, /create policy recibo_pago_efectivo_select on public\.recibo_pago_efectivo\s*for select to authenticated using \(\(select public\.ve_economia\(\)\)\)/)
})

for (const fn of ['emitir_recibo_pago_efectivo', 'anular_recibo_pago_efectivo']) {
  test(`${fn}: security definer con search_path fijo, y lo primero es el portero de Efectivo`, () => {
    const c = cuerpo(fn)
    assert.match(c, /security definer set search_path = public/)
    const portero = c.indexOf('v_usr := public._efectivo_exigir_administracion();')
    assert.ok(portero > 0 && portero < c.indexOf('select * into'), 'el portero no va antes de leer o escribir')
    assert.match(SQL, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`))
  })
}

test('emitir: el número RP se toma DESPUÉS de todas las validaciones y antes del insert (sin huecos)', () => {
  const c = cuerpo('emitir_recibo_pago_efectivo')
  const toma = c.indexOf("v_numero := public.tomar_numero_de_recibo('RP',")
  assert.ok(toma > 0)
  assert.ok(c.lastIndexOf('raise exception') < toma, 'hay una validación después de tomar el número')
  assert.ok(c.indexOf('insert into public.recibo_pago_efectivo') > toma)
  assert.match(c, /v_numero, public\.codigo_de_recibo\('RP', v_numero\)\)/)
})

test('emitir: la misma emisión que llega dos veces devuelve la que hay sin tomar otro número', () => {
  const c = cuerpo('emitir_recibo_pago_efectivo')
  const ya = c.indexOf('if v_ya.id is not null then return v_ya.codigo; end if;')
  assert.ok(ya > 0 && ya < c.indexOf('tomar_numero_de_recibo'))
})

test('lo emitido no se reescribe ni se borra; anular es una vez, con motivo, y anula el asiento del libro', () => {
  const t = cuerpo('_recibo_pago_efectivo_inmutable')
  assert.match(t, /if tg_op = 'DELETE' then\s*raise exception/)
  assert.match(t, /old\.anulado_en is not null/)
  for (const col of ['serie_numero', 'codigo', 'importe', 'a_nombre_de', 'concepto', 'fecha', 'documento']) {
    assert.match(t, new RegExp(`new\\.${col}\\b`), `${col} se podría reescribir`)
  }
  assert.match(SQL, /create trigger recibo_pago_efectivo_inmutable before update or delete on public\.recibo_pago_efectivo/)
  assert.match(SQL, /before truncate on public\.recibo_pago_efectivo/)
  const a = cuerpo('anular_recibo_pago_efectivo')
  assert.match(a, /length\(v_motivo\) < 5/)
  assert.match(a, /for update/)
  assert.match(a, /perform public\.anular_numero_de_recibo\('RP', r\.serie_numero,/)
  assert.match(SQL, /constraint recibo_pago_efectivo_codigo_de_su_numero check \(codigo = public\.codigo_de_recibo\('RP', serie_numero\)\)/)
  assert.match(SQL, /create unique index if not exists recibo_pago_efectivo_serie_numero_key/)
})
