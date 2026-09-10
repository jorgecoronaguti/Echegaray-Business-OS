import test from 'node:test'
import assert from 'node:assert/strict'
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

function terminoDuplicado(opciones) {
  const rows = []
  const h = { rows, refs: {}, get n() { return rows.length }, push(r) { rows.push(r); return rows.length } }
  bloqueTrazabilidad(h, opciones)
  const f = rows.find((r) => String(r[0]).includes('DOS VECES'))
  assert.ok(f, 'el bloque A7 tiene el término de cobros cargados dos veces')
  return f[4]
}

const evaluar = (formula, hoja) => evaluarFormula(formula, { hojas: { Cobranzas: hoja }, hoy: HOY })

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
