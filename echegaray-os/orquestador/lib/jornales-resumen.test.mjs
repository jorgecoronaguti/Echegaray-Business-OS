// EL CONTROL DEL RESUMEN, PROBADO POR LA RUTA DE PRODUCCION Y CON LA FORMA REAL DE LA PLANILLA.
//
// Todo lo de acá entra por `detectarBloques` + `trabajadoresDeBloque`, y las filas de resumen tienen
// la forma que las desmintió: el rótulo en V, UNA COLUMNA VACIA en el medio, y el SUMIFS en X. Con
// el rótulo pegado a la fórmula, la versión que miraba "la celda de al lado" pasaba en verde.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarBloques } from './jornales-estructura.mjs'
import {
  auditarResumenPorCliente, celdaDelCriterio, argumentosDeSumifs, limiteDelBloque,
} from './jornales-resumen.mjs'
import { planilla, MAPA } from './jornales-fixture-por-obra.mjs'

const FECHAS = ['17/8', '18/8', '19/8']

/** Una quincena con dos clientes cargados: LA ESTRELLA y MESSINA (26 h × $ 6.200 cada uno). */
function quincena(p) {
  p.bloque(FECHAS)
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.persona({ nombre: 'Aguero Cristian', horas: [9, 9, 8], vh: 6200, cliente: 'MESSINA', obra: 'BASES' })
}

const auditarPrimero = (g, extra = {}) => {
  const bloques = detectarBloques(g, { anio: 2026 })
  return auditarResumenPorCliente(g, bloques[0], { bloques, mapa: MAPA, ...extra })
}

// ───────────────── D3 · LA CELDA DEL CRITERIO, PROBADA DIRECTO ─────────────────

test('celdaDelCriterio lee la celda que el SUMIFS usa como criterio, no la de al lado', () => {
  // La fórmula del archivo real. El rótulo vive en V552 y la fórmula en X552.
  const f = '=SUMIFS(AA527:AA544;AB527:AB544;V552)'
  assert.deepEqual(celdaDelCriterio(f), { fila1: 552, col: 21 })
  assert.deepEqual(celdaDelCriterio(f, { letraCriterio: 'AB' }), { fila1: 552, col: 21 })
  assert.equal(celdaDelCriterio(f, { letraCriterio: 'ZZ' }), null, 'ese par no existe: no se agarra otro de rebote')
})

test('celdaDelCriterio con varios pares elige el del cliente, no el ultimo', () => {
  const f = '=SUMIFS(AA1:AA20;AB1:AB20;V30;AC1:AC20;"GALPON 9")'
  assert.deepEqual(celdaDelCriterio(f, { letraCriterio: 'AB' }), { fila1: 30, col: 21 })
  assert.deepEqual(celdaDelCriterio(f, { letraCriterio: 'AC' }), { literal: 'GALPON 9' })
})

test('un criterio que no es una referencia ni un literal no se adivina', () => {
  assert.equal(celdaDelCriterio('=SUMIFS(AA1:AA20;AB1:AB20;V1&"S")'), null)
  assert.equal(celdaDelCriterio('=SUM(AA1:AA20)'), null)
  assert.equal(celdaDelCriterio(''), null)
})

// ───────────────── D9 · UN SUMIFS ENVUELTO EN IFERROR ─────────────────

test('los argumentos salen del SUMIFS, no del parentesis de afuera', () => {
  assert.deepEqual(argumentosDeSumifs('=SUMIFS(AA1:AA20;AB1:AB20;V21)'), ['AA1:AA20', 'AB1:AB20', 'V21'])
  // Con el parentesis externo, el ultimo argumento es "0" y la fila se salteaba informando limpio.
  assert.deepEqual(argumentosDeSumifs('=IFERROR(SUMIFS(AA1:AA20;AB1:AB20;V21);0)'), ['AA1:AA20', 'AB1:AB20', 'V21'])
  assert.equal(argumentosDeSumifs('=SUMIFS(AA1:AA20;AB1:AB20;V21'), null, 'parentesis sin cerrar: no se entiende')
})

test('una fila de resumen envuelta en IFERROR se lee igual que una pelada', () => {
  const p = planilla()
  quincena(p)
  p.resumen({ rotulo: 'LA ESTRELLA', envuelto: true })
  p.resumen({ rotulo: 'MESSINAS', envuelto: true })
  const a = auditarPrimero(p.grid())
  assert.equal(a.rotulos.length, 2, 'las dos filas se leyeron')
  assert.deepEqual(a.noLegibles, [])
  assert.deepEqual(a.erroresDeRotulo.map((e) => e.rotulo), ['MESSINAS'])
})

// ───────────────── EL DEFECTO REAL, POR LA RUTA DE PRODUCCION ─────────────────

test('el control encuentra el rotulo mal escrito que da cero para siempre, con su plata', () => {
  const p = planilla()
  quincena(p)
  p.resumen({ rotulo: 'LA ESTRELLA' })
  p.resumen({ rotulo: 'MESSINAS' }) // las filas dicen MESSINA: la formula devuelve $ 0,00
  const a = auditarPrimero(p.grid())

  assert.equal(a.verificable, true)
  assert.equal(a.rotulos.length, 2)
  assert.deepEqual(a.erroresDeRotulo.map((e) => e.rotulo), ['MESSINAS'])
  assert.equal(a.erroresDeRotulo[0].cliente, 'MESSINA')
  assert.deepEqual(a.erroresDeRotulo[0].rotuloEnFilas, ['MESSINA'])
  assert.equal(a.erroresDeRotulo[0].jornalEscondido, 26 * 6200, 'la plata que la formula no suma')
  assert.deepEqual(a.sinActividad, [])
  assert.deepEqual(a.huerfanos, [])
  assert.ok(a.faltantes.some((f) => f.rotulo === 'MESSINA'), 'MESSINA esta cargado y el resumen no lo busca')
})

test('el mismo control da limpio cuando el resumen esta bien: puede decir que si y que no', () => {
  const p = planilla()
  quincena(p)
  p.resumen({ rotulo: 'LA ESTRELLA' })
  p.resumen({ rotulo: 'MESSINA' })
  const a = auditarPrimero(p.grid())
  assert.deepEqual(a.erroresDeRotulo, [])
  assert.deepEqual(a.sinActividad, [])
  assert.deepEqual(a.huerfanos, [])
  assert.deepEqual(a.faltantes, [])
})

test('un cliente cargado sin fila en el resumen sale como faltante, con su plata', () => {
  // El otro defecto real: QUATTROPANI tenia personas cargadas y ninguna fila que lo sumara.
  const p = planilla()
  quincena(p)
  p.resumen({ rotulo: 'LA ESTRELLA' })
  const a = auditarPrimero(p.grid())
  assert.deepEqual(a.faltantes.map((f) => f.rotulo), ['MESSINA'])
  assert.equal(a.faltantes[0].jornal, 26 * 6200)
})

// ───────────────── D7 · EL DEFECTO Y EL ESTADO NO SON LO MISMO ─────────────────

test('un cliente bien escrito sin nadie trabajando es un estado, no un hallazgo', () => {
  const p = planilla()
  quincena(p)
  p.resumen({ rotulo: 'LA ESTRELLA' })
  p.resumen({ rotulo: 'MESSINA' })
  p.resumen({ rotulo: 'ARCOR' })     // bien escrito, nadie trabajo: la planilla esta bien
  p.resumen({ rotulo: 'MESSINAS' })  // mal escrito con plata arriba: la planilla esta mal
  const a = auditarPrimero(p.grid())
  assert.deepEqual(a.sinActividad.map((s) => s.rotulo), ['ARCOR'])
  assert.deepEqual(a.erroresDeRotulo.map((e) => e.rotulo), ['MESSINAS'])
  assert.deepEqual(a.huerfanos, [], 'los dos casos quedaron clasificados')
})

test('sin mapa leido nada se clasifica y se dice que no es verificable', () => {
  const p = planilla()
  quincena(p)
  p.resumen({ rotulo: 'ARCOR' })
  const bloques = detectarBloques(p.grid(), { anio: 2026 })
  const a = auditarResumenPorCliente(p.grid(), bloques[0], { bloques, mapa: { leido: false } })
  assert.equal(a.verificable, false)
  assert.deepEqual(a.erroresDeRotulo, [])
  assert.deepEqual(a.sinActividad, [], 'sin mapa NO se puede afirmar que un cliente no tuvo actividad')
  assert.deepEqual(a.huerfanos.map((h) => h.rotulo), ['ARCOR'])
})

// ───────────────── D2 · EL RANGO LEIDO NO ARRANCA EN A1 ─────────────────

test('con el rango desplazado el control ve exactamente lo mismo', () => {
  // Medido antes del arreglo: con offset.fila = 0 detectaba MESSINAS; con offset.fila = 400,
  // rotulos:[] huerfanos:[] sobre la MISMA planilla rota.
  const p = planilla({ offsetFila: 400, offsetCol: 1 })
  quincena(p)
  p.resumen({ rotulo: 'LA ESTRELLA' })
  const filaMessinas = p.resumen({ rotulo: 'MESSINAS' })
  const a = auditarPrimero(p.grid())

  assert.equal(a.rotulos.length, 2)
  assert.deepEqual(a.erroresDeRotulo.map((e) => e.rotulo), ['MESSINAS'])
  // Y las coordenadas que informa son las de la HOJA, que es donde el dueño va a mirar.
  const messinas = a.rotulos.find((r) => r.rotulo === 'MESSINAS')
  assert.equal(messinas.fila, filaMessinas)
  assert.equal(messinas.columna, 'V')
  assert.equal(messinas.formulaEn, `X${filaMessinas}`)
  assert.equal(filaMessinas, 405, 'la fila de la hoja, no el indice de la grilla')
})

// ───────────────── D6 · UNA QUINCENA POR VEZ ─────────────────

test('auditar una quincena no lee los resumenes de las de abajo', () => {
  // Medido antes del arreglo: auditar la primera de dos quincenas reportaba HUERFANOS:[QUATTROPANI],
  // que es cliente de la segunda y esta perfectamente cargado ahi.
  const p = planilla()
  quincena(p)
  p.resumen({ rotulo: 'LA ESTRELLA' })
  p.resumen({ rotulo: 'MESSINA' })
  p.bloque(['1/9', '2/9', '3/9'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'QUATTROPANI', obra: 'SALON' })
  p.resumen({ rotulo: 'QUATTROPANI' })
  const a = auditarPrimero(p.grid())

  assert.deepEqual(a.rotulos.map((r) => r.rotulo), ['LA ESTRELLA', 'MESSINA'])
  assert.deepEqual(a.erroresDeRotulo, [])
  assert.deepEqual(a.sinActividad, [])
  assert.deepEqual(a.huerfanos, [])
  assert.deepEqual(a.faltantes, [])
})

test('sin limite el control se niega a correr: no adivina donde termina el bloque', () => {
  const p = planilla()
  quincena(p)
  const g = p.grid()
  const b = detectarBloques(g, { anio: 2026 })[0]
  assert.throws(() => auditarResumenPorCliente(g, b, { mapa: MAPA }), /limite del bloque/)
  assert.equal(limiteDelBloque(g, b, { hastaFila: 2 }), 2)
  assert.equal(limiteDelBloque(g, b, { bloques: [b] }), g.filas.length, 'ultimo bloque: hasta el final')
})
