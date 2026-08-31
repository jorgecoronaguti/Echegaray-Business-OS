// LA DoD TIENE QUE PODER DECIR QUE NO.
//
// Un control de cierre que siempre da verde es peor que no tenerlo: da permiso para mergear. Estos
// tests existen para probar las tres formas en que este control puede negarse —NO_CUMPLE, sin medir,
// y la excepción— y para fijar que lo que no se midió NUNCA cuenta como cumplido.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CRITERIOS, VEREDICTO, GLOBAL, evaluar, veredictoGlobal, correrDod } from './dod.mjs'

/** La evidencia de un sistema perfecto: los veinticuatro criterios medidos y en verde. */
const TODO_BIEN = {
  proyectosEntendidos: { distintos: 3, formatos: 5 },
  alcance: { partidasConEstado: 26, sinDecidir: 0 },
  computo: { cantidades: 26, conGenealogiaCompleta: 26 },
  mapeo: { mapeadas: 24, porParecidoTextualSinAtributos: 0 },
  composiciones: { resueltas: 26, incompletasQueCostaronCero: 0 },
  explosion: { recursos: 110, reconcilia: true },
  hh: { horas: 3697.7, confundeHhConDuracion: false },
  precios: { resueltosAutonomamente: 80, sinPrecioValorizadoEnCero: 0 },
  subcontratos: { total: 3, conAlcanceYVigencia: 3 },
  costoDirecto: { afirmadoEnCasos: 3 },
  indirectos: { conceptos: 7, separaCalculadoDeAplicado: true },
  comercial: { versionCitada: 'v3', congeladaNoCambiaConLaPolitica: true },
  precio: { coeficienteDerivado: true, coeficienteEscribible: false },
  incertidumbre: { noDeclarada: 0 },
  versionado: { congeladaEsInmutable: true, ofertaDerivaDeCongelada: true },
  aObra: { obrasConGenealogia: 2 },
  ejecucionReal: { relacionesEstablecidas: 140 },
  planVsReal: { comparaciones: 26, causasInventadas: 0 },
  candidatos: { generados: 9 },
  governance: { promovidos: 2, rechazadosPorGobernanza: 7 },
  reuso: { reutilizados: 2 },
  claudeZero: { llamadasLlm: 0, llegoAlFinal: true },
  generalizacion: { casosPass: 4, reglasTocadasParaQueCierren: 0 },
  auditoria: { veredicto: 'PASS', loFirmoQuienNoLoConstruyo: true },
}

test('DoD · con todo medido y en verde da PASS y 24/24', () => {
  const r = correrDod(TODO_BIEN)
  assert.equal(r.estado, GLOBAL.PASS)
  assert.equal(r.completas, '24/24')
  assert.equal(r.noCumple, 0)
  assert.equal(r.sinMedir, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS TRES NEGACIONES
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('DoD · UN solo criterio en rojo es FAIL — no se promedia', () => {
  // 23 de 24 en verde: 95,8%. No alcanza, y ése es el punto.
  const r = correrDod({ ...TODO_BIEN, costoDirecto: { afirmadoEnCasos: 0 } })
  assert.equal(r.estado, GLOBAL.FAIL)
  assert.equal(r.cumple, 23)
  assert.deepEqual(r.bloquean, ['#10 calcula costo directo'])
})

test('DoD · lo que no se midió es NO_VERIFICABLE, jamás CUMPLE', () => {
  const sinPrecios = Object.fromEntries(Object.entries(TODO_BIEN).filter(([k]) => k !== 'precios'))
  const r = correrDod(sinPrecios)
  const fila = r.filas.find((f) => f.id === 8)
  assert.equal(fila.veredicto, VEREDICTO.NO_VERIFICABLE)
  assert.notEqual(fila.veredicto, VEREDICTO.CUMPLE)
  // Y no suma al numerador: 23 de 24, no 24 de 24.
  assert.equal(r.completas, '23/24')
  assert.equal(r.estado, GLOBAL.PASS_CON_LIMITACIONES)
  assert.match(r.limitaciones[0], /#8 gestiona precios/)
})

test('DoD · una medición que se rompe es NO_VERIFICABLE, no un «no»', () => {
  const criterio = { id: 99, dice: 'el que explota', mide: 'x', exige: () => { throw new Error('se rompió el medidor') } }
  const fila = evaluar(criterio, { x: { algo: 1 } })
  assert.equal(fila.veredicto, VEREDICTO.NO_VERIFICABLE)
  assert.match(fila.porque, /se rompió el medidor/)
})

test('DoD · una evidencia presente pero vacía SÍ se evalúa y puede dar NO_CUMPLE', () => {
  // La diferencia con el test anterior: `{}` es una medición que dio cero, no una ausencia de
  // medición. Cero medido es un «no»; no medido es un «no sé». Confundirlos es el agujero.
  const fila = evaluar(CRITERIOS.find((c) => c.id === 17), { ejecucionReal: {} })
  assert.equal(fila.veredicto, VEREDICTO.NO_CUMPLE)
})

test('DoD · un criterio que devuelve algo verdadero-ish pero no true no cumple', () => {
  // `exige` debe devolver true. Un 1, un 'sí' o un objeto NO alcanzan: la comparación es estricta
  // justamente para que nadie cierre un criterio con un valor casual.
  const criterio = { id: 98, dice: 'el mentiroso', mide: 'x', exige: () => 1 }
  assert.equal(evaluar(criterio, { x: {} }).veredicto, VEREDICTO.NO_CUMPLE)
})

test('DoD · los veinticuatro criterios están y ninguno se repite', () => {
  assert.equal(CRITERIOS.length, 24)
  assert.equal(new Set(CRITERIOS.map((c) => c.id)).size, 24)
  assert.equal(new Set(CRITERIOS.map((c) => c.mide)).size, 24)
})

test('DoD · sin evidencia de nada, el veredicto es PASS_CON_LIMITACIONES con 0/24 — y eso NO es aprobar', () => {
  // El caso que más importa: correr la DoD sin haber medido nada no puede parecerse a un cierre.
  const r = correrDod({})
  assert.equal(r.completas, '0/24')
  assert.equal(r.sinMedir, 24)
  assert.equal(r.limitaciones.length, 24)
})

test('veredictoGlobal · FAIL gana sobre PASS_CON_LIMITACIONES cuando hay de los dos', () => {
  const r = veredictoGlobal([
    { id: 1, dice: 'a', veredicto: VEREDICTO.CUMPLE },
    { id: 2, dice: 'b', veredicto: VEREDICTO.NO_VERIFICABLE, porque: 'x' },
    { id: 3, dice: 'c', veredicto: VEREDICTO.NO_CUMPLE },
  ])
  assert.equal(r.estado, GLOBAL.FAIL)
})
