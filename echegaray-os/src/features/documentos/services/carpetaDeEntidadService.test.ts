// LA CARPETA DE UN CLIENTE NO SE CORTA EN 300 (dueño, 14/09/2026: «faltan documentos»).
//
// ARCOR tiene 542 archivos bajo su carpeta y la lectura traía los 300 más nuevos. Se prueba el fuente
// —la lectura habla con Supabase y `node --test` no tiene base— con el mismo criterio que
// `solapaQuincena.test.ts`. LA MUTACIÓN QUE PONE ESTO ROJO: volver a un solo `.limit()`, bajar el tope
// de 1.000, o paginar sin desempate (dos páginas repetirían o saltearían archivos).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(new URL('./carpetaDeEntidadService.ts', import.meta.url), 'utf8')
const tope = Number(/export const TOPE_ARCHIVOS = (\d+)/.exec(FUENTE)?.[1])

test('el tope alcanza a la carpeta más grande medida (ARCOR, 542) con margen', () => {
  assert.ok(tope >= 1000, `TOPE_ARCHIVOS es ${tope}`)
})

test('la lectura pagina con range y orden total, no con un solo limit', () => {
  const lectura = FUENTE.slice(FUENTE.indexOf('export async function getArchivosDeEntidad'))
  assert.match(lectura, /\.range\(desde,/)
  assert.match(lectura, /\.order\('drive_file_id'/)
  assert.doesNotMatch(lectura, /\.limit\(TOPE_ARCHIVOS\)/)
  assert.match(lectura, /if \(pagina\.length < PAGINA\) break/)
})
