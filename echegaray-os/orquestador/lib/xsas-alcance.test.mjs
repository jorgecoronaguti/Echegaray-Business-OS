// ¿A CUÁNTAS DE LAS 46 SKILLS LLEGA LA PUERTA? La respuesta honesta, fijada por un test.
//
// La afirmación cómoda sería «las 46 están disponibles vía Gateway». No es cierta y no debe serlo:
// trece de las cuarenta y seis gobiernan el trabajo de CLAUDE CODE —crear una skill, correr un
// backlog, cerrar la sesión— y rutear un pedido del negocio hacia ellas sería exactamente la
// confusión que la separación Claude≠XSAS viene a evitar.
//
// `image-generation` sigue del lado del builder y `generar-imagen` NO: son cosas distintas. La
// primera es una plantilla genérica que el OS no usa (así la declara el catálogo); la segunda es la
// capacidad canónica del negocio, con su tool y su motor, y el dueño le pide una imagen a XSAS
// exactamente igual que le pide una presentación.
//
// Este test PIN­EA el número y los nombres. Si mañana una skill de dominio se vuelve inalcanzable
// —porque le sacaron la capacidad o le cambiaron las palabras— se pone rojo. Y si alguien cablea
// una de las de Claude Code al ruteo del negocio, también.
import test from 'node:test'
import assert from 'node:assert/strict'

import { leerCatalogoDeDisco } from './skill-catalogo.mjs'
import { SKILL_KEYWORDS } from './elegir-capacidad.mjs'
import { SKILL_SHEETS } from './skill-map.mjs'

/** Las que gobiernan el trabajo de Claude Code, no el del negocio. NO se rutean desde la puerta. */
const DEL_BUILDER = new Set([
  'add-login', 'ai', 'backlog', 'bucle-agentico', 'image-generation', 'memory-manager',
  'orquestador-de-razonamiento-y-skills', 'playwright-cli', 'primer', 'prp', 'skill-creator',
  'supabase', 'traspaso',
])

/** Una skill es alcanzable si el ruteo puede nombrarla: por capacidad (`advise.*`), por su índice
 *  de palabras propio, o por la regla de Sheets. Es exactamente lo que `elegirCapacidad` mira. */
function alcanzables(catalogo) {
  const s = new Set([...Object.keys(SKILL_KEYWORDS), SKILL_SHEETS])
  for (const f of catalogo) if (f.capacidades?.length) s.add(f.clave)
  return s
}

test('TODA skill de dominio es alcanzable desde la puerta — una huérfana no la activa nadie', async () => {
  const catalogo = await leerCatalogoDeDisco({})
  const rutables = alcanzables(catalogo)
  const huerfanas = catalogo.filter((f) => !DEL_BUILDER.has(f.clave) && !rutables.has(f.clave)).map((f) => f.clave)
  assert.deepEqual(huerfanas, [], `sin ruta desde el gateway: ${huerfanas.join(', ')}`)
})

test('las de Claude Code NO se rutean desde un pedido del negocio (Claude ≠ XSAS)', async () => {
  const catalogo = await leerCatalogoDeDisco({})
  const rutables = alcanzables(catalogo)
  const coladas = [...DEL_BUILDER].filter((c) => rutables.has(c))
  assert.deepEqual(coladas, [], `skills del builder cableadas al ruteo del negocio: ${coladas.join(', ')}`)
})

test('el número está fijado: 46 en disco, 33 de dominio alcanzables, 13 del builder', async () => {
  const catalogo = await leerCatalogoDeDisco({})
  const rutables = alcanzables(catalogo)
  assert.equal(catalogo.length, 46)
  assert.equal(catalogo.filter((f) => DEL_BUILDER.has(f.clave)).length, 13)
  assert.equal(catalogo.filter((f) => rutables.has(f.clave)).length, 33)
})
