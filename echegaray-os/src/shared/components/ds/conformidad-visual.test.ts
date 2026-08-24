import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// EL CONTRATO VISUAL, VERIFICADO CONTRA EL ESPECIMEN — NO CONTRA EL GUSTO DE QUIEN EDITA.
//
// La fuente de estas afirmaciones es `echegaray-design/Echegaray Design System.dc.html` (medido con
// `getComputedStyle` sobre el archivo abierto en un navegador) y `design/system/COMPONENTS.md`. Cada
// número de acá salió de ahí, y cada `test` cita de dónde.
//
// POR QUÉ SE LEE EL FUENTE Y NO SE RENDERIZA EL COMPONENTE: lo que se está protegiendo es una
// CONSTANTE de estilo, no un comportamiento. Montar React para leer un `className` que ya está
// escrito literal en el archivo agrega un runtime entero entre la afirmación y el hecho, y lo que
// se rompe cuando alguien vuelve a poner `text-ink` en un estado `pos` no es el render: es el valor.
// La contracara honesta de esta decisión está declarada abajo, en «lo que este test NO prueba».
//
// LO QUE ESTE TEST NO PRUEBA: que la clase de Tailwind exista, que el CSS generado la incluya, ni
// que la pantalla real se vea así. Eso lo prueba una captura del navegador, que es evidencia de otro
// nivel. Acá se atrapa la regresión barata —la que se cuela en un `className` durante un refactor—,
// que es la que ya pasó cinco veces.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')

/** El cuerpo de un objeto literal, SIN el comentario que lo explica: los comentarios de este repo
 *  citan los valores viejos («si se queda con `px-3.5`…»), y un test que lee el bloque entero se
 *  pone rojo por la explicación en vez de por el código. */
function objeto(src: string, declaracion: string) {
  const desde = src.indexOf(declaracion)
  assert.notEqual(desde, -1, `no existe ${declaracion}`)
  const abre = src.indexOf('{', desde)
  return src.slice(abre, src.indexOf('\n}', abre))
}

test('el estado «hecha» se dice en verde, no en tinta (especimen §06 y §07: #067647)', () => {
  const src = fuente('Estado.tsx')
  const mapa = src.slice(src.indexOf('const TEXTO'), src.indexOf('export function Estado'))

  // El defecto: `pos: 'text-ink'` pintaba el trabajo TERMINADO con el mismo peso visual que el
  // resto de la columna, y terminado es justamente el único estado que el ojo puede saltear.
  assert.match(mapa, /pos:\s*'text-pos'/)
  assert.doesNotMatch(mapa, /pos:\s*'text-ink'/)

  // Las dos excepciones del especimen, para que «heredar el color del punto» no se generalice:
  // «En curso» es grafito («neutro, sin color») y «Pendiente» queda en muted porque su punto es hueco.
  assert.match(mapa, /curso:\s*'text-ink'/)
  assert.match(mapa, /pendiente:\s*'text-muted'/)
})

test('el punto de estado se separa 8px de su palabra (especimen §06)', () => {
  // `gap-1.5` (6px) pegaba el punto a la letra: se leía como parte de la palabra, no como su marca.
  assert.match(fuente('Estado.tsx'), /inline-flex items-center gap-2 whitespace-nowrap/)
})

test('el encabezado de tabla va en peso normal (especimen §07: 10px / 400 / 0.06em / faint)', () => {
  const src = fuente('Tabla.tsx')
  const th = src.slice(src.indexOf('export function Th'), src.indexOf('export function Tr'))

  assert.match(th, /text-\[10px\]/)
  assert.match(th, /tracking-\[0\.06em\]/)
  assert.match(th, /text-faint/)
  // El defecto: `font-medium` era la cuarta señal para decir lo mismo que ya decían tamaño, color y
  // versalitas — y la que devolvía el rótulo a competir con el dato que rotula.
  assert.doesNotMatch(th, /font-medium/)
})

test('el número de una celda va SIEMPRE en ink, sin depender de `fuerte` (especimen §07)', () => {
  const src = fuente('Tabla.tsx')
  const td = src.slice(src.indexOf('export function Td'), src.indexOf('export function FilaTotal'))

  // El defecto: el número heredaba `ink-soft` salvo que quien escribió la pantalla se acordara de
  // pasar `fuerte`, así que la MISMA columna de importes salía en dos tintas según el módulo.
  const rama = td.slice(td.indexOf('num ?'), td.indexOf(': `text-[13px]'))
  assert.match(rama, /font-mono/)
  assert.match(rama, /tabular-nums/)
  assert.match(rama, /text-ink/)
  assert.doesNotMatch(rama, /text-ink-soft/)
})

test('la secundaria compensa su borde para medir igual que la primaria (especimen §05)', () => {
  const src = fuente('Boton.tsx')

  // 7×14 sin borde · 7×13 CON borde: con `border-box`, 13+1 y 14+0 dejan el texto a los mismos
  // 14px del filo exterior. Si la secundaria se queda en 14, mide 1px más de cada lado y una
  // barra con las dos deja de estar peineada.
  assert.match(src, /normal:\s*\{\s*conBorde:\s*'px-\[13px\]',\s*sinBorde:\s*'px-\[14px\]'\s*\}/)
  assert.match(src, /secundaria:\s*true/)
  assert.match(src, /py-\[7px\] text-\[12\.5px\]/)

  // Y una sola regla de padding por botón: dos `px-*` en la misma cadena los resuelve el orden del
  // CSS generado, no el del código.
  const normal = objeto(src, 'const TAMANO')
  assert.doesNotMatch(normal, /px-/)
})

test('la secundaria con borde se escribe en ink-soft, no en ink (especimen §05: #3A3A38)', () => {
  const src = fuente('Boton.tsx')
  const variante = src.slice(src.indexOf('const VARIANTE'), src.indexOf('const CON_BORDE'))
  assert.match(variante, /secundaria: 'border border-line bg-surface text-ink-soft/)
})

test('los controles de teléfono usan radio 8, que es el del especimen §10', () => {
  const src = fuente('Boton.tsx')
  const tamanos = objeto(src, 'const TAMANO')

  // 12px no es un radio de este sistema: `SPACING_BORDERS.md` sólo tiene 6 (control) y 10
  // (contenedor), y el especimen móvil dibuja los tres controles en 8.
  assert.doesNotMatch(tamanos, /rounded-\[12px\]/)
  assert.equal((tamanos.match(/rounded-\[8px\]/g) ?? []).length, 2)
})

test('la sección plegada no se apaga: cambia el peso, no la tinta (especimen §08)', () => {
  const src = fuente('Plegable.tsx')
  // El defecto: `ink-soft` en la fila cerrada dejaba el índice entero de la ficha en segundo
  // plano — justo el índice que existe para decidir dónde entrar.
  assert.match(src, /text-\[12\.5px\] text-ink \$\{abierto \? 'font-semibold' : ''\}/)
  // Contador mono de 11px, no 11,5.
  assert.match(src, /font-mono text-\[11px\] tabular-nums text-faint/)
})
