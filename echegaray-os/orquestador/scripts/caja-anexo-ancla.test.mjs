// EL ANCLA SE REPONE CUANDO LA CELDA SE PIERDE — el defecto que dejó el automático apagado.
//
// EL CASO REAL: el rescate por rótulo del sello estuvo roto desde que existe (comparaba un rótulo
// recortado contra una constante con seis espacios de sangría), así que cada regeneración perdía el
// ancla. Y como sólo se re-estampaba al RENOVARSE el sello, el ancla no volvía nunca: con el sello
// vigente y la celda vacía, `IF(NOT(ISNUMBER(ancla));0;…)` deja el neto en 0 y la pestaña publica el
// conteo pelado. El automático apagado, sin un solo error a la vista.
//
// SIN RED: el cliente de Google es un doble que anota lo que le piden escribir. No toca el Sheet real.

import test from 'node:test'
import assert from 'node:assert/strict'
import { publicarFechaDelConteo, reanclar } from './caja-anexo-pestana.mjs'
import { instanteDelSello } from '../lib/caja-ancla-por-instante.mjs'
import { CONCEPTO } from '../lib/caja-conteo-centinela.mjs'
import { DESDE_CAJA } from '../lib/caja-anexo-nombres.mjs'

const dobleGoogle = () => {
  const escrituras = []
  return { escrituras, batchUpdateValues: async (_id, rangos) => escrituras.push(...rangos) }
}
const G = { fSello: 42 }
const ANCLA = instanteDelSello(new Date(2026, 7, 14, 16, 30, 0))

test('la celda vacía se repone con el ancla del centinela', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, NaN, ANCLA)
  assert.equal(g.escrituras.length, 1)
  assert.match(g.escrituras[0].range, /!F42$/)
  assert.equal(g.escrituras[0].values[0][0], ANCLA)
})

test('la celda en cero también: un 0 con formato de fecha se dibuja "30/12/1899"', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, 0, ANCLA)
  assert.equal(g.escrituras.length, 1, 'un 0 no es un instante, es una celda vacía con formato')
})

test('una celda que dice OTRO instante se corrige: manda el centinela, no la copia', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, ANCLA - 3, ANCLA)
  assert.equal(g.escrituras.length, 1)
  assert.equal(g.escrituras[0].values[0][0], ANCLA)
})

test('NO REESCRIBE CUANDO YA COINCIDE — el serial viaja como flotante', async () => {
  // Una comparación exacta reescribiría la celda en cada corrida: doce escrituras por día sobre una
  // pestaña, cada una con su chance de 429, para no cambiar nada.
  const g = dobleGoogle()
  await reanclar(g, G, ANCLA, ANCLA)
  await reanclar(g, G, ANCLA + 1e-9, ANCLA)
  assert.equal(g.escrituras.length, 0)
})

test('medio minuto de diferencia SÍ se corrige: la tolerancia es de un segundo, no de un rato', async () => {
  const g = dobleGoogle()
  await reanclar(g, G, ANCLA + 30 / 86400, ANCLA)
  assert.equal(g.escrituras.length, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA FECHA QUE VE EL DUEÑO EN `CAJA!D7` Y `D8` (16/08/2026)
//
// *"no completaste las fechas de saldos"*. Las dos filas de efectivo son el 40% del disponible y no
// decían de cuándo eran. La fecha la estampa esta corrida desde el centinela: acá se prueba que se
// estampan LAS DOS celdas, en la columna de fechas, y que sin conteo se escribe el vacío en vez de
// saltearse — si se salteara, una fecha vieja sobreviviría a un conteo borrado.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const G_FECHAS = { fSello: 42, fEstado: 43, fFechaArs: 50, fFechaUsd: 51, filas: [] }
const conConteos = (ars, usd) => {
  const escrituras = []
  return {
    escrituras,
    batchUpdateValues: async (_id, rangos) => escrituras.push(...rangos),
    readSheetValues: async (_id, rango) => [[rango === DESDE_CAJA.arqueoArs ? ars : usd]],
  }
}
/** El centinela, sin base: devuelve un día distinto por concepto para que no se puedan confundir. */
const dobleAncla = async (_id, concepto) => ({ dia: concepto === CONCEPTO.arqueoArs ? 46248 : 46239 })

test('LAS DOS FECHAS SE ESTAMPAN EN LA COLUMNA F, cada una en su renglón', async () => {
  const g = conConteos(12000000, 5000)
  await publicarFechaDelConteo(g, G_FECHAS, { ancla: dobleAncla })
  assert.deepEqual(g.escrituras.map((e) => e.range), ['_CAJA_ANEXO!F50', '_CAJA_ANEXO!F51'])
  assert.equal(g.escrituras[0].values[0][0], 46248, 'el conteo en pesos lleva SU día')
  assert.equal(g.escrituras[1].values[0][0], 46239, 'y el de dólares el suyo: no se comparten')
})

test('SIN CONTEO SE ESCRIBE EL VACÍO, y al centinela ni se le pregunta', async () => {
  // Es el estado de los dólares hoy (`CAJA_ARQUEO_USD` = 0). Una fecha sobre un conteo en cero afirma
  // un arqueo que no ocurrió; y `anclaDelConteo` TIRA sobre un conteo ilegible, así que preguntarle
  // igual abortaría también el estampado de la celda de pesos.
  const g = conConteos(12000000, 0)
  const ancla = async (_id, concepto, valor) => {
    assert.notEqual(concepto, CONCEPTO.arqueoUsd, 'no se le pide ancla a un conteo que no existe')
    assert.ok(valor > 0)
    return { dia: 46248 }
  }
  await publicarFechaDelConteo(g, G_FECHAS, { ancla })
  assert.equal(g.escrituras[1].range, '_CAJA_ANEXO!F51')
  assert.equal(g.escrituras[1].values[0][0], '', 'el vacío se escribe: si se salteara, una fecha vieja sobreviviría al conteo borrado')
})
