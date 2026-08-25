import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PADDING_CANON, PISO_COLUMNA, PISO_NOMBRE, anchoMinimoDeGrilla, pistasDe,
} from './ancho-minimo.ts'

// EL DEFECTO QUE ATRAPA ESTE ARCHIVO: que una tabla del canon vuelva a reservar menos ancho del que
// necesita para decir el dato, y el teléfono corte el nombre sin avisar.
//
// El caso que lo motivó, medido a 390×844 el 25/08/2026: `/clientes` mostraba «B» donde dice
// «Messina» y `/presupuestos` escribía «PRESUPUESTOCLIENTE» en el encabezado. Si alguien baja
// `PISO_NOMBRE`, cambia la cuenta del reparto proporcional por una suma columna a columna, o hace
// que un `minmax(0, 1.6fr)` cuente como cero, los tests de «lo que le toca al nombre» se ponen rojos.

/** Lo que la grilla le da REALMENTE a cada columna cuando mide exactamente su ancho mínimo. */
function reparto(cols: string): number[] {
  const ancho = anchoMinimoDeGrilla(cols)
  const pistas = pistasDe(cols)
  const fr = pistas.map((p) => Number(/([\d.]+)fr/.exec(p)?.[1] ?? 0))
  const px = pistas.map((p, i) => (fr[i] ? 0 : Number(/^(\d+(?:\.\d+)?)px$/.exec(p)?.[1] ?? 0)))
  const sumaFr = fr.reduce((t, f) => t + f, 0)
  const pozo = ancho - PADDING_CANON * 2 - 10 * (pistas.length - 1) - px.reduce((t, v) => t + v, 0)
  return pistas.map((_, i) => (fr[i] ? (pozo * fr[i]) / sumaFr : px[i]))
}

test('pistasDe no rompe adentro de un minmax()', () => {
  assert.deepEqual(
    pistasDe('minmax(0,1.6fr) minmax(0, 1.1fr) 128px 26px'),
    // El espacio de adentro del `minmax` sobrevive —la pista NO se parte ahí— y `medir()` lo limpia.
    ['minmax(0,1.6fr)', 'minmax(0, 1.1fr)', '128px', '26px'],
  )
  assert.equal(anchoMinimoDeGrilla('minmax(0, 1.1fr) 26px'), anchoMinimoDeGrilla('minmax(0,1.1fr) 26px'))
  assert.deepEqual(pistasDe(''), [])
  // Sin columnas no hay ancho que reservar: un padding suelto sería un mínimo inventado.
  assert.equal(anchoMinimoDeGrilla(''), 0)
})

test('las columnas en px entran enteras: son inelásticas', () => {
  // Tres columnas fijas, dos gaps, dos paddings. Ninguna fracción que repartir.
  assert.equal(anchoMinimoDeGrilla('100px 50px 26px'), 100 + 50 + 26 + 10 * 2 + 14 * 2)
})

test('minmax(160px, 1fr) declara su propio piso y ese número gana', () => {
  // Quien escribe un mínimo en px ya midió esa columna: no se le impone PISO_NOMBRE encima.
  assert.equal(anchoMinimoDeGrilla('minmax(200px,1fr) 26px'), 200 + 26 + 10 + 14 * 2)
})

test('14 · Presupuestos Cartera: al nombre le tocan ≥160px y a CLIENTE ≥120px', () => {
  const COLS = 'minmax(0,1.6fr) minmax(0,1.1fr) 128px 106px 84px 52px 56px 26px'
  const [presupuesto, cliente, estado] = reparto(COLS)
  assert.ok(presupuesto >= PISO_NOMBRE, `PRESUPUESTO se queda con ${presupuesto}px`)
  assert.ok(cliente >= PISO_COLUMNA, `CLIENTE se queda con ${cliente}px`)
  // ESTADO es px fijo: mide lo del mockup, no lo que sobra.
  assert.equal(estado, 128)
  // Y el ancho total NO alcanza para 390: por eso la caja tiene que scrollear por dentro.
  assert.ok(anchoMinimoDeGrilla(COLS) > 390)
})

test('15 · Presupuesto Edición: PARTIDA no se solapa con CANT.', () => {
  const [partida] = reparto('minmax(0,1.9fr) 44px 84px 80px 80px 116px 116px 60px')
  assert.ok(partida >= PISO_NOMBRE, `PARTIDA se queda con ${partida}px`)
})

test('19 · Personal Cartera: PERSONA no cae a una letra, con o sin pulso', () => {
  const BASE = 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.3fr)'
  for (const cols of [`${BASE} 148px 82px 76px 26px`, `${BASE} 96px 110px 26px`, `${BASE} 26px`]) {
    const [persona, oficio, obra] = reparto(cols)
    assert.ok(persona >= PISO_NOMBRE, `PERSONA se queda con ${persona}px en «${cols}»`)
    // OFICIO / CATEGORÍA es la de menor `fr`: es la primera que se queda sin aire.
    assert.ok(oficio >= PISO_COLUMNA, `OFICIO se queda con ${oficio}px en «${cols}»`)
    assert.ok(obra >= PISO_COLUMNA, `OBRA se queda con ${obra}px en «${cols}»`)
  }
})

test('25 · Clientes Cartera: el nombre del cliente llega a 160px en las dos geometrías', () => {
  for (const cols of ['minmax(0,1.5fr) minmax(0,1.2fr) 60px 120px 26px', 'minmax(0,1.5fr) minmax(0,1.2fr) 60px 26px']) {
    const [cliente, obras] = reparto(cols)
    assert.ok(cliente >= PISO_NOMBRE, `CLIENTE se queda con ${cliente}px en «${cols}»`)
    assert.ok(obras >= PISO_COLUMNA, `la segunda columna se queda con ${obras}px en «${cols}»`)
  }
})

test('el piso se reparte en PROPORCIÓN, no sumando 160 + 120 por columna', () => {
  // Dos fracciones muy desparejas: 1fr y 3fr. Sumar los pisos daría 280 + 10 + 28 = 318 y el reparto
  // real dejaría la chica en 72px. La cuenta correcta agranda el pozo hasta que la chica llega a 120.
  const cols = 'minmax(0,3fr) minmax(0,1fr)'
  const [grande, chica] = reparto(cols)
  assert.ok(anchoMinimoDeGrilla(cols) > PISO_NOMBRE + PISO_COLUMNA + 10 + 28)
  assert.ok(chica >= PISO_COLUMNA, `la columna chica se queda con ${chica}px`)
  assert.ok(grande >= PISO_NOMBRE, `la columna grande se queda con ${grande}px`)
})

test('una pista que no se puede medir sin navegador se trata como flexible, no como cero', () => {
  // `auto` reservando 0 es exactamente el defecto original con otro nombre.
  assert.ok(anchoMinimoDeGrilla('auto 26px') >= PISO_NOMBRE)
})
