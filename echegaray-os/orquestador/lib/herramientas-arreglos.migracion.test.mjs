// MIGRACIÓN 20261001T0800 (arreglos) — lo que tiene que decir el archivo, leído como texto. No toca la base:
// que la migración sea correcta al aplicarse lo prueba su bloque de consistencia y el ensayo del dueño;
// esto frena lo que se puede romper antes: extender el evento en vez de duplicarlo, no abrir escritura,
// no dejar dos sobrecargas, no escribir en Compras.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20261001T0800_herramientas_arreglos.sql'), 'utf8')
const codigo = sql.replace(/^[ \t]*--.*$/gm, '')

test('es una sola migración idempotente, con lock_timeout y sin begin/commit propios', () => {
  assert.match(codigo, /set local lock_timeout = '5s'/)
  assert.doesNotMatch(codigo, /^\s*(begin|commit)\s*;/im)
  assert.doesNotMatch(codigo, /\bcreate table\b/i, 'extiende activo_evento: una tabla paralela diría dos veces «está en el mecánico»')
  for (const col of ['llevado_por', 'ingreso_taller', 'vuelta_estimada', 'trabajo_hecho', 'repuestos', 'vuelta_en', 'resultado'])
    assert.match(codigo, new RegExp(`add column if not exists ${col}\\b`), `falta la columna ${col}`)
  assert.match(codigo, /drop function if exists public\.registrar_evento_activo/)
  assert.match(codigo, /create or replace function public\.registrar_evento_activo/)
})

test('no abre escritura: sin policy ni grant de escritura, y lo verifica al aplicar', () => {
  assert.doesNotMatch(codigo, /create policy/i)
  assert.doesNotMatch(codigo, /grant\s+(insert|update|delete|all)\b/i)
  assert.match(codigo, /authenticated puede escribir activo_evento directo/)
  // una columna nueva nace sin permiso si el grant es por columna: se prueba columna a columna
  assert.match(codigo, /has_column_privilege\('authenticated'/)
  assert.match(codigo, /has_column_privilege\('anon'/)
})

test('las funciones: security definer con search_path, grant sólo a authenticated, anon sin ejecutar, una firma por función', () => {
  for (const f of ['registrar_evento_activo', 'avanzar_evento_activo']) {
    assert.match(codigo, new RegExp(`revoke all on function public\\.${f}\\(.*\\) from public, anon`), `${f}: falta el revoke`)
    assert.match(codigo, new RegExp(`grant execute on function public\\.${f}\\(.*\\) to authenticated`), `${f}: falta el grant`)
  }
  assert.equal((codigo.match(/security definer set search_path = public/g) ?? []).length, 3, 'las tres funciones con search_path fijo')
  assert.match(codigo, /tiene que quedar UNA firma/)
  assert.match(codigo, /public\._activo_usuario\(\)/, 'mismo criterio de permisos que el resto del módulo: usuario logueado')
})

test('el cierre exige qué se le hizo, no vuelve antes de entrar, y la baja usa la función de siempre', () => {
  assert.match(codigo, /contá qué se le hizo/)
  assert.match(codigo, /no puede haber vuelto antes de entrar al taller/)
  assert.match(codigo, /resultado is null or resultado in \('operativo', 'baja'\)/)
  assert.match(codigo, /dar_de_baja_activo\(.*'descartada'/)
  assert.match(codigo, /es un lote de/, 'un lote no lleva arreglo: el estado es del lote entero')
})

test('no escribe en Compras: el comprobante es texto del arreglo', () => {
  assert.doesNotMatch(codigo, /\b(insert into|update)\s+(public\.)?(compras|pagos|comprobantes)\b/i)
  assert.match(codigo, /compra_ref/)
})
