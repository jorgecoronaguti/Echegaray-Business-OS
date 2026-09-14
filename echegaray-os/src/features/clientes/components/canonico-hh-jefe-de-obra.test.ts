import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ LAS HORAS DEL JEFE DE OBRA CUENTAN EN SU OBRA — VERIFICADO CONTRA LA MIGRACIÓN ═══
//
// «Maldonado es jefe de obra y tiene 80 h en Quattropani del 01 al 11/09, cargadas en la app.
// ¿Cuentan como horas de la obra? — sí, jefe de esa obra» (dueño, 13/09/2026).
//
// No hay un Postgres local donde ejecutar la vista: la ejecución contra la base real está en
// `orquestador/lib/hh-por-obra.pg.test.mjs`. Acá se prueba el TEXTO que se va a aplicar, sin
// comentarios. LOS DEFECTOS QUE ATRAPA:
//
//  · QUE EL JEFE DEJE DE CONTAR: la rama `jefe_app` de la vista desaparece o pierde el corte de puesto.
//  · QUE UN OBRERO COMÚN DE LA APP EMPIECE A CONTAR: la rama web sin el filtro de jefe.
//  · QUE UN DÍA DE JORNALES SE CUENTE DOS VECES: el `not exists` por persona y fecha.
//  · QUE NAZCA UNA SEGUNDA DEFINICIÓN: alguna de las tres funciones vuelve a filtrar `sheet:jornales`
//    por su cuenta, o el divisor del sueldo lee otra fuente que el dividendo.

const DIR = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(
  join(DIR, '../../../../supabase/migrations/20260913T2300_hh_del_jefe_de_obra_cuenta_en_su_obra.sql'), 'utf8')
  .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

/** El tramo de una sección: de su `CREATE`/`create` al siguiente `$function$;` o `;` de la vista. */
function funcion(nombre: string): string {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nombre}(`)
  assert.ok(i >= 0, `la migración no redefine ${nombre}`)
  return sql.slice(i, sql.indexOf('$function$;', i))
}
// DESDE 20260915T0200 LA VISTA ES OTRA (dueño, 14/09/2026: todas las horas trabajadas cuentan). Las
// funciones siguen siendo las de 20260913T2300; la vista se prueba en la migración que la redefine.
const sqlVista = readFileSync(
  join(DIR, '../../../../supabase/migrations/20260915T0200_hh_de_obra_son_todas_las_horas_trabajadas.sql'), 'utf8')
  .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
const vista = (() => {
  const i = sqlVista.indexOf('create or replace view public.hh_que_cuentan_en_obra')
  assert.ok(i >= 0, 'falta la definición única')
  return sqlVista.slice(i, sqlVista.indexOf(';', i))
})()

test('la vista es security_invoker y conserva sus GRANT: la RLS es la de quien consulta', () => {
  assert.match(vista, /with \(security_invoker = true\)/)
  assert.match(sqlVista, /grant select on public\.hh_que_cuentan_en_obra to authenticated, service_role;/)
  assert.match(sqlVista, /revoke all on public\.hh_que_cuentan_en_obra from public, anon;/)
})

test('las MISMAS columnas, en el mismo orden: create or replace view no admite otras', () => {
  assert.match(vista, /select r\.id, r\.obra_canonica_id, r\.persona_id, r\.fecha, r\.horas, r\.tipo_hora, r\.fuente_legacy,\s+case/)
  assert.match(vista, /end::text as origen\s+from public\.registros_hh r/)
})

test('cuenta TODA fila trabajada de cualquier fuente, y las ausencias sólo de JORNALES', () => {
  assert.match(vista, /where r\.fuente_legacy = 'sheet:jornales'\s+or r\.tipo_hora in \('normal', 'extra_50', 'extra_100'\)/)
  // EL DEFECTO: un filtro por fuente web o por puesto en el WHERE vuelve a dejar horas afuera.
  const where = vista.slice(vista.lastIndexOf('where'))
  assert.doesNotMatch(where, /web:|puesto|not exists/)
  // LEFT join: una fila sin persona también es una hora de la tabla.
  assert.match(vista, /left join public\.personas p on p\.id = r\.persona_id/)
})

test('el origen: jornales, jefe con el corte de esJefeDeObra, y app para el resto', () => {
  assert.match(vista, /when r\.fuente_legacy = 'sheet:jornales' then 'jornales'/)
  assert.match(vista, /when regexp_replace\(lower\(trim\(p\.puesto\)\), '\[\[:space:\]_-\]\+', '_', 'g'\) in \('jefe_de_obra', 'jefe_obra'\)\s+then 'jefe_app'/)
  assert.match(vista, /else 'app'/)
})

test('las tres funciones leen la definición única y ninguna repite el filtro', () => {
  for (const f of ['hh_de_obra_en_vivo', 'costo_de_obras_a_la_fecha', 'pantalla_cliente_en_vivo']) {
    const cuerpo = funcion(f)
    assert.ok(cuerpo.includes('public.hh_que_cuentan_en_obra'), `${f} no lee hh_que_cuentan_en_obra`)
    assert.ok(!cuerpo.includes("'sheet:jornales'"), `${f} volvió a filtrar sheet:jornales por su cuenta`)
  }
})

test('sin_respaldo excluye lo que cuenta, en el desglose y en la ficha', () => {
  const excluye = /and not exists \(select 1 from public\.hh_que_cuentan_en_obra c where c\.id = x\.id\)/
  assert.match(funcion('hh_de_obra_en_vivo'), excluye)
  assert.match(funcion('pantalla_cliente_en_vivo'), excluye)
})

test('el divisor del sueldo mensual sale de la MISMA fuente que las horas que se valorizan', () => {
  const c = funcion('costo_de_obras_a_la_fecha')
  const divisor = c.slice(c.indexOf('horas_del_mes as ('), c.indexOf('materiales as ('))
  assert.match(divisor, /from public\.hh_que_cuentan_en_obra r/)
  const mano = c.slice(c.indexOf('mano_obra as ('))
  assert.match(mano, /from public\.hh_que_cuentan_en_obra r\s+left join lateral/)
})

test('la grilla marca al jefe «cargado en la app», tenue y sin color de advertencia', async () => {
  const src = readFileSync(join(DIR, 'DesgloseHH.tsx'), 'utf8')
  const i = src.indexOf('data-testid="marca-jefe-app"')
  assert.ok(i > src.indexOf('data-testid="fila-persona-hh"'), 'la marca va en la fila de la persona')
  const bloque = src.slice(src.lastIndexOf('{fila.persona.horasApp > 0', i), i + 400)
  assert.match(bloque, /jefe de obra · cargado en la app/)
  assert.match(bloque, /color: V\.tenue/)
  assert.doesNotMatch(bloque, /V\.(warn|error|peligro|alerta)/)
  // Y el dato que la enciende llega de SQL: sin `horas_app` la marca nunca aparecería.
  const { armarDesgloseHH } = await import('../services/desgloseHH.ts')
  const d = armarDesgloseHH({ obra: { obra_id: 'quattropani' }, por_persona: [
    { persona_id: 'm', nombre: 'MALDONADO', hh: 80, horas_app: '80' },
    { persona_id: 'q', nombre: 'QUIROGA', hh: 191, horas_app: null },
  ] })
  assert.deepEqual(d?.porPersona.map((p) => p.horasApp), [80, 0])
})

test('se publica lo del jefe para marcarlo, y lo que no se tocó sigue ahí', () => {
  assert.match(funcion('hh_de_obra_en_vivo'), /'horas_app', t\.horas_app/)
  assert.match(funcion('pantalla_cliente_en_vivo'), /'hh_jefe_app', v\.hh_jefe_app/)
  assert.match(funcion('hh_de_obra_en_vivo'), /when not \(select public\.es_administracion\(\)\) then null::jsonb/)
  assert.match(funcion('hh_de_obra_en_vivo'), /from public\.jornales_bloque_persona bp/)
  assert.match(sql, /delete from public\.ficha_cliente_cache;\s*$/)
})
