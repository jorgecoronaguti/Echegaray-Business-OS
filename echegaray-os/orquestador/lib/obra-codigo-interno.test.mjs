// LA MIGRACIÓN DEL CÓDIGO INTERNO DE OBRA, leída como fuente. No escribe en ninguna base: el ensayo
// real (transacción revertida contra producción, 14/09/2026) probó que el UPDATE falla con 23514 y
// que el alta recibe el número siguiente; este test cuida que nadie edite el archivo y pierda eso.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SQL = readFileSync(new URL('../../supabase/migrations/20260915T0600_obra_codigo_interno.sql', import.meta.url), 'utf8')
// Sin comentarios: una regla escrita en un comentario no es una regla que la base cumpla.
const CODIGO = SQL.replace(/--[^\n]*/g, '')

test('codigo: único, obligatorio y con el formato OB-0001 / ZZ-0001', () => {
  assert.match(CODIGO, /add column if not exists codigo text;/)
  assert.match(CODIGO, /alter column codigo set not null;/)
  assert.match(CODIGO, /add constraint obra_canonica_codigo_unico unique \(codigo\)/)
  assert.match(CODIGO, /check \(codigo ~ '\^\(OB\|ZZ\)-\[0-9\]\{4,\}\$'\)/)
  assert.match(CODIGO, /lpad\(n::text, greatest\(4, length\(n::text\)\), '0'\)/, 'lpad solo trunca la obra 10.000')
})

test('numeración: secuencia propia, por orden de creación con el id de desempate, y las de prueba aparte', () => {
  assert.match(CODIGO, /create sequence if not exists public\.obra_codigo_seq;/)
  assert.match(CODIGO, /create sequence if not exists public\.obra_codigo_prueba_seq;/)
  assert.match(CODIGO, /where codigo is null order by created_at, id loop/)
  assert.doesNotMatch(CODIGO, /max\(/, 'max()+1 repite números con dos altas a la vez')
  const [, id, nombre] = /coalesce\(p_id, ''\) ~\* '([^']+)' or coalesce\(p_nombre, ''\) ~\* '([^']+)'/.exec(CODIGO) ?? []
  assert.ok(id && nombre, 'la marca de prueba está declarada en la función')
  const esPrueba = (i, n) => new RegExp(id, 'i').test(i) || new RegExp(nombre, 'i').test(n)
  // Las marcas REALES de la suite: tests/asistencia-por-obra, obras-alta-y-preparacion, util/obras-e2e y la obra sembrada.
  assert.ok(esPrueba('zz-e2e-asistencia', ''))
  assert.ok(esPrueba('zz-e2e-celda00-0000-4000-8000-000000', 'ZZ-E2E obra de la celda'))
  assert.ok(esPrueba('prueba-e2e', '[PRUEBA E2E] Obra de pruebas'))
  assert.ok(esPrueba('obra-x', 'ZZE2E-ALTA Obra'))
  for (const [i, n] of [['messina-bsa', 'ME - BSA'], ['pisos-120m2', 'ME - PISOS 120 M²'], ['galpones', 'Galpones']]) {
    assert.equal(esPrueba(i, n), false, `${i} es una obra real`)
  }
})

test('inmutable: el trigger rechaza cambiar el código y el alta ignora un código escrito a mano', () => {
  assert.match(CODIGO, /create trigger obra_canonica_codigo_guardia\s+before insert or update on public\.obra_canonica/)
  const guardia = /create or replace function public\.obra_codigo_guardia\(\)[\s\S]*?end \$\$;/.exec(CODIGO)?.[0] ?? ''
  assert.match(guardia, /if tg_op = 'INSERT' then\s+new\.codigo := public\.obra_codigo_nuevo\(new\.id, new\.nombre\);/,
    'en el alta el código sale SIEMPRE de la secuencia')
  assert.match(guardia, /if new\.codigo is distinct from old\.codigo then\s+raise exception/)
  assert.doesNotMatch(guardia, /old\.codigo is not null and/, 'no hay ventana para cambiarlo ni siquiera desde null')
})

test('permisos: se lee como el nombre, no lo escribe nadie, y la secuencia no queda a mano de la web', () => {
  assert.match(CODIGO, /grant select \(codigo\) on public\.obra_canonica to authenticated/)
  assert.doesNotMatch(CODIGO, /grant (insert|update)[^;]*codigo/)
  assert.match(CODIGO, /revoke all on function public\.obra_codigo_nuevo\(text, text\) from public, anon, authenticated;/)
  assert.doesNotMatch(CODIGO, /(enable|disable) row level security|create policy|drop policy/, 'RLS sin cambios')
  assert.match(CODIGO, /set local lock_timeout/, 'DDL en horario del dueño no deja la app en cola')
})
