// EL IMPORTADOR NO PUEDE RESUCITAR LA CLAVE VIEJA DEL BANCO (14/09/2026).
//
// `importar-banco.mjs` re-aplica en cada corrida su lista de migraciones. La tercera crea con
// `if not exists` el índice único (cuenta, referencia, importe). La migración 20260914T1400 lo borra y
// deja (cuenta, referencia, importe, fecha). Si la de la fecha no está en la lista, o no va DESPUÉS de
// la vieja, el índice viejo vuelve y el re-débito del echeq 308 (11/09) se rechaza como duplicado del
// 10/09: la base queda $317.000 arriba del banco. Pasó exactamente así el mismo día del arreglo.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: sacar la migración de la fecha de la lista, o ponerla antes de la
// que crea el índice (cuenta, referencia, importe).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(new URL('./importar-banco.mjs', import.meta.url), 'utf8')
const lista = FUENTE.slice(FUENTE.indexOf('const MIGRACIONES = ['), FUENTE.indexOf('].map((f) => join(RAIZ'))
const orden = [...lista.matchAll(/'([^']+\.sql)'/g)].map((m) => m[1])

test('la migración de la clave con fecha está en la lista y va DESPUÉS de la que crea la clave vieja', () => {
  const vieja = orden.indexOf('20260731130000_banco_referencia_mas_importe.sql')
  const nueva = orden.indexOf('20260914T1400_banco_clave_con_fecha.sql')
  assert.ok(nueva >= 0, `falta la migración de la fecha en MIGRACIONES: ${orden.join(', ')}`)
  assert.ok(vieja < 0 || nueva > vieja, `la de la fecha (${nueva}) tiene que ir después de la vieja (${vieja})`)
})

// 17/09/2026: con el re-débito del 308 ya en la base, el índice viejo no se puede CREAR, y la segunda
// migración lo intenta antes que la de la fecha lo borre. El importador moría en el paso 1. Las
// migraciones sólo corren si el esquema final no está; la MUTACIÓN: sacar el guard del bucle, o que el
// guard mire otro índice que el que crea la última migración.
test('las migraciones no se re-aplican sobre un esquema al día', () => {
  const bucle = FUENTE.match(/if \(([^)]*\)*)\)\s*\{\s*for \(const m of MIGRACIONES\)/)
  assert.ok(bucle, 'el bucle de MIGRACIONES no está condicionado')
  assert.match(bucle[1], /!\(await esquemaAlDia\(\)\)/)
  const guard = FUENTE.slice(FUENTE.indexOf('async function esquemaAlDia'), FUENTE.indexOf('async function main'))
  assert.match(guard, /to_regclass\('public\.banco_movimientos_ref_importe_fecha_unico'\)/)
  assert.match(guard, /column_name = 'acreditacion_pendiente'/)
  const ultima = readFileSync(new URL('../../supabase/migrations/' + orden.at(-1), import.meta.url), 'utf8')
  assert.match(ultima, /create unique index if not exists banco_movimientos_ref_importe_fecha_unico/)
})

test('la migración de la fecha borra el índice viejo y crea el nuevo', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260914T1400_banco_clave_con_fecha.sql', import.meta.url), 'utf8')
  assert.match(sql, /drop index if exists public\.banco_movimientos_ref_importe_unico;/)
  assert.match(sql, /on public\.banco_movimientos \(cuenta, referencia, importe, fecha\)/)
})
