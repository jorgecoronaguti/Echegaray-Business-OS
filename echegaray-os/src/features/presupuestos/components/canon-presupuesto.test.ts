import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// EL CANON 15 Y 16, VERIFICADO CONTRA EL FUENTE — mismo método que `ds/conformidad-visual.test.ts`.
//
// La fuente de estas afirmaciones son los mockups `echegaray-design/15 · Presupuesto Edición.dc.html`
// y `16 · Presupuesto Análisis de partida.dc.html`. Lo que se protege acá no es un comportamiento:
// es una DECISIÓN de composición que ya se tomó dos veces en sentidos opuestos, y que se pierde en
// el primer refactor que «limpie» un className o un rótulo.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla se vea así. Eso lo prueba una captura del navegador
// —evidencia de otro nivel, que este trabajo NO produjo—. Acá se atrapa la regresión barata.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')

test('el pie de la tabla lleva las CUATRO cifras del canon 15, y ninguna se calcula acá', () => {
  const src = fuente('TablaPartidas.tsx')

  // El defecto que atrapa: volver al pie de una sola cifra («Costo directo del presupuesto»), que
  // dejaba a quien terminó de recorrer 68 filas sin saber contra qué total las estuvo comparando.
  //
  // Se busca `testid: '…'` y no `testid="…"`: desde el porte de `15 · Presupuesto Edición.dc.html`
  // el pie es `PieCanon`, que recibe los cuatro pares como OBJETOS —el canónico lo dibuja adentro
  // de la caja de la tabla, sobre #FAFAF8, no como una fila más de la tabla—.
  for (const testid of ['total-hh', 'total-costo-directo', 'total-precio-venta', 'total-margen']) {
    assert.ok(src.includes(`testid: '${testid}'`), `falta la cifra ${testid} en el pie`)
  }

  // Y los CUATRO RÓTULOS son los del canónico, en versalitas: HH TOTALES · COSTO · TOTAL · MARGEN.
  for (const rotulo of ['HH TOTALES', 'COSTO', 'TOTAL', 'MARGEN']) {
    assert.ok(src.includes(`rotulo: '${rotulo}'`), `el pie perdió el rótulo ${rotulo}`)
  }

  // Y el defecto grave: que alguien «arregle» el pie sumando las filas visibles. Serían dos caminos
  // al mismo total —uno de ellos sensible al buscador— y el día que difieran nadie sabría cuál vale.
  assert.equal(src.includes('.reduce('), false, 'el pie NO suma las filas: los cuatro salen de la vista')
})

test('la celda SIN ANÁLISIS no mete adentro la deuda de cómputo', () => {
  const src = fuente('ResumenPresupuesto.tsx')

  // El defecto que atrapa: `detalle: p.n_sin_computo > 0 ? ... : 'partidas'`, que hacía leer
  // «3 · 2 sin cómputo» como si el 3 se descompusiera. Son dos deudas distintas.
  //
  // `detalle` y no `contexto`: desde el porte del canónico 15 la franja es `FranjaKpis`, que llama
  // así al texto chico que va al lado del número (`15:90`).
  assert.ok(src.includes("detalle: 'partidas'"), 'la quinta celda dice «partidas», como el canon 15')
  assert.equal(src.includes('n_sin_computo'), false, 'la deuda de cómputo vive en su chip, que filtra')

  // Y las cinco celdas son las cinco del canónico, con SUS rótulos en versalitas.
  for (const rotulo of ['TOTAL', 'COSTO', 'MARGEN', 'HH DEL CÓMPUTO', 'SIN ANÁLISIS']) {
    assert.ok(src.includes(`rotulo: '${rotulo}'`), `la franja perdió ${rotulo}`)
  }
})

test('la composición del canon 16 va en tarjeta y con UN. antes de CANT. / unidad', () => {
  const src = fuente('TablaComposicion.tsx')

  // El defecto que atrapa: volver a `Cant.` a secas —que se lee como el cómputo entero de la
  // partida y no como lo que entra en UNA unidad— o perder el marco de tarjeta por familia.
  assert.ok(src.includes('unidad ? `Cant. / ${unidad}` : \'Cant.\''), 'el encabezado declara el divisor')
  assert.ok(
    src.includes("'mt-4 overflow-hidden rounded-card border border-line bg-surface first:mt-0'"),
    'cada familia es una tarjeta cerrada cuando la tabla NO va compacta',
  )
  // El panel de la 15 comparte este componente y va apretado: la tarjeta no puede alcanzarlo.
  assert.ok(src.includes("compacta\n            ? 'mt-3.5 first:mt-0'"), 'el panel compacto sigue sin marco')
})

test('la 16 no dibuja el toggle «Análisis propio», que la base no puede sostener', () => {
  const src = readFileSync(
    join(DIR, '..', '..', '..', 'app', '(main)', 'presupuestos', '[presupuesto]', 'partida', '[partida]', 'page.tsx'),
    'utf8',
  )

  // El defecto que atrapa: un interruptor apagado promete que existe la otra posición. La brecha
  // sigue declarada —en la ayuda—, que es distinto de dibujar el control que no funciona.
  assert.equal(src.includes('data-testid="toggle-origen"'), false, 'el control muerto no vuelve')
  assert.ok(src.includes('testid="ayuda-analisis-propio"'), 'pero la limitación se sigue declarando')
})
