// EL DEFECTO QUE ESTE TEST IMPIDE: que el paso a paso vuelva a ser una animación.
//
// Lo que había hasta el 03/09/2026 (pedido del dueño del 02/09: «quiero que los pasos sean la guía
// y que sea como un paso a paso que se va completando»):
//
//   1 · `LecturaDelPlano.tsx` tenía un `setTimeout` de 620 ms que prendía los siete pasos de a uno
//       y escribía «Leyendo el plano · paso 3 de 7». Los siete llegaban COMPLETOS del backend: el
//       contador no medía nada. Es una estimación presentada como hecho.
//   2 · `ConversacionLectura.tsx` contaba `pasos.length` para saber por dónde iba. Desde que el
//       backend publica los SIETE desde el arranque, esa cuenta diría «7 de 7 · lectura cerrada»
//       a los dos segundos de empezar.
//   3 · Mientras `midiendo`, la columna izquierda mostraba UNA línea de texto en vez del paso a
//       paso — justo al revés de lo que el dueño pidió ver mientras espera.
//
// No hay navegador acá: se verifica el cableado, que es donde vivían los tres defectos. La lógica
// de las frases y del contador tiene sus propios controles en `services/trabajoLectura.test.ts`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const leer = (...partes: string[]) => readFileSync(join(AQUI, ...partes), 'utf8')

/** El código sin sus comentarios: los comentarios de este repo NOMBRAN el defecto que se sacó
 *  («acá vivía un setTimeout de 620 ms»), y buscarlo ahí daría rojo justo por documentarlo. */
const codigo = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CONVERSACION = leer('ConversacionLectura.tsx')
const ENTORNO = leer('EntornoLecturaPlano.tsx')
const LECTURA_CONGELADA = leer('LecturaDelPlano.tsx')

test('ningún componente de presupuestos fabrica progreso con un temporizador', () => {
  for (const [nombre, fuente] of [['ConversacionLectura', CONVERSACION], ['LecturaDelPlano', LECTURA_CONGELADA]] as const) {
    assert.ok(!/setTimeout|setInterval/.test(codigo(fuente)), `${nombre} no puede mover una barra de progreso con un reloj: el avance lo mide el backend`)
  }
  assert.ok(!/620/.test(codigo(LECTURA_CONGELADA)), 'el ritmo de 620 ms del mockup no vuelve al código de producción')
})

test('el contador sale del backend (`certeza`), no de cuántos pasos llegaron', () => {
  assert.match(CONVERSACION, /progresoDeLectura\(pasos, certeza\)/, 'el «3» de «paso 3 de 7» lo deriva quien leyó el plano')
  assert.ok(!/progresoDeLectura\(pasos\.length/.test(CONVERSACION), 'contar la lista da 7 de 7 desde el primer segundo')
  assert.match(ENTORNO, /certeza=\{trabajo\.certeza\}/, 'si la certeza no viaja, la pantalla vuelve a contar por su cuenta')
})

test('mientras mide se ve el paso a paso y la línea nombra el próximo paso, no una etapa suelta', () => {
  assert.match(CONVERSACION, /data-testid="lista-pasos"/, 'los pasos se dibujan siempre, no sólo al terminar')
  assert.ok(!/midiendo \?[\s\S]{0,120}data-testid="lista-pasos"/.test(CONVERSACION), 'la lista de pasos no puede quedar detrás de un condicional de «midiendo»')
  assert.match(CONVERSACION, /progreso\.midiendo \?\? etapa/, 'primero el paso que se está midiendo; la etapa del backend es el respaldo')
  assert.match(CONVERSACION, /data-testid="sello-etapa"/, '«Leyendo el plano · paso N de 7» es la frase del dueño y tiene que estar en pantalla')
})

test('el paso que se ABRE solo es el recién contestado, no el último de la lista', () => {
  assert.match(ENTORNO, /filter\(\(p\) => p\.estado !== 'pendiente'\)/, 'con los siete publicados desde el arranque, el último de la lista es el paso 7 y se abriría de entrada')
  assert.ok(!/trabajo!\.pasos\[pasosLen - 1\]/.test(ENTORNO))
})
