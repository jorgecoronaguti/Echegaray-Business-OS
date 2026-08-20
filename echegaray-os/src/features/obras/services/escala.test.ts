import test from 'node:test'
import assert from 'node:assert/strict'
import { construirEscala, PX_POR_DIA, COLA_PX } from './escala.ts'

// ═══ EL LIENZO NO PUEDE SER MÁS ANGOSTO QUE EL LUGAR QUE TIENE (19/08/2026) ═══
//
// El dueño, con captura: el Gantt "se corta y no corre a la derecha para ver todo el cronograma". No
// era falta de scroll —el contenedor ya desplaza—: en escala "mes" son 4 px por día, y con la
// cartera entera cayendo en unos dos meses el lienzo medía ~260 px dentro de un área de ~715 px.
// Siete barras apretadas contra el borde izquierdo y medio panel en blanco a la derecha se leen como
// una pantalla rota, y encima la última etiqueta de mes quedaba cortada en "Se".
const d = (iso: string) => new Date(iso + 'T00:00:00Z')

test('si la ventana no llena el espacio disponible, los píxeles por día se estiran', () => {
  const e = construirEscala(d('2026-07-01'), d('2026-09-01'), 'mes', 715)
  assert.ok(e.px > PX_POR_DIA.mes, 'no estiró')
  assert.equal(Math.round(e.ancho), 715)
})

test('cuando la cartera es larga manda la escala elegida y el lienzo desborda', () => {
  // Dos años en escala semana: ahí el desplazamiento horizontal es lo correcto y no se toca.
  const e = construirEscala(d('2026-01-01'), d('2027-12-31'), 'semana', 715)
  assert.equal(e.px, PX_POR_DIA.semana)
  assert.ok(e.ancho > 715)
})

test('sin medición todavía (0), el lienzo usa la escala elegida y nunca se achica', () => {
  const e = construirEscala(d('2026-07-01'), d('2026-09-01'), 'mes', 0)
  assert.equal(e.px, PX_POR_DIA.mes)
})

test('la última etiqueta de mes tiene aire: el lienzo no termina justo en su línea', () => {
  const e = construirEscala(d('2026-07-01'), d('2026-09-01'), 'mes', 0)
  const ultima = e.meses.at(-1)
  assert.ok(ultima, 'no hay meses')
  assert.ok(e.ancho - ultima.x0 >= COLA_PX, 'la última etiqueta se corta contra el borde')
})

test('estirar NO desalinea: la cabecera de un mes cae donde caen las barras de ese mes', () => {
  const e = construirEscala(d('2026-07-01'), d('2026-09-01'), 'mes', 715)
  const agosto = e.meses.find((m) => m.label.startsWith('ago'))
  assert.ok(agosto)
  assert.ok(Math.abs(e.x('2026-08-01') - agosto.x0) < 0.01)
})
