// EL CANDADO CONTRA LAS NOTAS QUE VUELVEN.
//
// POR QUÉ EXISTE (23/07). El dueño reclamó TRES VECES por lo mismo: "está lleno de comentarios
// 'vacío' en cargas sociales", "quitá las notas de impuestos y financieros, son confusas", y por
// último "la pestaña cargas sociales vuelve a tener los comentarios de mierda esos en el medio".
//
// Las dos primeras las arreglé a mano, pestaña por pestaña. La tercera es la que importa: él las
// había BORRADO, y el generador se las reescribió en la corrida siguiente. Contra un generador que
// escribe la nota en cada pasada, una persona que la borra una vez pierde siempre.
//
// Arreglarlo otra vez a mano garantiza una cuarta. Lo que no se puede repetir es lo que el CÓDIGO
// no deja escribir: ningún generador de pestañas puede escribir notas de procedencia. La
// trazabilidad vive en el subtítulo de la pestaña y en el título de cada sección — una vez, no una
// por fila.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPTS = new URL('../scripts/', import.meta.url).pathname

/**
 * El código SIN los comentarios.
 *
 * Los comentarios de este repo explican POR QUÉ, y para explicar este defecto hay que nombrarlo: sin
 * este filtro el canario se acusaría a sí mismo por la línea que documenta lo que se sacó, y un
 * canario que se dispara con su propia explicación se termina apagando — que es la peor forma de
 * perder un control. Mismo criterio que scripts/rotulos-de-frescura.test.mjs.
 */
const sinComentarios = (src) => src
  .split('\n')
  .map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))
  .join('\n')

const generadores = () => readdirSync(SCRIPTS)
  .filter((f) => f.endsWith('.mjs') && !f.includes('.test.'))
  .map((f) => ({ f, src: sinComentarios(readFileSync(join(SCRIPTS, f), 'utf8')) }))

test('ningún generador de pestañas escribe notas de procedencia', () => {
  const culpables = []
  for (const { f, src } of generadores()) {
    // Las dos funciones que colgaban un párrafo de cada celda. Se conservan en la lib con su historia,
    // pero ya no las puede IMPORTAR ni LLAMAR un generador. Se busca el USO —la llamada o el import—,
    // no la palabra.
    //
    // `notasDeColumna` SE AGREGÓ EL 03/08, Y ES LA QUE VOLVIÓ. El canario de julio sólo miraba
    // `origenANota`, así que el rescate de generadores de una rama vieja pudo devolver la otra mitad
    // del mismo defecto sin ponerse rojo: CAJA volvió a partir cada origen largo en etiqueta + nota y
    // le dejó 66 celdas de prosa en la columna H. Un control que cubre una función de dos no cubre el
    // defecto: cubre un archivo.
    for (const fn of ['origenANota', 'notasDeColumna']) {
      const importada = new RegExp(String.raw`import\s*{[^}]*\b${fn}\b[^}]*}`).test(src)
      if (importada || new RegExp(String.raw`\b${fn}\s*\(`).test(src)) culpables.push(`${f} → ${fn}()`)
    }
  }
  assert.deepEqual(culpables, [],
    `estos generadores volverían a escribir las notas que el dueño borró: ${culpables.join(', ')}. `
    + 'Usá borrarNotas() — la procedencia va en el subtítulo de la pestaña, no en un triangulito por fila.')
})

test('ningún generador escribe una nota NO VACÍA: la regla general, no la lista de funciones', () => {
  // El control de arriba nombra funciones, y una función se puede reescribir en línea. Éste mira el
  // EFECTO: un `updateCells` con `note:` distinto de cadena vacía. Borrar notas (`note: ''`) es lo
  // único permitido — es la operación con la que un generador respeta un borrado del dueño.
  const culpables = []
  for (const { f, src } of generadores()) {
    for (const m of src.matchAll(/\bnote:\s*([^,}\n]+)/g)) {
      const v = m[1].trim()
      if (v === "''" || v === '""' || v === '``') continue
      // SÓLO LA NOTA DE UNA CELDA. `note` es una palabra corriente: `emitEvent(..., payload: { note:
      // 'fundación validada' })` es un campo de un evento de Postgres y no toca ninguna planilla.
      // La nota de Sheets viaja siempre dentro de `rows: [{ values: [{ note }] }]`.
      const antes = src.slice(Math.max(0, m.index - 140), m.index)
      if (!/\bvalues\s*:/.test(antes)) continue
      culpables.push(`${f} → note: ${v.slice(0, 40)}`)
    }
  }
  assert.deepEqual(culpables, [],
    `un generador volvió a colgar una nota de una celda:\n${culpables.join('\n')}\n`
    + 'Una nota vive FUERA del valor de la celda: reescribir la pestaña no la borra, así que el dueño '
    + 'la borra una vez y el generador se la devuelve en cada corrida. Nunca gana la persona.')
})
