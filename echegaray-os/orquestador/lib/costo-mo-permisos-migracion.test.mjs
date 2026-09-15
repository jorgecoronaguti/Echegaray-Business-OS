// EL COSTO DE MANO DE OBRA NO DEPENDE DE QUIÉN LO MIRA NI ABRE DATOS LABORALES (hotfix 15/09/2026).
//
// MUTACIÓN QUE PONE ESTO ROJO: quitar el SECURITY DEFINER o la puerta de `costo_mo_quincena`, devolverle
// EXECUTE a authenticated sobre el cálculo por persona o sobre `persona_para_costo`, o volver a exigir
// `es_administracion()` (JWT) dentro de `persona_para_costo`, que deja el sellado en cero filas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../supabase/migrations/20260915T0855_costo_mo_mismo_para_quien_lo_mire.sql', import.meta.url), 'utf8')
const cuerpo = (nombre) => {
  const i = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nombre}\\(|create or replace function public\\.${nombre}\\(`))
  assert.ok(i >= 0, `falta ${nombre}`)
  const resto = sql.slice(i)
  return resto.slice(0, resto.indexOf('$', resto.indexOf('$', resto.indexOf('AS $') + 4) + 1) + 400)
}

test('costo_mo_quincena: SECURITY DEFINER y la puerta liquida_sueldos/ve_economia en las dos ramas', () => {
  const c = cuerpo('costo_mo_quincena')
  assert.match(c, /STABLE SECURITY DEFINER/)
  assert.equal((sql.match(/\(select public\.liquida_sueldos\(\) or public\.ve_economia\(\)\)/g) ?? []).length, 2)
})

test('el cálculo por persona y persona_para_costo no se ejecutan como authenticated', () => {
  assert.match(sql, /revoke execute on function public\.costo_mo_quincena_calculo\(date, text\[\]\) from public, anon, authenticated;/)
  assert.match(sql, /revoke all on function public\.persona_para_costo\(\) from public, anon, authenticated;/)
  assert.doesNotMatch(sql.slice(sql.lastIndexOf('create or replace function public.persona_para_costo')), /grant execute[^;]*authenticated/)
})

test('persona_para_costo (última definición) no depende de un JWT: el sellado corre como service_role', () => {
  const ultima = sql.slice(sql.lastIndexOf('create or replace function public.persona_para_costo'))
  assert.doesNotMatch(ultima.slice(0, ultima.indexOf('$$;')), /es_administracion/)
})
