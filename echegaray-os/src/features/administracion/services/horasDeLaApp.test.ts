// «HS PAGAS» Y «COBRA TOTAL» SALEN DE LAS HORAS DEL CUADRO, NO DEL ESPEJO DE JORNALES.
//
// Dueño, 14/09/2026: *«esta mal las hs q considera liq hs, parece q no estan leyendo del mismo cuadro
// de hs en supabase, arreglar»*. Medido en la quincena del 01/09: las celdas de Quiroga Alexander
// suman 88 h y el cobra publicado era $371.250 = 75 h × $4.950, las 75 h de la planilla, que llega
// hasta el 10/09 y no tiene el 11/09 corregido a mano en la web.
//
// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que el cobra de JORNALES pise horas × $/h en una quincena abierta (el defecto medido).
//  2. Que la jornada automática `web:presencia-defecto` se pague (Rosales: 70 h en vez de 62).
//  3. Que una licencia paga no se pague (Quiroga A.: 44 h en vez de 88).
//  4. Que la diferencia con la planilla desaparezca en vez de quedar como referencia.
//  5. Que la fila deje de cerrar al cambiar el cobra: el efectivo de la planilla no puede quedar.
//  6. Que lo escrito a mano deje de ganar, o que una quincena cerrada o un mensual cambien.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarOverrides, sinOverrides } from './liquidacionOverrides.ts'
import { horasDeQuincena, liquidarLinea, type RegistroDeQuincena } from './liquidacionQuincena.ts'
import { quincenaDe } from './quincena.ts'
import { cierreDeLaFila } from './cuadroDeJornales.ts'
import { referenciaDeJornales } from '../components/liquidacion/cuadro/estadoDelPago.ts'

const q = quincenaDe('2026-09-01')

const fila = (fecha: string, horas: number, tipo_hora: string, fuente: string, extra: Partial<RegistroDeQuincena> = {}): RegistroDeQuincena => ({
  fecha, horas, tipo_hora, fuente_legacy: fuente, actualizado_por: null, notas: null, ...extra,
})

/** Quiroga Alexander, `registros_hh` del 01 al 11/09/2026 tal como están en la base. */
const QUIROGA_A: RegistroDeQuincena[] = [
  ...['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-07'].map((f) =>
    fila(f, 9, 'licencia', 'sheet:jornales', { notas: 'enfermedad' })),
  fila('2026-09-04', 8, 'licencia', 'sheet:jornales', { notas: 'enfermedad' }),
  fila('2026-09-08', 9, 'normal', 'web:asistencia-obra'),
  fila('2026-09-09', 9, 'normal', 'web:asistencia-obra'),
  fila('2026-09-10', 13, 'normal', 'web:asistencia-obra', { actualizado_por: 'dueño' }),
  fila('2026-09-11', 13, 'normal', 'web:correccion-horas', { actualizado_por: 'dueño' }),
]
const ESPEJO_QUIROGA_A = { horas: 75, cobra: 371250, adelanto: null, yaTransferido: null, porBanco: null, enEfectivo: 371250 }

const lineaDe = (registros: RegistroDeQuincena[], valorHora: number, extra: Partial<Parameters<typeof liquidarLinea>[0]> = {}) =>
  liquidarLinea({
    personaId: 'p', nombre: 'x', horas: horasDeQuincena(q, registros).horas,
    tarifa: { valorHora, netoMensual: null, desde: '2026-09-01', origen: 'test' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false, ...extra,
  }, 'obreros')

test('Quiroga A.: 88 h de las celdas y $435.600; JORNALES 75 h queda sólo como referencia', () => {
  const l = aplicarOverrides(lineaDe(QUIROGA_A, 4950), {}, 'obreros', ESPEJO_QUIROGA_A)
  assert.equal(l.horas, 88, 'licencias pagas 44 h + trabajadas 44 h')
  assert.equal(l.cobra, 435600, '88 × $4.950, no el $371.250 de la planilla')
  assert.equal(l.origen.cobra, 'calculado')
  assert.equal(l.enEfectivo, 435600, 'el efectivo de la planilla no manda: la fila cierra con el cobra nuevo')
  assert.deepEqual(l.referenciaJornales, { horas: 75, cobra: 371250, enEfectivo: 371250, difiere: true })
  const ref = referenciaDeJornales(l)
  assert.equal(ref?.titulo, 'JORNALES: 75 h · $371.250')
  assert.equal(ref?.tituloEfectivo, 'JORNALES: efectivo $371.250')
})

test('Rosales: 62 h de `sheet:jornales` + 8 h de presencia-defecto → 62 h y sin marca', () => {
  const regs = [
    ...['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-08', '2026-09-09', '2026-09-10'].map((f) => fila(f, 9, 'normal', 'sheet:jornales')),
    fila('2026-09-04', 8, 'normal', 'sheet:jornales'),
    fila('2026-09-11', 8, 'normal', 'web:presencia-defecto'),
  ]
  const l = aplicarOverrides(lineaDe(regs, 5874), {}, 'obreros', { horas: 62, cobra: 364188, enEfectivo: 364188 })
  assert.equal(l.horas, 62)
  assert.equal(l.cobra, 364188)
  assert.equal(l.referenciaJornales?.difiere, false)
  assert.equal(referenciaDeJornales(l), null, 'si coincide no hay marca')
})

test('lo escrito a mano en liquidacion_linea gana sobre la app y sobre JORNALES', () => {
  const base = lineaDe(QUIROGA_A, 4950)
  const c = aplicarOverrides(base, { cobra: 400000 }, 'obreros', ESPEJO_QUIROGA_A)
  assert.equal(c.cobra, 400000)
  assert.equal(c.origen.cobra, 'manual')
  const h = aplicarOverrides(base, { horas: 80 }, 'obreros', ESPEJO_QUIROGA_A)
  assert.equal(h.horas, 80)
  assert.equal(h.cobra, 396000, '80 × $4.950')
})

test('la fila cierra: cobra − adelanto − ya transferido = banco + efectivo', () => {
  const base = lineaDe(QUIROGA_A, 4950, { reciboNeto: 200000, giroEnElLote: true })
  // Adelanto y transferido de JORNALES siguen mandando sobre lo calculado; el efectivo de la planilla, no.
  const l = aplicarOverrides(base, {}, 'obreros', { ...ESPEJO_QUIROGA_A, adelanto: 30000, yaTransferido: 50000, enEfectivo: 291250 })
  assert.equal(l.adelanto, 30000)
  assert.equal(l.origen.adelanto, 'jornales')
  assert.equal(l.porBanco, 200000, 'sigue saliendo del recibo girado')
  assert.equal(l.enEfectivo, 435600 - 30000 - 50000 - 200000)
  assert.equal(cierreDeLaFila(l)?.cierra, true)
})

test('una quincena cerrada no cambia: la foto sellada no recibe ni app ni JORNALES', () => {
  const base = liquidarLinea({
    personaId: 'p', nombre: 'x', horas: 75,
    tarifa: { valorHora: 4950, netoMensual: null, desde: '2026-09-01', origen: 'liquidacion_linea sellada' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'obreros')
  const l = sinOverrides(base)
  assert.equal(l.horas, 75)
  assert.equal(l.cobra, 371250)
  assert.equal(l.referenciaJornales, null)
})

test('un mensual no cambia: su cobra sigue con la precedencia de siempre', () => {
  const ofi = liquidarLinea({
    personaId: 'm', nombre: 'Maldonado', horas: 80,
    tarifa: { valorHora: null, netoMensual: 1800000, desde: '2026-09-01', origen: 'test' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'oficina')
  const l = aplicarOverrides(ofi, {}, 'oficina', { cobra: 1750000 })
  assert.equal(l.cobra, 1750000)
  assert.equal(l.origen.cobra, 'jornales')
  assert.equal(l.referenciaJornales, null)
})
