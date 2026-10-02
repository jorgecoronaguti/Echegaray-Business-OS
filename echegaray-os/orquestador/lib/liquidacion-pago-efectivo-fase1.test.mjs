// LA FASE 1 DEL EFECTIVO DE LIQUIDACIÓN, LO QUE NO NECESITA BASE (02/10/2026): que el Sheet NO cambie, que los cargadores
// no fechen en silencio y que la migración corra con su candado corto. El comportamiento en la base está en
// liquidacion-pago-efectivo.pgreprod.test.mjs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MOVIMIENTOS_FUERA_DE_LA_REPLICA } from '../scripts/efectivo-raw-pestana.mjs'

const AQUI = import.meta.dirname
const leer = (...r) => readFileSync(join(AQUI, ...r), 'utf8')
const MIGRACION = leer('..', '..', 'supabase', 'migrations', '20261002T1800_liquidacion_pago_efectivo_baja_la_caja.sql')

test('_EFECTIVO_RAW excluye «Pago de jornales»: el Sheet no cambia hasta que la fase 2 lo cablee', () => {
  assert.deepEqual(MOVIMIENTOS_FUERA_DE_LA_REPLICA, ['Pago de jornales'])
  const f = leer('..', 'scripts', 'efectivo-raw-pestana.mjs')
  assert.match(f, /from public\.efectivo_movimiento_caja\s+where movimiento <> ALL\(\$1::text\[\]\)/)
  assert.match(f, /\[MOVIMIENTOS_FUERA_DE_LA_REPLICA\]/)
  assert.match(f, /FASE 2 lo cablea/)
})

test('los cargadores que escriben pagado_efectivo mandan la fecha explícita (fin de la quincena cerrada), no hoy', () => {
  const jornales = leer('..', 'scripts', 'liquidacion-cargar-jornales.mjs')
  const medio = leer('..', 'scripts', 'liquidacion-medio-de-pago.mjs')
  const re = /update public\.liquidacion_linea set pagado_banco[^`']*/g
  const updates = [...jornales.matchAll(re), ...medio.matchAll(re)]
  assert.equal(updates.length, 3, 'tres escrituras de pagado_efectivo en los cargadores')
  for (const u of updates) assert.match(u[0], /fecha_pago_efectivo = \$\d::date/, u[0].slice(0, 90))
  assert.match(jornales, /\[id, l\.persona_id, pagado\.pagado_banco, pagado\.pagado_efectivo, q\.hasta\]/)
  assert.match(jornales, /x\.b\.pagado_efectivo \?\? 0, x\.b\.hasta\]/)
  assert.match(medio, /c\.despues\.pagado_efectivo, hoy, q\.hasta\]/)
})

test('la migración corre dentro de la transacción del aplicador con lock_timeout corto, sin begin/commit propios', () => {
  const sinComentarios = MIGRACION.replace(/--.*$/gm, '')
  // La misma limpieza que `transaccionaSola` del aplicador: el BEGIN…END de un cuerpo plpgsql no es una transacción.
  const sinCuerpos = sinComentarios.replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/g, ' ')
  assert.doesNotMatch(sinCuerpos, /(^|;|\s)(begin|commit|end)\s*;/i)
  const sentencias = sinComentarios.split(';').map((x) => x.trim()).filter(Boolean)
  assert.equal(sentencias[0], "set local lock_timeout = '5s'", 'el candado corto es lo PRIMERO que corre')
  const runner = leer('..', 'scripts', 'aplicar-migracion.mjs')
  assert.ok(runner.indexOf("query('begin')") > 0 && runner.indexOf("query('begin')") < runner.indexOf('query(sql)'))
})

test('el conteo de la caja tiene guarda dentro de la función security definer', () => {
  const i = MIGRACION.indexOf('create or replace function public.efectivo_ultimo_conteo()')
  const cuerpo = MIGRACION.slice(i, MIGRACION.indexOf('$f$;', i + 200))
  assert.match(cuerpo, /public\.liquida_sueldos\(\)/)
  assert.match(MIGRACION, /revoke all on function public\.efectivo_ultimo_conteo\(\) from public, anon, service_role;/)
})
