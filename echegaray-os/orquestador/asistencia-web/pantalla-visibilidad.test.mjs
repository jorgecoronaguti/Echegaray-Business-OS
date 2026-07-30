// LO QUE SE VE Y LO QUE NO — la regresión de los dos defectos que sólo aparecieron mirando
// la pantalla en un navegador de verdad.
//
// El test estático de consistencia HTML↔JS no los podía encontrar: los dos viven en la
// intersección entre el CSS y el DOM, que sólo existe cuando algo la renderiza. Estos tests
// no renderizan — atacan la CAUSA de cada uno, que sí es texto:
//
//   1. `hidden` perdiendo contra `display`. El atributo trae `display:none` de la hoja del
//      navegador, con especificidad mínima. Cualquier `.clase { display: … }` lo pisa. La
//      pantalla mostraba MOTIVO, ACLARACIÓN y TRABAJÓ EN OTRA OBRA en las 16 filas.
//   2. Campos que se esconden pero igual mandan su valor. Un valor invisible que viaja es
//      peor que uno visible: nadie lo puede revisar antes de que se escriba.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const leer = (n) => readFileSync(join(AQUI, 'publico', n), 'utf8')
const CSS = leer('pantalla.css')
const JS = leer('pantalla.js')
const JS_SRC = JS
const HTML = leer('pantalla.html')

test('el CSS declara que [hidden] gana: sin esto la pantalla muestra TODO', () => {
  const regla = CSS.match(/\[hidden\]\s*\{[^}]*\}/)
  assert.ok(regla, 'falta la regla [hidden]: cualquier .clase con display la pisa')
  assert.match(regla[0], /display:\s*none/, '[hidden] tiene que ser display:none')
  assert.match(regla[0], /!important/, 'sin !important pierde contra .campo/.detalle')
})

test('toda clase que el JS oculta con `hidden` está cubierta por esa regla', () => {
  // Las clases que el JS apaga con `.hidden = …` y que el CSS también posiciona con display.
  for (const clase of ['campo', 'detalle']) {
    const conDisplay = new RegExp(`\\.${clase}\\s*\\{[^}]*display:`, 'm').test(CSS)
    if (!conDisplay) continue
    assert.match(CSS, /\[hidden\][^{]*\{[^}]*display:\s*none[^}]*!important/,
      `.${clase} declara display y por eso [hidden] tiene que ganarle`)
  }
})

test('los tres campos condicionales existen y el JS decide su visibilidad', () => {
  for (const clase of ['motivo-campo', 'aclaracion-campo', 'obra-campo']) {
    assert.ok(HTML.includes(clase), `falta ${clase} en el markup`)
    const i = JS.indexOf(`.${clase}`)
    assert.ok(i > 0, `el JS no toca ${clase}: se mostraría siempre`)
    // El JS lo oculta en el mismo lugar donde lo busca — sea inline (`q(…).hidden =`) o
    // guardándolo en una variable dos líneas más abajo (`campoMotivo.hidden = …`).
    assert.match(JS.slice(i, i + 220), /\.hidden\s*=/,
      `${clase} se busca pero nunca se le decide la visibilidad`)
  }
})

test('"trabajó en otra obra" NO se le ofrece a quien no trabajó', () => {
  // El núcleo rechaza esa combinación ("si no trabajó, no corresponde indicar en qué obra
  // estuvo"). Ofrecer el campo igual es hacer que el jefe lo complete para enterarse después.
  assert.match(JS, /\.obra-campo['"`]\)\.hidden\s*=\s*!presente\s*\|\|\s*horas\s*<=\s*0/,
    'la obra realizada tiene que esconderse cuando la persona no trabajó')
})

test('ningún campo oculto manda su valor viejo', () => {
  // Si el jefe elige "otra obra" y después lo marca ausente, ese valor ya no corresponde.
  for (const [campo, guardia] of [['motivo', 'visibleMotivo'], ['aclaracion', 'visibleAcl'], ['obra_realizada', 'visibleObra']]) {
    const linea = JS.split('\n').find((l) => l.includes(`${campo}:`) && l.includes('?'))
    assert.ok(linea, `no encontré cómo se arma ${campo} en el envío`)
    assert.ok(linea.includes(guardia), `${campo} viaja sin mirar si su campo estaba visible`)
  }
})

test('no hay horas extra como campo: se calculan', () => {
  assert.ok(!/name=["']extra|id=["']extra["']|class=["'][^"']*horas-extra/.test(HTML),
    'las horas extra no se cargan a mano: las separa el núcleo')
})

test('el "Listo" se muestra DESPUÉS de recargar, o se borra solo', () => {
  // `cargarCuadrilla` arranca con `avisar('')`. Si el aviso de éxito se pone antes, el jefe
  // aprieta Registrar y no ve nada — y lo lógico es apretar de nuevo.
  const i = JS_SRC.indexOf('await cargarCuadrilla()\n      avisar(')
  assert.ok(i > 0, 'el aviso de éxito tiene que ir después de await cargarCuadrilla()')
})
