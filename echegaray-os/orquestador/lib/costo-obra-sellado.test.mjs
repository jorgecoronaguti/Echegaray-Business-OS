// EL SELLADO DEL COSTO POR OBRA — auditoría del 14/09/2026.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//   · UNA MIGRACIÓN QUE ESCRIBE FOTOS AL APLICARSE: la 0800 sellaba 16 quincenas antes de que el dueño
//     confirmara la base de costo. Sólo crea tabla y funciones; el sellado lo corre una persona.
//   · UN RE-SELLADO QUE BORRA SIN RASTRO: la foto anterior pasa a la historia antes del delete.
//   · UNA QUINCENA REABIERTA QUE SIGUE SIRVIENDO LA FOTO VIEJA: si algún grupo no está cerrado, se
//     calcula en vivo y se marca «reabierta».

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(DIR, '../../supabase/migrations/20260915T0800_costo_mo_por_obra.sql'), 'utf8')
const cuerpo = (firma) => {
  const i = SQL.indexOf(`function public.${firma}`)
  assert.ok(i >= 0, `falta ${firma}`)
  return SQL.slice(i, SQL.indexOf('$function$;', i))
}

test('la migración no sella nada al aplicarse: sólo crea tabla y funciones', () => {
  assert.doesNotMatch(SQL, /\bdo \$\$/i, 'volvió un bloque que escribe al aplicar')
  assert.doesNotMatch(SQL, /(select|:=|perform)\s+public\.sellar_costo_obra_quincena\(/i)
})

test('re-sellar guarda la foto anterior en la historia ANTES de borrar', () => {
  const f = cuerpo('sellar_costo_obra_quincena(p_desde date)')
  const historia = f.indexOf('insert into public.costo_obra_quincena_historia')
  const borrado = f.indexOf('delete from public.costo_obra_quincena where')
  assert.ok(historia > 0, 'sellar no guarda la foto anterior')
  assert.ok(borrado > historia, 'borra antes de guardar la historia')
})

test('la historia tiene RLS, la lee quien ve sueldos y ninguna sesión la escribe', () => {
  assert.match(SQL, /create table if not exists public\.costo_obra_quincena_historia/)
  assert.match(SQL, /alter table public\.costo_obra_quincena_historia enable row level security/)
  assert.match(SQL, /revoke insert, update, delete on public\.costo_obra_quincena_historia from authenticated/)
})

test('una quincena REABIERTA no sirve la foto: calcula en vivo y lo marca', () => {
  const f = cuerpo('costo_mo_quincena(p_desde date')
  assert.match(f, /lq\.estado <> 'cerrada'/, 'la foto se sirve aunque la quincena se haya reabierto')
  assert.match(f, /as reabierta/)
})
