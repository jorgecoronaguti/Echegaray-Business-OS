// LAS HORAS DE UNA QUINCENA CERRADA NO SE TOCAN, TAMPOCO SALTEANDO LA APP (auditor, 15/09/2026).
//
// Un jefe de obra hacía UPDATE/DELETE de `registros_hh` del 17/08 (16–31/08 cerrada) por PostgREST. La
// cerradura es `registros_hh_periodo_cerrado` extendido a `liquidacion_quincena`.
//
// MUTACIÓN QUE PONE ESTO ROJO: quitar la consulta a `liquidacion_quincena`, mirar sólo la fecha nueva
// (un DELETE pasaría), perder el SECURITY DEFINER (el jefe no ve el cierre), trabar a auth.uid() null
// (los scripts de service role quedarían frenados), meter una policy, o cambiar el mensaje de la app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mensajeDeQuincenaCerrada } from '../../src/features/administracion/services/quincenaCerrada.ts'

const sql = readFileSync(new URL('../../supabase/migrations/20260915T2130_horas_de_quincena_cerrada_no_se_tocan.sql', import.meta.url), 'utf8')
const codigo = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

test('extiende la función del trigger existente, con SECURITY DEFINER y search_path fijo', () => {
  assert.match(codigo, /CREATE OR REPLACE FUNCTION public\.registros_hh_periodo_cerrado\(\)/)
  assert.match(codigo, /SECURITY DEFINER/)
  assert.match(codigo, /SET search_path TO 'public'/)
  assert.doesNotMatch(codigo, /create policy|alter policy|enable row level security/i, 'nada de RLS')
  assert.doesNotMatch(codigo, /drop trigger|create trigger/i, 'el trigger ya existe (BEFORE INSERT OR DELETE OR UPDATE)')
})

test('mira la quincena cerrada por la fecha nueva Y la vieja: el DELETE y el UPDATE que mueve también', () => {
  assert.match(codigo, /from public\.liquidacion_quincena q\s+where q\.estado = 'cerrada'/)
  assert.match(codigo, /tg_op <> 'DELETE' and new\.fecha between q\.desde and q\.hasta/)
  assert.match(codigo, /tg_op <> 'INSERT' and old\.fecha between q\.desde and q\.hasta/)
  assert.match(codigo, /errcode = '23514'/)
})

test('conserva la regla de periodo_hh y la salida de auth.uid() null ANTES de toda consulta', () => {
  const salida = codigo.indexOf('if auth.uid() is null then\n    return coalesce(new, old);')
  assert.ok(salida > 0, 'sin sesión (service role, jornales-a-registros-hh) no se traba, igual que hoy')
  assert.ok(salida < codigo.indexOf('from public.periodo_hh'))
  assert.ok(salida < codigo.indexOf('from public.liquidacion_quincena'))
  assert.match(codigo, /from public\.periodo_hh p\s+where p\.estado = 'cerrado'/)
})

test('el mensaje es el mismo que la app', () => {
  const plantilla = /raise exception 'La quincena %–% está cerrada: para cambiar horas hay que reabrirla en Liquidación\.',\s+to_char\(v_desde, 'DD\/MM'\), to_char\(v_hasta, 'DD\/MM'\)/
  assert.match(codigo, plantilla)
  assert.equal(
    mensajeDeQuincenaCerrada({ desde: '2026-08-16', hasta: '2026-08-31' }),
    'La quincena 16/08–31/08 está cerrada: para cambiar horas hay que reabrirla en Liquidación.',
  )
})
