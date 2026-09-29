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

// 29/09, segunda medición: el encabezado de escritorio tenía `max-md:hidden` pero `display: 'grid'` en línea,
// que le gana a la clase: seguía visible en el teléfono y estiraba la página.
for (const f of ['ListaPersonas.tsx', 'FichaPersona.tsx']) {
  test(`${f}: el encabezado de columnas se oculta en el teléfono`, () => {
    const enc = leer(f).split('\n').filter((l) => /height: 32/.test(l) && /gridTemplateColumns/.test(l))
    assert.equal(enc.length, 1)
    assert.match(enc[0], /className="grid max-md:hidden"/)
    assert.doesNotMatch(enc[0], /display:/)
  })
}

test('el enlace a la entrega en la revisión mide 44 px en el teléfono', () => {
  assert.match(leer('RevisarComprobante.tsx'), /<Link href=\{volver\}[^>]*max-md:min-h-11/)
})
