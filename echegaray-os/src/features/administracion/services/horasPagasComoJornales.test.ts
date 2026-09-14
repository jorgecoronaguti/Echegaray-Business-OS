// LAS HORAS QUE SE PAGAN, COMO LAS CALCULA LA PLANILLA JORNALES. Casos leídos de la base el 14/09/2026.
//
// Dueño, 14/09/2026: horas extra «Como lo hace JORNALES». La celda de la planilla es `=normal+extra*k`
// y lo que cobra es ese resultado × $/h. El importador (`orquestador/lib/jornales-a-registros-hh.mjs`,
// `partesDeCelda` / `parteExtra`) guarda la extra como cantidad y deja la fórmula en `notas`:
//
//   =4+3*1,5  → normal 4 + extra_50 3  «extras =4+3*1,5»                         → paga 8,5
//   =8+3*1,3  → normal 8 + extra_50 3  «extras =8+3*1,3 (coeficiente 1.3 …)»     → paga 11,9
//   =9+2      → normal 9 + extra_50 2  «extras =9+2 (recargo no declarado …)»    → paga 11
//
// Medido en la base: 11 filas con k=1,5, 6 con k=1,3 y 8 sin k. Hasta hoy la app pagaba las tres igual.
//
// Rosales Diego, 1ª de septiembre: la planilla dice 62 h y $364.188. La base tiene esas 62 h MÁS una
// jornada `web:presencia-defecto` de 8 h el 11/09. Hasta el 14/09/2026 no se pagaba; ese día el dueño
// decidió que los días completados por la app CUENTAN en Horas y en Liquidación: son 70 h.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { horasLiquidablesDelDia } from './liquidacionDeAusencias.ts'
import { horasDeQuincena, liquidarLinea } from './liquidacionQuincena.ts'
import { celdaDelDia } from './grillaHorasQuincena.ts'
import { quincenaDe } from './quincena.ts'

const NOTA = 'JORNALES Obreros 26 f38 · JAVIER SANCHEZ · obra por alias de cliente'

test('Agüero 17/01: =4+3*1,5 paga 8,5 h, no 7', () => {
  assert.equal(horasLiquidablesDelDia([
    { tipo_hora: 'normal', horas: '4', notas: NOTA },
    { tipo_hora: 'extra_50', horas: '3', notas: `${NOTA} · extras =4+3*1,5` },
  ]), 8.5)
})

test('coeficiente 1,3 de la planilla: =8+3*1,3 paga 11,9', () => {
  assert.equal(horasLiquidablesDelDia([
    { tipo_hora: 'normal', horas: 8, notas: NOTA },
    { tipo_hora: 'extra_50', horas: 3, notas: `${NOTA} · extras =8+3*1,3 (coeficiente 1.3 no es 1,5 ni 2)` },
  ]), 11.9)
})

test('sin coeficiente en la planilla: =9+2 paga 11, sin recargo inventado', () => {
  assert.equal(horasLiquidablesDelDia([
    { tipo_hora: 'normal', horas: 9, notas: NOTA },
    { tipo_hora: 'extra_50', horas: 2, notas: `${NOTA} · extras =9+2 (recargo no declarado en JORNALES)` },
  ]), 11)
})

test('extra cargada en la web, sin fórmula: el tipo dice el coeficiente (50% → 1,5 · 100% → 2)', () => {
  assert.equal(horasLiquidablesDelDia([{ tipo_hora: 'extra_50', horas: 2, notas: null }]), 3)
  assert.equal(horasLiquidablesDelDia([{ tipo_hora: 'extra_100', horas: 2, notas: null }]), 4)
})

// CAMBIÓ EL 14/09/2026: afirmaba que la jornada por defecto no se pagaba. Decisión del dueño: cuenta.
test('una jornada por defecto que nadie tocó CUENTA y se paga, y la celda la dibuja como horas', () => {
  const defecto = { tipo_hora: 'normal', horas: 8, notas: null, fuente_legacy: 'web:presencia-defecto', actualizado_por: null }
  assert.equal(horasLiquidablesDelDia([defecto]), 8)
  assert.equal(horasLiquidablesDelDia([{ ...defecto, actualizado_por: 'b1f0c2d4-0000-4000-8000-000000000001' }]), 8)
  const celda = celdaDelDia('2026-09-11', [{ ...defecto, fecha: '2026-09-11' }], undefined)
  assert.equal(celda.marca, 'horas')
  assert.equal(celda.horas, 8)
})

test('la celda del día muestra horas cargadas; la plata, equivalentes', () => {
  const dia = [
    { fecha: '2026-01-17', tipo_hora: 'normal', horas: '4', notas: NOTA },
    { fecha: '2026-01-17', tipo_hora: 'extra_50', horas: '3', notas: `${NOTA} · extras =4+3*1,5` },
  ]
  assert.equal(celdaDelDia('2026-01-17', dia, undefined).horas, 7, 'se ven 7 h cargadas')
  assert.equal(horasLiquidablesDelDia(dia), 8.5, 'se pagan 8,5')
})

const JORNALES = (fecha: string, horas: number) => ({
  fecha, horas, tipo_hora: 'normal', fuente_legacy: 'sheet:jornales', actualizado_por: null,
  notas: 'JORNALES Obreros 26 f571 · JAVIER SANCHEZ · Mamposteria',
})

// CAMBIÓ EL 14/09/2026: eran 62 h (sin la jornada completada por la app). Ahora cuenta: 70 h × $5.874.
test('Rosales Diego 01–15/09: 70 h y $411.180 — la jornada completada por la app cuenta', () => {
  const registros = [
    JORNALES('2026-09-01', 9), JORNALES('2026-09-02', 9), JORNALES('2026-09-03', 9), JORNALES('2026-09-04', 8),
    { fecha: '2026-09-07', horas: 0, tipo_hora: 'ausencia', fuente_legacy: 'sheet:jornales', actualizado_por: null, notas: null },
    JORNALES('2026-09-08', 9), JORNALES('2026-09-09', 9), JORNALES('2026-09-10', 9),
    { fecha: '2026-09-11', horas: 8, tipo_hora: 'normal', fuente_legacy: 'web:presencia-defecto', actualizado_por: null, notas: null },
  ]
  const h = horasDeQuincena(quincenaDe('2026-09-01'), registros)
  assert.equal(h.horas, 70)
  assert.equal(h.horasEquivalentes, 70)
  const linea = liquidarLinea({
    personaId: '4d0372ce-f299-4034-9c7f-846ddd0b8765', nombre: 'ROSALES DIEGO JOSE', horas: h.horas, horasEquivalentes: h.horasEquivalentes,
    tarifa: { valorHora: 5874, netoMensual: null, desde: '2026-08-16', origen: 'liquidacion_linea sellada' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'obreros')
  assert.equal(linea.cobra, 411180)
  assert.equal(linea.enEfectivo, 411180)
})
