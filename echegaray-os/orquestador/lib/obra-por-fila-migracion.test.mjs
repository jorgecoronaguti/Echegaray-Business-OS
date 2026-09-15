// LA MIGRACIÓN 20260915T0700 CONTRA EL CÓDIGO QUE LA CONSUME — lo que un auditor rechazó, fijado en texto.
//
// No reemplaza el ensayo en transacción (`aplicar-migracion.mjs` sin --aplicar): éste corre sin base y
// se pone rojo si alguien saca el bloqueo, el grant o la validación del texto, o si los rótulos fijos
// del SQL dejan de ser los de `obra-destino.mjs` (dos definiciones del desplegable = dos verdades).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIJOS, rotuloDeObra, rotuloSinObra } from './obra-destino.mjs'

const SQL = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20260915T0700_obra_por_fila.sql'), 'utf8')
const cuerpo = (fn) => {
  const i = SQL.indexOf(`create or replace function public.${fn}(`)
  assert.ok(i >= 0, `falta la función ${fn}`)
  return SQL.slice(i, SQL.indexOf('$$;', SQL.indexOf('$$', i) + 2))
}

test('compra_obra_asignar bloquea la fila de compra_sheet con FOR UPDATE antes de comparar `esperado`', () => {
  const f = cuerpo('compra_obra_asignar')
  const select = /select[^;]*from public\.compra_sheet[^;]*;/i.exec(f)?.[0] ?? ''
  assert.match(select, /\bfor update\b/i)
  assert.ok(f.indexOf(select) < f.indexOf('p_esperado)'), 'el bloqueo va antes del control de esperado')
})

test('compra_obra_asignar valida el TEXTO con obra_celda_resolver y corta antes de guardar o encolar', () => {
  const f = cuerpo('compra_obra_asignar')
  const valida = f.indexOf('obra_celda_resolver(v_valor)')
  assert.ok(valida > 0, 'no llama al resolver')
  assert.match(f.slice(valida), /if v_res \? 'error' then\s+return jsonb_build_object\('ok', false/)
  assert.ok(valida < f.indexOf('update public.compra_sheet') && valida < f.indexOf('insert into public.compra_obra_cambio'))
  assert.doesNotMatch(f, /~\*\s*'\^\\s\*(ES-ADM|ES-TAL|sin)/i, 'volvió la validación por prefijo')
})

test('el resolver compara el rótulo EXACTO: código vivo OB- con su nombre, fijos y «Sin obra – » de la app', () => {
  const f = cuerpo('obra_celda_resolver')
  assert.match(f, /fusionada_en is null/)
  assert.match(f, /v_valor is distinct from v_rotulo/)
  assert.match(f, /v_obra\.codigo \|\| ' · ' \|\| v_obra\.nombre/, 'el separador de rotuloDeObra')
  assert.equal(rotuloDeObra({ codigo: 'OB-1', nombre: 'N' }), 'OB-1 · N')
  for (const x of FIJOS) assert.ok(f.includes(`v_valor = '${rotuloDeObra({ codigo: x.codigo, nombre: x.nombre })}'`), x.codigo)
  assert.ok(f.includes(`'${rotuloSinObra('')}`), 'el prefijo de «Sin obra – »')
  assert.match(f, /\) > 1 then/, 'más de una obra viva, como el desplegable')
})

test('cobranzas: las columnas nuevas nacen con SELECT para authenticated (como compra_sheet y costos_obra), sin tocar policies', () => {
  assert.match(SQL, /grant select \(destino, obra_id, obra_celda\) on public\.cobranzas to authenticated;/)
  assert.doesNotMatch(SQL, /policy [^;]* on public\.cobranzas/i)
})
