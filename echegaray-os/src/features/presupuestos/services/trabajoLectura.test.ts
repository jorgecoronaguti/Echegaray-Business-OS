// EL TRABAJO DE LECTURA — los defectos que este módulo tiene que atrapar.
//
// 1. UN IMPORTE SIN PRECIO SE VUELVE CERO. `pieDePaso` y `certezaMonetaria` tienen que decir
//    "sin cotizar"/"sin importe", nunca sumar `0` como si fuera un dato.
// 2. EL PASO EN CONFLICTO SE CUENTA COMO FIRME. Un ítem con precio que vive en un paso `conflicto`
//    tiene que caer en DISPUTA, no en FIRME — aunque el ítem en sí no tenga ninguna marca propia.
// 3. EL FILTRO POR PASO NO FILTRA (bug clásico de comparar por índice en vez de por id).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  certezaMonetaria, filtrarComputo, formatoMillones, formatoNumero, formatoPesos,
  pctSobreCostoDirecto, pieDePaso, progresoDeLectura,
  type Computo, type PasoTrabajo,
} from './trabajoLectura.ts'

function paso(over: Partial<PasoTrabajo> = {}): PasoTrabajo {
  return {
    id: 'p2', etiqueta: '2', titulo: 'Bases', pregunta: '¿cuántas bases?', estado: 'firme',
    resumen: '18 bases', columnas: { a: 'A', b: 'B', c: 'C', d: 'D' }, filas: [],
    evidencia: 'B-01', supuesto: null, faltan: [],
    deriva: { partidas: 3, importe: 1_200_000, sinCotizar: 0 },
    ...over,
  }
}

test('formatoNumero/Pesos/Millones: null nunca es cero', () => {
  assert.equal(formatoNumero(null), null)
  assert.equal(formatoPesos(null), null)
  assert.equal(formatoMillones(null), null)
  assert.equal(formatoNumero(1284), '1.284')
  assert.equal(formatoPesos(392000), '$392.000')
  assert.equal(formatoMillones(1_200_000), '$1,2M')
})

test('pieDePaso: sin partidas dice "no genera partida", nunca $0', () => {
  assert.equal(pieDePaso(paso({ deriva: { partidas: 0, importe: null, sinCotizar: 0 } })), 'no genera partida')
})

test('pieDePaso: partidas sin precio dicen "sin importe", no inventan una cifra', () => {
  const texto = pieDePaso(paso({ deriva: { partidas: 2, importe: null, sinCotizar: 2 } }))
  assert.equal(texto, '→ 2 partidas · sin importe')
})

test('pieDePaso: una sola partida usa singular', () => {
  assert.equal(pieDePaso(paso({ deriva: { partidas: 1, importe: 500_000, sinCotizar: 0 } })), '→ 1 partida · $0,5M')
})

test('certezaMonetaria: un ítem sin precio no suma nada a firme ni a disputa — cuenta aparte', () => {
  const computo: Computo = {
    grupos: [{
      pasoId: 'p2', rotulo: 'PASO 2', titulo: 'Bases', subtotal: null,
      items: [{ d: 'Muertos de anclaje', c: null, u: 'un', p: null, imp: null }],
    }],
  }
  const c = certezaMonetaria([paso({ estado: 'sin dato' })], computo)
  assert.equal(c.firme, null)
  assert.equal(c.disputa, null)
  assert.equal(c.sinCotizar, 1)
})

test('DEFECTO 2 — un ítem con precio en un paso EN CONFLICTO cae en disputa, no en firme', () => {
  const computo: Computo = {
    grupos: [{
      pasoId: 'p4', rotulo: 'PASO 3', titulo: 'Arriostramiento', subtotal: 468_000,
      items: [{ d: 'Hormigón en arriostramiento', c: 4.8, u: 'm³', p: 468_000 / 4.8, imp: 468_000 }],
    }],
  }
  const c = certezaMonetaria([paso({ id: 'p4', estado: 'conflicto' })], computo)
  // Cero real (no hay ítem firme) ≠ sin dato (no hay ítems). El único `null` legítimo es cuando
  // no hay NADA computado — acá sí hay computado, y lo firme de eso es genuinamente cero.
  assert.equal(c.firme, 0)
  assert.equal(c.disputa, 468_000)
  assert.equal(c.pctDisputa, 100)
})

test('certezaMonetaria: firme y disputa conviven — el % de la barra suma sobre el total real', () => {
  const computo: Computo = {
    grupos: [
      { pasoId: 'p2', rotulo: 'PASO 2', titulo: 'Bases', subtotal: 300, items: [{ d: 'a', c: 1, u: 'm³', p: 300, imp: 300 }] },
      { pasoId: 'p4', rotulo: 'PASO 3', titulo: 'Vigas', subtotal: 100, items: [{ d: 'b', c: 1, u: 'm³', p: 100, imp: 100 }] },
    ],
  }
  const c = certezaMonetaria([paso({ id: 'p2', estado: 'firme' }), paso({ id: 'p4', estado: 'conflicto' })], computo)
  assert.equal(c.firme, 300)
  assert.equal(c.disputa, 100)
  assert.equal(c.pctFirme, 75)
  assert.equal(c.pctDisputa, 25)
})

test('DEFECTO 3 — filtrarComputo por pasoId, no por posición', () => {
  const computo: Computo = {
    grupos: [
      { pasoId: 'p1', rotulo: 'PASO 1', titulo: 'Superficies', subtotal: 10, items: [] },
      { pasoId: 'p2', rotulo: 'PASO 2', titulo: 'Bases', subtotal: 20, items: [] },
    ],
  }
  assert.equal(filtrarComputo(computo, null).length, 2)
  const filtrado = filtrarComputo(computo, 'p2')
  assert.equal(filtrado.length, 1)
  assert.equal(filtrado[0].pasoId, 'p2')
  assert.deepEqual(filtrarComputo(computo, 'x-inexistente'), [])
})

test('pctSobreCostoDirecto se deriva de dos números reales, nunca una tasa fija', () => {
  assert.equal(pctSobreCostoDirecto(1_000_000, 270_000), '27 %')
  assert.equal(pctSobreCostoDirecto(0, 100), null)
})

test('progresoDeLectura: "paso N de 7" no pasa de 7 aunque lleguen más pasos', () => {
  assert.equal(progresoDeLectura(3).texto, 'paso 3 de 7')
  assert.equal(progresoDeLectura(3).pctAncho, 43)
  assert.equal(progresoDeLectura(9).texto, 'paso 7 de 7')
  assert.equal(progresoDeLectura(7).completo, true)
})
