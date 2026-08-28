// ¿ENTRA EL TITULAR? — el control que reproduce el número cortado y prueba que puede volver a gritar.
//
// LA REGLA DEL REPO: todo control que puede dar verde necesita un test negativo que lo ponga en rojo
// con una mutación mínima. Acá la mutación es el layout viejo —la glosa en la celda de al lado, que le
// dejaba al importe una sola columna de 95 px— y tiene que reproducir exactamente el defecto que el
// dueño vio en el PDF.

import test from 'node:test'
import assert from 'node:assert/strict'
import { auditarHero, anchoDeSlot, anchoEnPx, PADDING_CELDA, IMPORTE_MAS_LARGO } from './cash-flow-hero-cabe.mjs'
import { ANCHOS } from './cash-flow-piel-matriz.mjs'
import { grillaMeses, ROTULOS_HERO } from './cash-flow-meses.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { FILA } from './cash-flow-matriz.mjs'

/** Los anchos que la piel escribe: la columna del concepto, las de tiempo y la del TOTAL. */
const anchoCol = (cols) => (c) => {
  if (c === 0) return ANCHOS.concepto
  if (c === cols - 1) return ANCHOS.total
  return ANCHOS.tiempo
}

/** El cuerpo con el que la piel escribe cada línea del hero (`formatoHero`). */
const CUERPO = { rotulo: 9, valor: 12, nota: 9 }

/**
 * Las piezas del titular tal como quedan en la grilla, con el importe más largo en lugar de la
 * fórmula. Una fórmula no se puede medir: lo que se mide es lo que Sheets va a mostrar.
 */
function piezasDe(meta, filas, { importe = IMPORTE_MAS_LARGO } = {}) {
  const texto = (fila, col) => String((filas[fila - 1] || [])[col] ?? '')
  const out = []
  meta.hero.slots.forEach((s, i) => {
    out.push({ slot: i, pieza: 'rotulo', texto: texto(meta.hero.rotulo, s), tamano: CUERPO.rotulo, negrita: true })
    out.push({ slot: i, pieza: 'valor', texto: importe, tamano: CUERPO.valor, negrita: true })
    const glosa = texto(meta.hero.nota, s)
    // Las glosas que son fórmula se miden por su parte literal más larga; las de texto, enteras.
    if (glosa && !glosa.startsWith('=')) out.push({ slot: i, pieza: 'nota', texto: glosa, tamano: CUERPO.nota })
  })
  return out
}

test('LA MUTACIÓN QUE REPRODUCE EL DEFECTO: con la glosa en la celda de al lado, el número no entra', () => {
  // El layout viejo le daba al importe UNA columna de 95 px, porque la glosa ocupaba la de al lado.
  const unaColumna = ANCHOS.tiempo - PADDING_CELDA
  const medido = anchoEnPx('$839.552.440', { tamano: 12, negrita: true })
  assert.ok(medido > unaColumna,
    `"$839.552.440" mide ${Math.round(medido)} px y la columna daba ${unaColumna}: por eso el PDF mostraba "$839.552.44("`)
  // Y el control lo dice con la magnitud, no con un booleano.
  const r = auditarHero({
    slots: [0, 3, 7, 11],
    cols: 14,
    // El ancho de UN slot cuando la celda de al lado está ocupada: se corta en su propia columna.
    anchoCol: anchoCol(14),
    piezas: [{ slot: 1, pieza: 'valor', texto: '$839.552.440', tamano: 12, negrita: true }],
  })
  // Con el layout NUEVO el mismo importe entra: el slot 1 son cuatro columnas de 95.
  assert.equal(r.ok, true, 'con el bloque entero detrás, la cifra de nueve dígitos entra holgada')
  assert.ok(r.medidas[0].disponiblePx >= 374, JSON.stringify(r.medidas[0]))
})

test('EL CONTROL PUEDE DAR ROJO: un slot angosto lo pone en rojo con los píxeles que faltan', () => {
  const r = auditarHero({
    slots: [0, 1, 2, 3],
    cols: 4,
    anchoCol: () => ANCHOS.tiempo, // cada slot, una sola columna de 95 px: el layout viejo
    piezas: [{ slot: 1, pieza: 'valor', texto: IMPORTE_MAS_LARGO, tamano: 12, negrita: true }],
  })
  assert.equal(r.ok, false, 'un control que no puede decir que no es una constante disfrazada')
  assert.equal(r.desbordes.length, 1)
  assert.equal(r.desbordes[0].disponiblePx, 89)
  assert.ok(r.desbordes[0].sobraPx > 50, `faltaban ${r.desbordes[0].sobraPx} px y el control tiene que decirlo`)
})

test('EL MENSUAL: el titular entero entra, con un importe de diez dígitos y el paréntesis del negativo', () => {
  const { filas, meta } = grillaMeses({ anio: 2026, refs: { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO' } })
  const cols = meta.footprint.cols
  const r = auditarHero({ slots: meta.hero.slots, cols, anchoCol: anchoCol(cols), piezas: piezasDe(meta, filas) })
  assert.equal(r.ok, true, JSON.stringify(r.desbordes, null, 2))
  // Y la glosa vive una fila DEBAJO del número, no al lado: es lo que le devuelve el ancho al importe.
  assert.equal(meta.hero.nota, FILA.heroNota)
  assert.equal(meta.hero.nota, meta.hero.valor + 1)
  assert.equal(meta.hero.nota, meta.cab.fila - 1, 'la glosa ocupa la fila que antes era el aire')
  // Ninguna celda a la derecha del número está ocupada en su propia fila: sin eso, el desborde no sirve.
  for (const s of meta.hero.slots) {
    assert.equal((filas[meta.hero.valor - 1] || [])[s + 1] ?? '', '',
      `la celda a la derecha del importe del slot ${s + 1} volvió a ocuparse: el número se corta otra vez`)
  }
})

test('EL SEMANAL: el mismo titular, la misma medida — las dos vistas comparten la geometría', () => {
  const { filas, meta } = grillaSemanal({
    hoy: new Date('2026-08-13T00:00:00Z'), anio: 2026,
    refs: { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' },
  })
  const cols = meta.footprint.cols
  const r = auditarHero({ slots: meta.hero.slots, cols, anchoCol: anchoCol(cols), piezas: piezasDe(meta, filas) })
  assert.equal(r.ok, true, JSON.stringify(r.desbordes, null, 2))
  assert.equal(meta.hero.nota, FILA.heroNota)
  for (const s of meta.hero.slots) {
    assert.equal((filas[meta.hero.valor - 1] || [])[s + 1] ?? '', '', `slot ${s + 1}: la celda de al lado se ocupó`)
  }
})

test('los rótulos del titular del Mensual también se miden: uno largo empujaría al de al lado', () => {
  const cols = 14
  const piezas = Object.entries(ROTULOS_HERO).map(([k, texto], i) => ({
    slot: i % 4, pieza: k, texto, tamano: /Nota$/.test(k) ? CUERPO.nota : CUERPO.rotulo, negrita: !/Nota$/.test(k),
  }))
  assert.equal(auditarHero({ slots: [0, 3, 7, 11], cols, anchoCol: anchoCol(cols), piezas }).ok, true)
  // El slot más angosto es el último (L+M+N = 300 px menos el padding): es el que manda.
  assert.equal(anchoDeSlot([0, 3, 7, 11], 3, anchoCol(cols), cols), 294)
})
