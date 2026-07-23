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

test('ningún generador de pestañas escribe notas de procedencia', () => {
  const culpables = []
  for (const f of readdirSync(SCRIPTS)) {
    if (!f.endsWith('.mjs') || f.includes('.test.')) continue
    const src = readFileSync(join(SCRIPTS, f), 'utf8')
    // La función que movía la columna "de dónde sale" a la nota de cada concepto. Se conserva en la
    // lib con su historia, pero ya no la puede IMPORTAR ni LLAMAR un generador. Se busca el uso
    // —la llamada o el import—, no la palabra: un comentario que la nombre para explicar por qué no
    // se usa es justamente lo contrario de un defecto.
    const importada = /import\s*{[^}]*\borigenANota\b[^}]*}/.test(src)
    if (importada || /\borigenANota\s*\(/.test(src)) culpables.push(f)
  }
  assert.deepEqual(culpables, [],
    `estos generadores volverían a escribir las notas que el dueño borró: ${culpables.join(', ')}. `
    + 'Usá borrarNotas() — la procedencia va en el subtítulo de la pestaña, no en un triangulito por fila.')
})
