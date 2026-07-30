// La pantalla no se puede "probar mirándola" desde acá (no hay navegador disponible en
// esta máquina), así que se verifica lo que un navegador rompería en silencio: un id o
// una clase que el JS busca y el HTML no tiene, un recurso externo que la CSP bloquea, o
// un script inline. Un selector mal escrito no tira error: devuelve null y la fila queda
// muerta sin que nadie se entere hasta que el jefe está en la obra.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const leer = (n) => readFileSync(join(AQUI, 'publico', n), 'utf8')
const html = leer('pantalla.html')
const js = leer('pantalla.js')
const css = leer('pantalla.css')

const unicos = (re, texto) => [...new Set([...texto.matchAll(re)].map((m) => m[1]))]

test('todo id que busca el JS existe en el HTML', () => {
  for (const id of unicos(/getElementById\('([^']+)'\)/g, js)) {
    assert.ok(html.includes(`id="${id}"`), `falta id="${id}" en el HTML`)
  }
})

test('toda clase que busca el JS existe en la plantilla de fila', () => {
  const clases = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))
  for (const c of unicos(/'\.([a-z][a-z0-9-]*)'/g, js)) {
    assert.ok(clases.has(c), `el JS busca «.${c}» y el HTML no la tiene`)
  }
})

test('no hay recursos externos: la CSP los bloquearía y el celular puede no tener señal', () => {
  for (const [nombre, texto] of [['html', html], ['css', css], ['js', js]]) {
    assert.doesNotMatch(texto, /https?:\/\/(?!asistencia\.local)/, `${nombre} referencia una URL externa`)
    assert.doesNotMatch(texto, /src="\/\//, `${nombre} referencia un protocolo relativo`)
  }
})

test('no hay script inline ni handlers en el HTML (la CSP sólo admite scripts propios)', () => {
  assert.doesNotMatch(html, /<script(?![^>]*src=)/, 'hay un <script> sin src')
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'hay un handler inline tipo onclick=')
})

test('la pantalla se sirve bajo una base configurable, no bajo una ruta escrita a mano', () => {
  assert.match(html, /data-base="\{\{BASE\}\}"/)
  assert.match(html, /href="\{\{BASE\}\}\/pantalla\.css"/)
  assert.match(html, /src="\{\{BASE\}\}\/pantalla\.js"/)
  assert.ok(!html.includes('/asistencia/pantalla'), 'la ruta no puede estar escrita a mano')
})

test('la pantalla es usable en un celular y con sol', () => {
  assert.match(html, /name="viewport"[^>]*width=device-width/)
  assert.match(css, /--toque:\s*4[8-9]px|--toque:\s*5\dpx/, 'los targets tienen que ser grandes')
  assert.match(css, /prefers-color-scheme:\s*dark/, 'tiene que respetar el modo oscuro del teléfono')
  assert.match(css, /min-height:\s*5\dpx/, 'el botón principal tiene que ser grande')
})

test('no existe ningún campo de horas extra: las calcula el servidor', () => {
  for (const texto of [html, js]) {
    assert.doesNotMatch(texto, /extras?"?\s*:\s*(?:numero|q\()/i)
  }
  assert.doesNotMatch(html, /name="extra|id="extra|class="[^"]*\bhoras-extra\b/)
  // El excedente se muestra como información (un chip), nunca como algo a completar.
  assert.match(html, /class="chip extra"/)
})

test('el vocabulario de la pantalla es el del contrato, sin novedades ni observaciones', () => {
  for (const prohibida of ['novedad', 'incidencia', 'observacion', 'observación', 'estado del día']) {
    assert.ok(!html.toLowerCase().includes(prohibida), `el HTML dice «${prohibida}»`)
  }
})
