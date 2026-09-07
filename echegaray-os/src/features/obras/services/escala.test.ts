import test from 'node:test'
import assert from 'node:assert/strict'
import { construirEscala, diasDeVentana, escalaQueEntra, PX_POR_DIA, COLA_PX } from './escala.ts'

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

// ═══ CON QUÉ ESCALA SE ABRE — EL DEFECTO DEL 07/09/2026 ═══
//
// Medido en producción con las diez obras activas: ventana 13/07/2026 → 07/01/2027 (~185 días) en un
// lienzo de 1.392 px. Abriendo en «semana» el ancho dibujado era 3.364 px: el fin de las cuatro
// obras que terminan en diciembre nacía fuera de la pantalla. El dueño lo leyó como que la vista de
// todas las obras «había sido quitada».
test('con la cartera real, el Gantt NO se abre en una escala que deja el 59% afuera', () => {
  const dias = diasDeVentana(d('2026-07-13'), d('2027-01-07'))
  assert.equal(escalaQueEntra(dias, 1392), 'mes')
  // Y con esa escala el lienzo entra de verdad: la elección se comprueba contra el ancho que
  // `construirEscala` va a dibujar, no contra la intención.
  const e = construirEscala(d('2026-07-13'), d('2027-01-07'), 'mes', 1392)
  assert.ok(e.ancho <= 1392 + 1, `el lienzo mide ${e.ancho} y hay 1392`)
})

test('una cartera corta se sigue abriendo en semana: los días se leen uno por uno', () => {
  const dias = diasDeVentana(d('2026-07-13'), d('2026-09-01'))
  assert.equal(escalaQueEntra(dias, 1392), 'semana')
  const e = construirEscala(d('2026-07-13'), d('2026-09-01'), 'semana', 1392)
  assert.ok(e.porDia, 'con lugar de sobra la división es el día, no la semana')
})

test('sin medir todavía el lugar (SSR), se abre como siempre y no se adivina', () => {
  assert.equal(escalaQueEntra(diasDeVentana(d('2026-01-01'), d('2028-01-01')), 0), 'semana')
})

test('en un teléfono de 390px hasta una cartera de dos meses pide la escala de mes', () => {
  // El lienzo tiene ~222px al lado de la columna fija de 168px. 50 días × 16 = 800px no entran.
  assert.equal(escalaQueEntra(diasDeVentana(d('2026-07-13'), d('2026-09-01')), 222), 'mes')
})

test('el primer mes del eje tiene nombre aunque el lienzo no arranque un día 1', () => {
  // La ventana del Gantt de cartera abre una semana antes de la obra más temprana: casi nunca cae en
  // un 1°. Sin esto, la franja de la izquierda no decía de qué mes era.
  const e = construirEscala(d('2026-07-06'), d('2027-01-07'), 'mes', 1392)
  assert.equal(e.meses[0]?.label.slice(0, 3), 'jul')
  assert.equal(e.meses[0]?.x0, 0)
  // Y no se duplica: el mes siguiente sigue cayendo en su línea, una sola vez.
  assert.equal(e.meses.filter((m) => m.label.startsWith('ago')).length, 1)
})
