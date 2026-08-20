// EL QUINTO CUADRANTE: LA CELDA QUE YA DICE EXACTAMENTE LO QUE VOY A ESCRIBIR.
//
// Cada test de acá prueba un DEFECTO que ya pasó, no el código que lo cura. Si se saca el camino
// `selladas` de `aplicarHuella`, (a) y (b) se ponen rojos; si ese camino se afloja —si deja de exigir
// `filaProbadaMia`, o si compara por FORMA en vez de por contenido exacto— se ponen rojos (c) y (d),
// que son los que cuidan el número del dueño.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarHuella, claveCelda, huellasDeEscritura, MIN_COMPARABLES } from './huella-celda.mjs'
import { fusionar } from './preservar-anotaciones.mjs'
import { preservarNoVacias } from './no-borrar.mjs'

/** Lo que queda EN LA PESTAÑA — la cadena entera, no el paso del medio. Igual que en huella-celda.test. */
const enLaPestana = (grid, hoy) => preservarNoVacias(hoy, fusionar(grid, hoy)).values

/** El mapa como lo devuelve `leerHuellas`, a partir de la grilla que el OS dejó escrita. */
const huellasDe = (grid, opts = {}) =>
  new Map(huellasDeEscritura(grid, opts).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))

/** Relleno con formas DISTINTAS entre sí, para que la alineación sea un juicio y no una casualidad. */
const lastre = (n = MIN_COMPARABLES + 2) =>
  Array.from({ length: n }, (_, k) => [`Ancla ${'abcdefghijklmnopqrstuvwxyz'[k % 26]} de control`])

const LASTRE = lastre().length          // 10 filas → los seis renglones viven en 11..16
const F0 = LASTRE + 1
const COL_D = 3

// Los seis renglones reales de "Posteriores al CONTEO" (_CAJA_ANEXO D14:D19), con la forma exacta con
// que `caja-anexo.mjs` los empuja: D en literal `0`, E y F en `''` (no son del generador), G el origen.
const ROTULOS = [
  '      · (+) cobrado en efectivo — desde el conteo',
  '      · (−) pagado en efectivo — desde el conteo',
  '      · (−) jornales pagados en efectivo — desde el conteo',
  '      · (−) sueldos de OFICINA en efectivo — desde el conteo',
  '      · (+) extraído del banco — desde el conteo',
  '      · (−) depositado en el banco — desde el conteo',
]
const seisRenglones = (d = 0) => ROTULOS.map((r, k) => [
  r, 'ARS', `=SUMIFS(_MOVIMIENTOS!$C$2:$C;_MOVIMIENTOS!$A$2:$A;">"&$F$${17 + k})`, d, '', '',
  `de dónde sale el renglón ${'uno dos tres cuatro cinco seis'.split(' ')[k]}`,
])

/**
 * El estado REAL leído en `sheet_huella_celda` el 17/08: las filas 14..19 de `_CAJA_ANEXO` tienen
 * huella en A, B, C y G — y NINGUNA en D. Esas seis celdas se escribieron a mano con bisturí en una
 * sesión anterior, así que el generador nunca selló esa coordenada.
 */
const huellasSinLaD = (quiero) => {
  const h = huellasDe(quiero)
  for (let f = F0; f < F0 + ROTULOS.length; f++) h.delete(claveCelda(f, COL_D))
  return h
}

test('(a) EL EMPATE: los seis sellos por renglón quedaban bloqueados PARA SIEMPRE', () => {
  const quiero = [...lastre(), ...seisRenglones(0)]
  const huellas = huellasSinLaD(quiero)
  const hoy = quiero.map((f) => [...f])          // la pestaña ya dice `0` en D14:D19
  const r = aplicarHuella(quiero, hoy, huellas)

  assert.equal(r.alineacion.alineada, true, r.alineacion.motivo)
  assert.deepEqual(r.ajenas, [],
    'los seis sellos se leen como celdas del dueño: es el "✋ D14 nunca fue mía" que se repite en cada corrida')
  assert.equal(r.selladas.length, 6, 'las seis celdas tienen que reconocerse como mías')
  assert.deepEqual(r.selladas.map((s) => s.fila), [11, 12, 13, 14, 15, 16])
  assert.ok(r.selladas.every((s) => s.col === COL_D))
  // La pestaña queda IDÉNTICA — que es lo que hace admisible este camino: no hay nada que destruir.
  assert.deepEqual(enLaPestana(r.grid, hoy), enLaPestana(quiero, hoy))
})

test('(b) Y LA PRUEBA DEL DEFECTO: sin sellar la huella, el sello NUEVO no llega nunca a la pestaña', () => {
  const quiero = [...lastre(), ...seisRenglones(0)]
  const hoy = quiero.map((f) => [...f])
  // CORRIDA 1: el empate. El portón sella la huella con la grilla que sale de acá (`aEscribir`).
  const r1 = aplicarHuella(quiero, hoy, huellasSinLaD(quiero))
  const huellasSelladas = huellasDe(r1.grid)
  assert.ok(huellasSelladas.has(claveCelda(F0, COL_D)),
    'la corrida del empate no sella huella en D: el bloqueo se realimenta y no se sale nunca')

  // CORRIDA 2: el dueño cargó un conteo nuevo y el sello por renglón ya no vale 0. Con la celda
  // congelada, la resta C−D publica un "movido desde el sello" calculado contra un sello viejo.
  const enLaPestana1 = enLaPestana(r1.grid, hoy)
  const nuevo = [...lastre(), ...seisRenglones(8234758)]
  const r2 = aplicarHuella(nuevo, enLaPestana1, huellasSelladas)
  assert.equal(r2.alineacion.alineada, true, r2.alineacion.motivo)
  assert.equal(Number(enLaPestana(r2.grid, enLaPestana1)[F0 - 1][COL_D]), 8234758,
    'el sello por renglón nuevo no llegó a D: la pestaña sigue restando contra el sello viejo')
})

test('(c) UN NÚMERO DEL DUEÑO EN UNA FILA QUE NO ESTÁ PROBADA MÍA NO SE TOCA, AUNQUE COINCIDA', () => {
  const quiero = [...lastre(), ...seisRenglones(0)]
  const huellas = huellasSinLaD(quiero)
  // La primera de las seis es una fila NUEVA del layout: el generador todavía no probó ni una celda
  // suya ahí. Lo que el dueño tipeó en D coincide con el `0` que el generador va a escribir hoy.
  for (const col of [0, 1, 2, 6]) huellas.delete(claveCelda(F0, col))
  const hoy = quiero.map((f) => [...f])

  const r = aplicarHuella(quiero, hoy, huellas)
  assert.equal(r.alineacion.alineada, true, r.alineacion.motivo)
  assert.deepEqual(r.selladas.map((s) => s.fila), [12, 13, 14, 15, 16],
    'la fila sin anclas se reclamó igual: la coincidencia sola le compró la celda al dueño')
  assert.ok(r.ajenas.some((a) => a.col === COL_D && a.fila === F0), 'la celda sigue siendo del dueño')
  // LO QUE DE VERDAD IMPORTA: no se sella huella, así que la corrida SIGUIENTE tampoco puede pisarla.
  assert.equal(huellasDe(r.grid).has(claveCelda(F0, COL_D)), false,
    'se selló huella sobre un número del dueño: desde mañana el generador se lo pisa con lo que calcule')
})

test('(d) y si el contenido NO es idéntico, la celda sigue siendo del dueño aunque la fila sea mía', () => {
  // Misma fila probada mía que en (a) —A, B, C y G selladas— pero el dueño tipeó OTRO número en D.
  // Pisarlo sería exactamente la pérdida que este archivo existe para impedir.
  const quiero = [...lastre(), ...seisRenglones(0)]
  const huellas = huellasSinLaD(quiero)
  const hoy = quiero.map((f, i) => (i === F0 - 1 ? f.map((c, j) => (j === COL_D ? 12000000 : c)) : [...f]))

  const r = aplicarHuella(quiero, hoy, huellas)
  assert.deepEqual(r.selladas.map((s) => s.fila), [12, 13, 14, 15, 16], 'la celda con otro número no es un empate')
  assert.ok(r.ajenas.some((a) => a.col === COL_D && a.fila === F0))
  assert.equal(Number(enLaPestana(r.grid, hoy)[F0 - 1][COL_D]), 12000000, 'el número del dueño tiene que sobrevivir')
  assert.equal(huellasDe(r.grid).has(claveCelda(F0, COL_D)), false)
})
