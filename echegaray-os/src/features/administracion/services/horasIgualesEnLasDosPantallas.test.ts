// LAS HORAS DE «HORAS» Y LAS DE LIQUIDACIÓN SON LA MISMA CUENTA (dueño, 14/09/2026).
//
// Textual: *«seguis sin arreglar el tema de hs q aparece en liq hs al de la seccion hs, tiene q ser la
// misma porque en supabase debe estar igual»*. Las dos leen `registros_hh` y sumaban distinto: Horas
// contaba la jornada `web:presencia-defecto` y Liquidación la excluía (Agüero 89 contra 72), y
// Liquidación además mostraba las horas con el coeficiente de extras.
//
// Decisión del dueño: los días completados por la app CUENTAN EN LAS DOS; las licencias pagas SUMAN EN
// LAS DOS. Las horas que se muestran son horas cargadas; el coeficiente de extras se aplica sólo a la
// plata (horas equivalentes).
//
// INVARIANTE: el total por persona de Horas es igual a la columna Horas de Liquidación.
// MUTACIONES QUE LO PONEN ROJO: excluir presencia-defecto en una sola pantalla; no sumar la licencia en
// Horas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarQuincenaPorObra, type RegistroQuincena } from './quincenaPorObra.ts'
import { horasDeQuincena, liquidarLinea, type RegistroDeQuincena } from './liquidacionQuincena.ts'
import { horasDelDia } from './liquidacionDeAusencias.ts'
import { aplicarOverrides } from './liquidacionOverrides.ts'
import { quincenaDe } from './quincena.ts'

const q = quincenaDe('2026-09-01')
const DIAS = Array.from({ length: 15 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)

type Fila = RegistroQuincena & RegistroDeQuincena
const fila = (fecha: string, horas: number, tipo_hora: string, extra: Partial<Fila> = {}): Fila => ({
  persona_id: 'p', obra_id: 'obra-a', fecha, horas, tipo_hora, notas: null,
  fuente_legacy: 'sheet:jornales', actualizado_por: null, ...extra,
})

/** Una quincena con cada caso que separaba a las dos pantallas. */
const REGISTROS: Fila[] = [
  fila('2026-09-01', 9, 'normal'),
  // Dos obras el mismo día: suman.
  fila('2026-09-02', 5, 'normal'),
  fila('2026-09-02', 3.8, 'normal', { obra_id: 'obra-b' }),
  // Extra con fórmula de JORNALES: se ven 7 h, se pagan 8,5.
  fila('2026-09-03', 4, 'normal', { notas: 'JORNALES · extras =4+3*1,5' }),
  fila('2026-09-03', 3, 'extra_50', { notas: 'JORNALES · extras =4+3*1,5' }),
  // Licencia paga (enfermedad), sin obra: suma.
  fila('2026-09-04', 8, 'licencia', { obra_id: null, notas: 'enfermedad' }),
  // Ausencia que no paga: 0.
  fila('2026-09-07', 9, 'ausencia', { obra_id: null, notas: 'falta_sin_aviso' }),
  // Día completado por la app, que nadie tocó: cuenta.
  fila('2026-09-08', 8, 'normal', { fuente_legacy: 'web:presencia-defecto', actualizado_por: null }),
]

const totalDeHoras = (): number | null => armarQuincenaPorObra({
  asignaciones: [], registros: REGISTROS,
  obras: { 'obra-a': { id: 'obra-a', nombre: 'A', cliente: null }, 'obra-b': { id: 'obra-b', nombre: 'B', cliente: null } },
  dias: DIAS, personas: { p: { nombre: 'P', nota: null } }, hoy: '2026-09-15',
})[0]?.horas ?? null

test('INVARIANTE: el total por persona de Horas es la columna Horas de Liquidación', () => {
  const liq = horasDeQuincena(q, REGISTROS)
  const linea = aplicarOverrides(liquidarLinea({
    personaId: 'p', nombre: 'P', horas: liq.horas, horasEquivalentes: liq.horasEquivalentes,
    tarifa: { valorHora: 5000, netoMensual: null, desde: '2026-09-01', origen: 't' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'obreros'), {}, 'obreros')
  // 9 + (5 + 3,8) + (4 + 3) + 8 licencia + 0 ausencia + 8 presencia-defecto
  assert.equal(totalDeHoras(), 40.8, 'Horas: cargadas, con licencia paga y día completado por la app')
  assert.equal(liq.horas, 40.8, 'Liquidación: las mismas horas')
  assert.equal(linea.horas, totalDeHoras(), 'la columna Horas del cuadro es el total de Horas')
})

test('LA PLATA USA HORAS EQUIVALENTES: la extra al 1,5 se paga, pero no cambia las horas mostradas', () => {
  const liq = horasDeQuincena(q, REGISTROS)
  assert.equal(liq.horasEquivalentes, 42.3, '40,8 + 3 × 0,5')
  assert.deepEqual(liq.extras, [{ coeficiente: 1.5, horas: 3 }])
  const l = liquidarLinea({
    personaId: 'p', nombre: 'P', horas: liq.horas, horasEquivalentes: liq.horasEquivalentes,
    tarifa: { valorHora: 5000, netoMensual: null, desde: '2026-09-01', origen: 't' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'obreros')
  assert.equal(l.horas, 40.8)
  assert.equal(l.cobra, 211500, '42,3 × 5.000')
})

test('UN DÍA: presencia-defecto cuenta, licencia paga suma, ausencia vale 0, lo trabajado gana', () => {
  assert.deepEqual(horasDelDia([fila('2026-09-08', 8, 'normal', { fuente_legacy: 'web:presencia-defecto' })]),
    { horas: 8, equivalentes: 8, extras: [] })
  assert.equal(horasDelDia([fila('2026-09-04', 8, 'licencia', { notas: 'enfermedad' })]).horas, 8)
  assert.equal(horasDelDia([fila('2026-09-07', 9, 'ausencia', { notas: 'falta_sin_aviso' })]).horas, 0)
  // Lo trabajado gana a la licencia declarada el mismo día, y dos declaraciones no se suman.
  assert.equal(horasDelDia([fila('d', 6, 'normal'), fila('d', 9, 'licencia', { notas: 'enfermedad' })]).horas, 6)
  assert.equal(horasDelDia([fila('d', 9, 'licencia', { notas: 'enfermedad' }), fila('d', 9, 'licencia', { notas: 'enfermedad' })]).horas, 9)
})
