// LAS COMPRAS DE LA FICHA (TabOperación) SE LISTAN POR `costos_obra.obra_id`, NO POR EL TEXTO DE LA J.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// `getComprasObra` etiquetaba cada fila por `obra_texto` contra `obra_alias` (`imputar`): «La Estrella»
// en la J mandaba la compra a la obra madre y el comedor listaba «—» mientras `obra_costo_real` (por
// obra_id) declaraba $45 M. El detalle y el total de la misma pantalla no salían de la misma regla.
//
// Se prueba sobre el FUENTE porque `operacionService.ts` importa con el alias `@/` que `node --test`
// no resuelve; lo que se protege son decisiones escritas: a qué columna se le pide la obra y que la
// fila salga con ese id, sin pasar por el diccionario.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const sinComentarios = (t: string) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
const fuente = sinComentarios(readFileSync(join(DIR, 'operacionService.ts'), 'utf8'))
const desde = fuente.indexOf('export async function getComprasObra(')
const hasta = fuente.indexOf('export async function getOperacion(')
const compras = fuente.slice(desde, hasta)

test('getComprasObra pide a la base obra_id = <obra> y no etiqueta por texto', () => {
  assert.ok(desde > 0 && hasta > desde, 'no encuentro getComprasObra')
  assert.match(compras, /\.from\('costos_obra'\)/)
  assert.match(compras, /\.select\('[^']*\bobra_id\b[^']*'\)/, 'la consulta no trae obra_id')
  assert.doesNotMatch(compras, /obra_texto/, 'volvió a leerse el texto de la J')
  assert.match(compras, /consulta\.eq\('obra_id', obraId\)/, 'la lista no se filtra por obra_id en la base')
  assert.doesNotMatch(compras, /\bimputar\(|obraDeTexto\(|idx\b/, 'las compras volvieron a pasar por el diccionario de alias')
  assert.match(compras, /obra_canonica_id: \(c\.obra_id as string \| null\) \?\? null/)
})

test('el total sigue saliendo de obra_costo_real y el detalle se controla contra él', () => {
  assert.match(compras, /\.from\('obra_costo_real'\)/)
  assert.match(compras, /\.select\('costo_real, n_comprobantes'\)/)
  assert.match(compras, /completo: detalleCubreElTotal\(filas, total\)/)
})

test('el llamador ya no le pasa el índice de alias a las compras', () => {
  assert.match(fuente, /getComprasObra\(supabase, obraId\)/)
  assert.doesNotMatch(fuente, /getComprasObra\(supabase, idx, obraId\)/)
})
