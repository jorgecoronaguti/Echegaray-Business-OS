import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL DESGLOSE DE HH, VERIFICADO CONTRA EL FUENTE Y LA MIGRACIÓN ═══
//
// «Está mal lo de Quattropani, te dije que consideraras quincenas anteriores desde Sheet JORNALES»
// (dueño, 13/09/2026). LOS TRES DEFECTOS QUE ATRAPA:
//
//  · QUE VUELVA A ABRIR EN LA ÚLTIMA QUINCENA. La grilla mostraba 01/09–10/09 y el inicio real de la
//    obra (17/08) quedaba en un link. Sin `p_desde` la función dibuja la obra entera.
//  · QUE LOS PERÍODOS VUELVAN A SER CALENDARIO (1–15 / 16–fin) en vez de los bloques de JORNALES.
//  · QUE `sin_respaldo` VUELVA AL TITULAR, en advertencia: el dueño leyó que Petina, Rosales y Zogbe
//    trabajaron en Quattropani, y JORNALES los tiene en otras obras.

const DIR = dirname(fileURLToPath(import.meta.url))
const componente = () => readFileSync(join(DIR, 'DesgloseHH.tsx'), 'utf8')
const migracion = () => readFileSync(
  join(DIR, '../../../../supabase/migrations/20260913T2200_desglose_hh_obra_entera_por_bloques.sql'), 'utf8')

/** El SQL sin comentarios: una frase que cita el defecto viejo no puede pasar por el defecto. */
const sqlSinComentarios = () => migracion().split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

test('la función abre en la obra entera: sin p_desde no hay ventana ni recorte', () => {
  const sql = sqlSinComentarios()
  assert.doesNotMatch(sql, /max\(f\.quincena\)/, 'la ventana por defecto no puede ser la última quincena')
  assert.match(sql, /'ventana',\s*p_desde\b/)
  assert.match(sql, /where p_desde is null or f\.quincena = p_desde/)
})

test('los períodos son los bloques de jornales_bloque_persona, con su hasta', () => {
  const sql = sqlSinComentarios()
  assert.match(sql, /join lateral \([\s\S]*from public\.jornales_bloque_persona bp[\s\S]*between bp\.quincena_desde and bp\.quincena_hasta/)
  assert.match(sql, /coalesce\(b\.desde,/, 'el calendario es sólo el respaldo de un día sin bloque')
  assert.match(sql, /'hasta', p\.quincena_hasta/)
  // Lo que no se tocó y sostiene todo lo demás.
  assert.match(sql, /r\.fuente_legacy = 'sheet:jornales'/)
  assert.match(sql, /public\.es_administracion\(\)/)
  assert.match(sql, /'sin_respaldo'/)
  assert.match(sql, /delete from public\.ficha_cliente_cache where rpc = 'hh_de_obra'/)
})

test('el índice empieza por «Toda la obra» y está activo sin ventana', () => {
  const src = componente()
  assert.match(src, /Toda la obra/)
  assert.match(src, /const obraEntera = d\.ventana == null/)
  assert.match(src, /href=\{hrefPeriodo\(null\)\}/)
  assert.ok(src.indexOf('Toda la obra') < src.indexOf('d.periodos.map('), '«Toda la obra» va primero')
  assert.match(src, />Período</, 'la columna nombra el recorte que se ve')
  assert.doesNotMatch(src, />Quincena</)
})

test('lo de la app sin respaldo va al PIE, tenue, y no en el titular', () => {
  const src = componente()
  const nota = src.indexOf('data-testid="desglose-sin-respaldo"')
  assert.ok(nota > src.indexOf('data-testid="grilla-hh"'), 'sin_respaldo tiene que estar debajo de la grilla')
  const bloque = src.slice(nota, nota + 400)
  assert.doesNotMatch(bloque, /V\.warn/, 'no es una advertencia: son horas que no son de este trabajo')
  assert.match(src, /no se suman ni cuentan como personas del trabajo/)
})
