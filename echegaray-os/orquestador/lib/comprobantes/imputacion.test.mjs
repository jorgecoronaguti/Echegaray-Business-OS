// LO ESCRITO A MANO → LA OBRA. Y, sobre todo, cuándo NO se resuelve.
//
// Cada test de acá tiene un defecto real detrás. El de arriba es el caso que originó todo: "Messinas
// BSA" escrito con birome sobre una factura de Corralón, que el bot no leyó y terminó preguntando
// por una obra que estaba escrita en el papel. Los de abajo son la contención: el arreglo no puede
// convertirse en un adivinador, porque imputar a la obra equivocada ensucia el margen de las dos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { imputacionDeAnotacion, matchUnico, tokens, difiereEnUno } from './imputacion.mjs'

/** El vocabulario REAL de Compras, leído del Sheet vivo el 03/08. */
const OBRAS = ['Administracion', 'Almacen', 'ARCOR', 'LA ESTRELLA', 'MESSINA', 'San Francisco', 'Taller']
const DETALLES = {
  MESSINA: ['Bases de Tanque', 'Combustible', 'Planta de BSA', 'Camion - BSA', 'Excavadora - BSA'],
  'LA ESTRELLA': ['Oficinas y Fabrica de Palitos', 'Mamposteria', 'Galpon 9'],
  'San Francisco': ['combustible', 'Obra', 'Sanitarios'],
}

// ── El caso que originó el arreglo ───────────────────────────────────────────

test('"Messinas BSA" —el plural de la letra del dueño— resuelve la obra MESSINA', () => {
  const r = imputacionDeAnotacion('Messinas BSA', { obras: OBRAS, detalles: DETALLES })
  assert.equal(r.obra, 'MESSINA')
})

test('el detalle de la columna K sale del vocabulario VIVO, no de un desplegable que no existe', () => {
  const r = imputacionDeAnotacion('Messinas Planta de BSA', { obras: OBRAS, detalles: DETALLES })
  assert.equal(r.obra, 'MESSINA')
  assert.equal(r.detalle, 'Planta de BSA')
})

test('"BSA" a secas resuelve la OBRA aunque no alcance para el detalle', () => {
  // "BSA" aparece en tres detalles de Compras y los tres son de MESSINA: la obra es inequívoca.
  // Cuál de los tres BSA es, no lo es — y ahí el OS se calla en vez de elegir.
  const r = imputacionDeAnotacion('BSA', { obras: OBRAS, detalles: DETALLES })
  assert.equal(r.obra, 'MESSINA')
  assert.equal(r.obraVia, 'detalle')
  assert.equal(r.detalle, null, 'tres detalles posibles no son un detalle')
})

test('un error de tipeo de una letra no rompe el match', () => {
  assert.equal(imputacionDeAnotacion('Mesina', { obras: OBRAS }).obra, 'MESSINA')
  assert.equal(imputacionDeAnotacion('la estrela', { obras: OBRAS }).obra, 'LA ESTRELLA')
})

// ── La contención: que esto NO se vuelva un adivinador ───────────────────────

test('una anotación AMBIGUA no elige: sigue preguntando', () => {
  const obras = ['MESSINA NORTE', 'MESSINA SUR']
  assert.equal(imputacionDeAnotacion('Messinas', { obras }).obra, null)
  // Y con el vocabulario de K: "Planta" está en dos obras distintas, así que no dice nada.
  const dos = { MESSINA: ['Planta de BSA'], ARCOR: ['Planta Nueva'] }
  assert.equal(imputacionDeAnotacion('Planta', { obras: OBRAS, detalles: dos }).obra, null)
})

test('sin anotación, o con una que no nombra nada, no se infiere ninguna obra', () => {
  for (const a of [null, '', '   ', 'pagado', 'entregado por Juan', 'x']) {
    assert.equal(imputacionDeAnotacion(a, { obras: OBRAS, detalles: DETALLES }).obra, null, `"${a}" no puede resolver una obra`)
  }
})

test('una diferencia de UNA letra no basta en palabras cortas: ahí es otra palabra', () => {
  // "sur" y "san" difieren en una letra y no son lo mismo. La tolerancia arranca en 5 caracteres.
  assert.equal(matchUnico('sur', ['san']), null)
  assert.equal(difiereEnUno('mesina', 'messina'), true)
  assert.equal(difiereEnUno('messina', 'messinas'), true)
  assert.equal(difiereEnUno('messina', 'mesinas'), false, 'dos diferencias ya no es un tipeo')
})

test('sin vocabulario no se afirma nada: una lista vacía nunca matchea', () => {
  assert.equal(matchUnico('MESSINA', []), null)
  assert.equal(imputacionDeAnotacion('MESSINA', {}).obra, null)
})

// ── Las piezas ───────────────────────────────────────────────────────────────

test('los tokens ignoran las palabras que no identifican, y guardan la forma sin plural', () => {
  const t = tokens('obra Planta de BSA pagado')
  assert.equal(t.has('de'), false)
  assert.equal(t.has('obra'), false, '"obra" está en todas las anotaciones: no identifica ninguna')
  assert.equal(t.has('pagado'), false)
  assert.deepEqual([...tokens('Messinas')].sort(), ['messina', 'messinas'])
})

test('la coincidencia EXACTA le gana a la parcial aunque la parcial matchee más', () => {
  const r = matchUnico('San Francisco', ['San Francisco', 'San Francisco II'])
  assert.equal(r.valor, 'San Francisco')
  assert.equal(r.via, 'exacta')
})
