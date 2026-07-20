import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { migracion, DESTINO } from '../scripts/generar-migracion-caja.mjs'
import { RUBROS } from './rubro-caja.mjs'
import { RUBROS_SIN_PROYECCION } from './cash-flow-lineas.mjs'

// EL TEST QUE IMPIDE LA DERIVA. La regla de caja está escrita para JS, para el Sheet y para Postgres,
// y las tres salen del mismo array. La de Postgres pasa por un archivo intermedio —la migración— y
// ahí es donde puede desincronizarse: alguien edita el SQL directo, o agrega un rubro y se olvida de
// regenerar. En los dos casos la base clasificaría distinto que la planilla y NADIE se enteraría
// hasta que los números no cierren.
test('la migración del núcleo coincide exactamente con el generador', () => {
  const enDisco = readFileSync(DESTINO, 'utf8')
  assert.equal(enDisco, migracion(),
    'la migración quedó desincronizada — corré: node orquestador/scripts/generar-migracion-caja.mjs')
})

test('el CASE de Postgres nombra los mismos rubros que la regla', () => {
  const sql = migracion()
  for (const r of RUBROS) assert.ok(sql.includes(`then '${r}'`), `falta el rubro ${r} en el SQL`)
  assert.ok(sql.includes("else 'SIN CLASIFICAR'"), 'falta la rama por defecto')
})

// Si el núcleo proyectara un rubro que el Sheet no proyecta, habría dos verdades distintas sobre la
// misma plata — que es exactamente el problema que esta migración vino a resolver, al revés.
test('el núcleo no proyecta los rubros que el Sheet tampoco proyecta', () => {
  const sql = migracion()
  for (const r of RUBROS_SIN_PROYECCION) {
    assert.ok(sql.includes(`'${r}'`), `${r} debería estar excluido de la proyección`)
  }
  assert.ok(/not in \(/.test(sql), 'la exclusión se aplica')
})

test('la vista de caja distingue el hecho del supuesto', () => {
  const sql = migracion()
  assert.ok(sql.includes("'real'::text"), 'los movimientos con comprobante se marcan real')
  assert.ok(sql.includes("'proyeccion'"), 'las estimaciones se marcan proyeccion')
})
