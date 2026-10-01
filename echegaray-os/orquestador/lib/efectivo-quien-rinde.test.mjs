// Quién rinde efectivo (dueño, 01/10/2026) y la migración que lo exige en `rendir_adelanto_de_sueldo`.
// La migración NO se ensaya acá (la aplica otra persona): se lee el archivo y se comprueba que trae los chequeos,
// el lock_timeout, y que no toca firma ni grants.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rinde, rindePorOtro, ROLES_QUE_RINDEN } from './efectivo-quien-rinde.mjs'

test('rinden jefe de obra, Dirección y Administración; un campo, un rol vacío o desconocido, no', () => {
  for (const r of ['jefe_obra', 'direccion', 'administracion', 'JEFE_OBRA ', { rol: 'direccion' }]) assert.equal(rinde(r), true, JSON.stringify(r))
  for (const r of ['campo', '', null, undefined, 'admin', 'jefe', { rol: null }, {}]) assert.equal(rinde(r), false, JSON.stringify(r))
  assert.equal(rindePorOtro('jefe_obra'), false); assert.equal(rindePorOtro('administracion'), true)
  assert.deepEqual([...ROLES_QUE_RINDEN].sort(), ['administracion', 'direccion', 'jefe_obra'])
})

const MIG = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations/20261001T0400_efectivo_adelanto_exige_nivel.sql')
const sinComentarios = (s) => s.replace(/^[ \t]*--.*$/gm, '')

test('la migración 20261001T0400 exige nivel en rendir_adelanto_de_sueldo sin cambiar firma ni grants', () => {
  const sql = sinComentarios(readFileSync(MIG, 'utf8'))
  assert.match(sql, /^\s*set local lock_timeout = '5s';/m)
  assert.match(sql, /create or replace function public\.rendir_adelanto_de_sueldo\(p_entrega uuid, p_persona uuid, p_fecha date, p_importe numeric, p_expresion text, p_antes numeric, p_formula text, p_valor numeric, p_clave text, p_post text, p_imputada_por uuid\)\s+RETURNS jsonb/)
  assert.match(sql, /SECURITY DEFINER/); assert.match(sql, /SET search_path TO 'public'/)
  assert.doesNotMatch(sql, /\b(grant|revoke|drop)\b/i, 'no toca privilegios ni borra nada')
  assert.doesNotMatch(sql, /\bbegin;|\bcommit;/i, 'los pone aplicar-migracion.mjs')
  // El nivel ANTES de leer nada (antes del «ya estaba»), y el jefe sólo de SU entrega.
  const nivel = sql.indexOf("pf.rol in ('jefe_obra', 'direccion', 'administracion')")
  assert.ok(nivel > 0 && nivel < sql.indexOf('ya_estaba'), 'el nivel se exige antes del «ya estaba»')
  assert.match(sql, /coalesce\(pf\.rol = 'jefe_obra', false\) and coalesce\(pf\.persona_id = e\.persona_id, false\)/)
  assert.ok(sql.indexOf('pf.persona_id = e.persona_id') > sql.indexOf('for update'), 'la entrega se mira ya bloqueada')
  assert.equal((sql.match(/errcode = '42501'/g) ?? []).length, 3)
})
