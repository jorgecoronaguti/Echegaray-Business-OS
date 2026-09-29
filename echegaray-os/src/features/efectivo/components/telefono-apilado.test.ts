// El defecto del 29/09: la fila de persona y la de movimiento llevaban `gridTemplateColumns` EN LÍNEA, y un
// estilo en línea le gana a cualquier clase `max-md:`; el teléfono conservaba las cinco columnas (536 y 476 px
// a 390 px de ancho). Esto no mide el layout (eso es del navegador): fija que las columnas sólo se declaran
// desde `md`, por variable, y que los chips y enlaces táctiles llevan el mínimo de 44 px.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')

for (const f of ['ListaPersonas.tsx', 'FichaPersona.tsx']) {
  test(`${f}: las columnas de la fila no van en línea`, () => {
    const filas = leer(f).split('\n').filter((l) => /gridTemplateColumns/.test(l) && !/height: 32|^\s*\/\//.test(l))
    assert.deepEqual(filas, [], 'un gridTemplateColumns en línea pisa el apilado del teléfono')
    assert.match(leer(f), /md:\[grid-template-columns:var\(--cols\)\]/)
  })
}

test('chips y enlaces de código miden 44 px en el teléfono', () => {
  assert.match(leer('ListaPersonas.tsx'), /max-md:min-h-11[^"]*"[^>]*style=\{chip/)
  assert.match(leer('FichaPersona.tsx'), /max-md:min-h-11[^"]*"[^>]*style=\{\{ fontFamily: MONO/)
})
