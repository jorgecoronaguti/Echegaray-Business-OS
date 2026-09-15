// LOS JEFES DE OBRA FUERA DE LAS HH DE OBRA — el texto de 20260915T0840 y 0842, sin base.
//
// «Quitar los jefes de obra de la consideración de horas de cualquiera de las horas» (dueño, 14/09/2026 18:10).
// La ejecución contra la base está en `hh-por-obra.pg.test.mjs` (con otro corte escrito a mano) y en el ensayo
// `orquestador/scripts/costo-mo-ensayo-tx.mjs` (también como authenticated, con claims de jefe y de dirección).
// QUÉ DEFECTOS ATRAPA:
//
//  · que la vista, `obra_plan_vs_real` o el `sin_respaldo` de las dos funciones pierdan el corte del jefe;
//  · que «es jefe» vuelva a depender de la RLS de quien consulta (un `join personas` dentro de una vista
//    security_invoker) o que la función deje de ser security definer con search_path vacío;
//  · que la función quede ejecutable por anon, o que el corte no sea el de `esJefeDeObra(puesto)`;
//  · que la vista pierda `security_invoker` o sus GRANT, o cambie las columnas;
//  · que 0842 cambie algo más que el filtro en las definiciones vivas sobre las que se construyó.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const MIG = join(import.meta.dirname, '..', '..', 'supabase', 'migrations')
const sinComentarios = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const m0840 = sinComentarios(readFileSync(join(MIG, '20260915T0840_jefes_de_obra_fuera_de_las_hh_de_obra.sql'), 'utf8'))
const m0842 = readFileSync(join(MIG, '20260915T0842_jefe_de_obra_no_es_sin_respaldo.sql'), 'utf8')
const CORTE = (a) => `regexp_replace(lower(trim(${a}.puesto)), '[[:space:]_-]+', '_', 'g') in ('jefe_de_obra', 'jefe_obra')`
const plano = (s) => s.replace(/\s+/g, ' ')

const tramo = (s, desde, fin = ';') => {
  const i = s.indexOf(desde)
  assert.ok(i >= 0, `falta «${desde}»`)
  return s.slice(i, s.indexOf(fin, i))
}

test('es_jefe_de_obra: security definer, search_path vacío, sólo un booleano, sin anon', () => {
  const f = plano(tramo(m0840, 'create or replace function public.es_jefe_de_obra(', '$function$;'))
  assert.ok(f.includes('returns boolean language sql stable security definer set search_path = \'\''), 'la función no es stable security definer con search_path vacío')
  assert.ok(f.includes(`select coalesce((select ${CORTE('p')} from public.personas p where p.id = p_persona_id), false)`), 'el corte no es el de esJefeDeObra o un NULL no da false')
  assert.match(m0840, /revoke all on function public\.es_jefe_de_obra\(uuid\) from public, anon;/)
  assert.match(m0840, /grant execute on function public\.es_jefe_de_obra\(uuid\) to authenticated, service_role;/)
})

test('la vista excluye al jefe con la función y NO lee personas con la RLS de quien consulta', () => {
  const v = tramo(m0840, 'create or replace view public.hh_que_cuentan_en_obra')
  assert.match(v, /and not public\.es_jefe_de_obra\(r\.persona_id\)$/, 'la vista no excluye al jefe')
  assert.doesNotMatch(v, /personas/, 'un join a personas dentro de una vista security_invoker depende de la RLS de quien consulta')
  // El OR de 0200 va entre paréntesis: sin ellos, el `and not` sólo filtraría la rama de la app.
  assert.match(v, /where \(r\.fuente_legacy = 'sheet:jornales' or r\.tipo_hora in \('normal', 'extra_50', 'extra_100'\)\)\s+and not/)
})

test('la vista conserva columnas, security_invoker y GRANT', () => {
  const v = tramo(m0840, 'create or replace view public.hh_que_cuentan_en_obra')
  assert.match(v, /with \(security_invoker = true\) as\s+select r\.id, r\.obra_canonica_id, r\.persona_id, r\.fecha, r\.horas, r\.tipo_hora, r\.fuente_legacy,\s+case/)
  assert.match(v, /end::text as origen\s+from public\.registros_hh r/)
  assert.match(m0840, /alter view public\.hh_que_cuentan_en_obra set \(security_invoker = true\);/)
  assert.match(m0840, /grant select on public\.hh_que_cuentan_en_obra to authenticated, service_role;/)
})

test('obra_plan_vs_real: hh_real sin jefes por la función, security_invoker y GRANT', () => {
  const v = tramo(m0840, 'create or replace view public.obra_plan_vs_real')
  const hh = v.slice(v.indexOf('WITH hh AS'), v.indexOf('hh_plan AS'))
  assert.ok(hh.includes('AND NOT public.es_jefe_de_obra(r.persona_id)'), 'hh_real sigue sumando al jefe')
  assert.doesNotMatch(hh, /personas/, 'hh_real vuelve a depender de la RLS de personas')
  assert.match(v, /with \(security_invoker = true\)/)
  assert.match(m0840, /grant select on public\.obra_plan_vs_real to authenticated;/)
})

test('0842: el sin_respaldo de las dos funciones excluye al jefe, y es el ÚNICO cambio sobre la definición viva', () => {
  const VIVAS = { hh_de_obra_en_vivo: 'd1c4ce3ea203b3beda0ccb33d245b8cb', pantalla_cliente_en_vivo: 'd30370bccd80554a394c6edc2b12f3d0' }
  for (const [f, md5] of Object.entries(VIVAS)) {
    const i = m0842.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`)
    assert.ok(i >= 0, `0842 no redefine ${f}`)
    const def = m0842.slice(i, m0842.indexOf('$function$;', i) + '$function$'.length)
    const filtro = 'and not exists (select 1 from public.hh_que_cuentan_en_obra c where c.id = x.id) and not public.es_jefe_de_obra(x.persona_id)'
    assert.equal(plano(sinComentarios(def)).split(filtro).length - 1, 1, `${f}: sin_respaldo no excluye al jefe con es_jefe_de_obra`)
    assert.doesNotMatch(sinComentarios(def), /personas pj/, `${f}: el corte vuelve a depender de la RLS de personas`)
    // SIN LA INSERCIÓN, ES BYTE A BYTE LA DEFINICIÓN VIVA sobre la que se construyó (md5 de pg_get_functiondef).
    const original = def
      .replace(/\n *-- EL JEFE DE OBRA NO CUENTA POR DECISIÓN \(20260915T0840\): no es «sin respaldo»\.\n *and not public\.es_jefe_de_obra\(x\.persona_id\)/, '')
      .replace('El jefe de obra tampoco: no cuenta por decisión (20260915T0840).', 'El jefe de obra ya no está acá: cuenta.')
    assert.equal(createHash('md5').update(original + '\n').digest('hex'), md5, `${f}: 0842 cambia algo más que el filtro del jefe`)
    assert.ok(m0842.includes(md5), `${f}: el md5 de la definición viva no está declarado`)
  }
})
