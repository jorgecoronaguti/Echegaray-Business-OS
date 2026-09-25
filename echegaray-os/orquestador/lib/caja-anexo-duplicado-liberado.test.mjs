import test from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_HOY } from './columnas-caja.fixture.mjs'
import { bloqueTrazabilidad } from './caja-anexo-controles.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'
import { CONTROLES, decisionesDe } from './decisiones-hallazgos.mjs'

// EL DEFECTO QUE ATRAPA (auditoría del 10/09/2026, hallazgo #10).
//
// El dueño escribió el 13/08 «no es duplicado» sobre el par de LA ESTRELLA del 13/06 —Cobranzas 39 y
// 40, $10.000.000 cada una— y la decisión quedó cargada en `decisiones-del-dueno.json`. La pestaña
// Cobranzas la respeta en su marca por fila; `_CAJA_ANEXO`!E74 no la miraba y le seguía restando
// $10.000.000 al efectivo explicado en CADA corrida del pipeline.
//
// La fórmula NO se copia acá: se toma la que escribe el generador y se EVALÚA con las dos filas
// reales. Un test de cadena habría pasado con la mitad de la resta puesta.

const HOY = new Date(Date.UTC(2026, 8, 10))
const DIA_13_06 = new Date(Date.UTC(2026, 5, 13))
const DIA_17_07 = new Date(Date.UTC(2026, 6, 17))

/** Las dos filas reales del par liberado, más un par que el dueño NUNCA revisó. */
function cobranzas({ conParDeControl = true } = {}) {
  const h = {}
  const fila = (n, cliente, monto, fecha) => {
    h[`G${n}`] = cliente; h[`M${n}`] = monto
    h[`N${n}`] = 'Efectivo'; h[`O${n}`] = 'Cobrado'; h[`Q${n}`] = fecha
  }
  fila(39, 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 10000000, DIA_13_06)
  fila(40, 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', 10000000, DIA_13_06)
  if (conParDeControl) {
    fila(50, 'SAN FRANCISCO', 16200000, DIA_17_07)
    fila(54, 'SAN FRANCISCO', 16200000, DIA_17_07)
  }
  h.G400 = ''  // el rango llega hasta la 400 aunque no haya dato
  return h
}

// A7 MIDE DE CONTEO A CONTEO desde el 25/09/2026: la ventana (01/06 → 10/09) abarca los dos pares.
const VENTANA = { anterior: { valor: 0, dia: 46174 }, actual: { valor: 0, dia: 46275 } }

function terminoDuplicado(opciones) {
  const rows = []
  const h = { rows, refs: { columnas: COLUMNAS_HOY }, conteos: VENTANA, get n() { return rows.length }, push(r) { rows.push(r); return rows.length } }
  bloqueTrazabilidad(h, opciones)
  const f = rows.find((r) => String(r[0]).includes('DOS VECES'))
  assert.ok(f, 'el bloque A7 tiene el término de cobros cargados dos veces')
  // Las dos fechas de la ventana viven en la F del propio anexo: van como celdas de la hoja actual.
  const celdas = {}
  rows.forEach((r, i) => { if (typeof r[5] === 'number') celdas[`F${i + 1}`] = r[5] })
  return { formula: f[4], celdas }
}

const evaluar = ({ formula, celdas }, hoja) => evaluarFormula(formula, { hoja: celdas, hojas: { Cobranzas: hoja }, hoy: HOY })

test('el par que el dueño ya revisó NO le resta plata al efectivo explicado', () => {
  const vigentes = decisionesDe(CONTROLES.cobroDuplicado, { hoy: '2026-09-10' })
  assert.ok(vigentes.some((d) => Number(d.forma.fila) === 39), 'el registro sigue teniendo la decisión de la fila 39')
  const conDecision = evaluar(terminoDuplicado(), cobranzas({ conParDeControl: false }))
  assert.equal(conDecision, 0, 'con la decisión del dueño, el par de LA ESTRELLA no se resta')
})

test('SIN la decisión del dueño el mismo par resta $10.000.000 — el control puede dar rojo', () => {
  const sinDecision = evaluar(terminoDuplicado({ yaRevisados: [] }), cobranzas({ conParDeControl: false }))
  assert.equal(sinDecision, 10000000, 'sin decisión cargada, el par vuelve a restar entero')
})

test('liberar el par de LA ESTRELLA no apaga el control: otro par indistinguible sigue restando', () => {
  const conAmbos = evaluar(terminoDuplicado(), cobranzas())
  assert.equal(conAmbos, 16200000, 'el par de SAN FRANCISCO, que nadie revisó, se sigue restando entero')
})

test('si la fila 39 deja de ser el cobro que el dueño miró, la resta vuelve sola', () => {
  // El renglón se corrió: la 39 ahora es otro cliente. El ancla de la decisión no se cumple.
  const h = cobranzas({ conParDeControl: false })
  h.G39 = 'OTRO CLIENTE SA'
  h.G40 = 'OTRO CLIENTE SA'
  assert.equal(evaluar(terminoDuplicado(), h), 10000000, 'sin el ancla, el par vuelve a restar')
})
