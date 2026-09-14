// EL CUADRO DE LA QUINCENA: horas por tipo, totales que recortan con el filtro y el historial del
// valor hora. Todo puro, sin base.
//
// MUTACIONES CORRIDAS EL 14/09/2026 (respaldo, mutación, test dirigido, restauración):
//   · `extra_50` sumado a `normales` en `horasPorTipo`            → rojo acá (dos tests)
//   · % de aumento contra la PRIMERA tarifa (`??=`)                → rojo acá
//   · el pie de la vista sobre `filas` en vez de `visibles`       → rojo en solapaQuincena.test.ts
//   · la acción de tarifa con `.upsert(` en vez de `.insert(`     → rojo en solapaQuincena.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formaEditable, historialDeTarifa, horasPorTipo, pctDeAumento, sumarHorasPorTipo,
} from './cuadroDeJornales.ts'
import { filasDelEspejo, totalesDelEspejo, type DatosDelEspejo } from './espejoDeJornales.ts'
import { quincenaDe } from './quincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

test('horasPorTipo separa normales, extra 50 y extra 100; ausencia y licencia no son trabajadas', () => {
  const h = horasPorTipo([
    { tipo_hora: 'normal', horas: '8.8' },
    { tipo_hora: 'normal', horas: 9 },
    { tipo_hora: 'extra_50', horas: '2' },
    { tipo_hora: 'extra_100', horas: 3.5 },
    { tipo_hora: 'licencia', horas: 9 },
    { tipo_hora: 'ausencia', horas: 9 },
    { tipo_hora: null, horas: 4 },
  ])
  assert.deepEqual(h, { normales: 17.8, extra50: 2, extra100: 3.5, total: 23.3 })
})

test('pctDeAumento: un decimal, y null cuando no hay contra qué medir (nunca 0)', () => {
  assert.equal(pctDeAumento(5000, 5500), 10)
  assert.equal(pctDeAumento(6000, 5700), -5)
  assert.equal(pctDeAumento(3000, 3100), 3.3)
  assert.equal(pctDeAumento(null, 5500), null)
  assert.equal(pctDeAumento(0, 5500), null)
})

test('historialDeTarifa: nuevo primero, % contra la ANTERIOR de la misma forma, básico a la fecha de cada fila', () => {
  const escalas = [
    { convenio: 'UOCRA', categoria: 'Oficial', desde: '2026-01-01', valorHora: 5000, fuente: 'acuerdo ene' },
    { convenio: 'UOCRA', categoria: 'Oficial', desde: '2026-08-01', valorHora: 5600, fuente: 'acuerdo ago' },
  ]
  const h = historialDeTarifa([
    { desde: '2026-09-01', valorHora: 6050, netoMensual: null, origen: 'web' },
    { desde: '2026-03-01', valorHora: 5000, netoMensual: null, origen: 'sheet:_J_OBREROS' },
    { desde: '2026-06-01', valorHora: 5500, netoMensual: null, origen: 'sheet:_J_OBREROS' },
  ], { convenio: 'UOCRA', categoria: 'oficial' }, escalas, '2026-08-15')

  assert.deepEqual(h.map((e) => e.desde), ['2026-09-01', '2026-06-01', '2026-03-01'])
  assert.deepEqual(h.map((e) => e.pctAumento), [10, 10, null])
  assert.deepEqual(h.map((e) => e.basico?.valorHora ?? null), [5600, 5000, 5000])
  // RIGE LA DE JUNIO PARA LA QUINCENA DEL 15/08: la de septiembre existe pero todavía no empezó.
  assert.deepEqual(h.map((e) => e.vigente), [false, true, false])
})

test('historialDeTarifa: pasar de $/h a neto mensual no es un aumento, y el mensual no lleva básico', () => {
  const h = historialDeTarifa([
    { desde: '2026-01-01', valorHora: 4000, netoMensual: null, origen: 'a' },
    { desde: '2026-05-01', valorHora: null, netoMensual: 1800000, origen: 'b' },
  ], { convenio: null, categoria: null }, [], '2026-09-01')
  assert.equal(h[0].forma, 'mensual')
  assert.equal(h[0].pctAumento, null)
  assert.equal(h[0].basico, null)
})

test('formaEditable: obreros $/h, oficina mensual, finales ninguna', () => {
  assert.equal(formaEditable('obreros'), 'hora')
  assert.equal(formaEditable('oficina'), 'mensual')
  assert.equal(formaEditable('final'), null)
})

const linea = (personaId: string): LineaConOverrides => ({
  personaId, nombre: personaId, horas: 17, valorHora: 5000, netoMensual: null, modalidad: 'hora',
  cobra: 85000, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 85000, total: 85000,
  efectivoRedondeado: null, sinTarifa: false, reciboNeto: null, blancoAcuerdo: null,
  efectivoAcuerdo: null, reciboSinGiro: false, origenTarifa: 'test',
  manual: {}, origen: {}, discrepancia: {},
} as unknown as LineaConOverrides)

test('el espejo trae alta, categoría y horas por tipo; el total por tipo recorta con las filas recibidas', () => {
  const quincena = quincenaDe('2026-09-01')
  const persona = (id: string, nombre: string) => ({
    id, nombre, valorHora: 5000, convenio: null, fechaIngreso: '2024-03-11', categoria: 'oficial',
  })
  const datos: DatosDelEspejo = {
    quincena,
    personas: [persona('a', 'AGUERO CRISTIAN'), persona('b', 'BRAVO JUAN')],
    registros: [
      { id: '1', persona_id: 'a', fecha: '2026-09-01', horas: 8, tipo_hora: 'normal' },
      { id: '2', persona_id: 'a', fecha: '2026-09-02', horas: 9, tipo_hora: 'normal' },
      { id: '3', persona_id: 'a', fecha: '2026-09-03', horas: 2, tipo_hora: 'extra_50' },
      { id: '4', persona_id: 'b', fecha: '2026-09-01', horas: 9, tipo_hora: 'normal' },
      { id: '5', persona_id: 'b', fecha: '2026-09-02', horas: 4, tipo_hora: 'extra_100' },
    ],
    presencias: [],
    lineas: { a: { grupo: 'obreros', linea: linea('a') }, b: { grupo: 'obreros', linea: linea('b') } },
    cuadrosCerrados: new Set(),
    horasDeLaPlanilla: new Map(),
    diasDeLaPlanilla: new Map(),
    hayEspejo: false,
    hoy: '2026-09-14',
  }
  const filas = filasDelEspejo(datos)
  const a = filas.find((f) => f.personaId === 'a')
  assert.ok(a)
  assert.equal(a.alta, '2024-03-11')
  assert.equal(a.categoria, 'oficial')
  assert.deepEqual(a.horasPorTipo, { normales: 17, extra50: 2, extra100: 0, total: 19 })

  assert.deepEqual(totalesDelEspejo(filas).horasPorTipo, { normales: 26, extra50: 2, extra100: 4, total: 32 })
  // EL DEFECTO: un pie que suma el plantel entero debajo de una sola fila filtrada.
  assert.deepEqual(totalesDelEspejo([a]).horasPorTipo, { normales: 17, extra50: 2, extra100: 0, total: 19 })
  assert.deepEqual(sumarHorasPorTipo([]), { normales: 0, extra50: 0, extra100: 0, total: 0 })
})
