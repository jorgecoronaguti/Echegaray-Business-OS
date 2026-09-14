// LOS PENDIENTES DEL CIERRE, CON UNA SOLA FUNCIÓN Y CON NOMBRE PROPIO.
//
// Hasta el 14/09/2026 «Horas» contaba «N días sin cargar» con `resumenDeGrilla` y «Cierre» no los
// contaba: el mismo día sin cargar trababa el botón de una pantalla y no el de la otra. Ahora los dos
// conteos salen de `estadoDeCierre`, alimentado por `pendientesPorPersona`, que usa el MISMO criterio
// de día que la fila de la grilla. Si alguien cambia uno sin el otro, el total deja de coincidir.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoDeCierre, type LineaParaCerrar } from './liquidacionCierre.ts'
import { filasDeGrilla, pendientesPorPersona, type FilaDeGrilla } from './grillaHorasQuincena.ts'
import { quincenaDe } from './quincena.ts'

const linea = (p: Partial<LineaParaCerrar> = {}): LineaParaCerrar => ({
  personaId: 'p1', nombre: 'Zogbe Fabian', horas: 97, valorHora: 3650, netoMensual: null,
  modalidad: 'hora', cobra: 354050, porBanco: 0, enEfectivo: 354050, total: 354050,
  sinTarifa: false, reciboSinGiro: false, ...p,
})

test('LOS DÍAS SIN CARGAR SON LOS MISMOS QUE CUENTA LA FILA DE LA GRILLA', () => {
  const q = quincenaDe('2026-09-01')
  const filas = filasDeGrilla({
    quincena: q,
    personas: [{ id: 'p1', nombre: 'Zogbe Fabian', valorHora: 3650, convenio: null }],
    registros: [], presencias: [],
    personaDeRegistro: () => 'p1', personaDePresencia: () => 'p1',
    hoy: '2026-09-08',
  })
  const porPersona = pendientesPorPersona(filas, '2026-09-08')
  assert.equal(porPersona.length, 1)
  assert.ok(filas[0].diasSinCargar > 0)
  assert.equal(porPersona[0].sinCargar.length, filas[0].diasSinCargar)
  // Un día que todavía no pasó no está sin cargar.
  assert.ok(porPersona[0].sinCargar.every((f) => f <= '2026-09-08'))
})

test('estadoDeCierre PUBLICA SIN CARGAR Y SIN MOTIVO, CON LAS PERSONAS Y SUS DÍAS, Y TRABA', () => {
  const fila = (id: string, nombre: string, celdas: FilaDeGrilla['celdas']): FilaDeGrilla => ({
    personaId: id, nombre, celdas, cargadas: 0, esperadas: 97, estado: 'al-dia',
    diasSinMotivo: 0, diasSinCargar: 0, horasDeLicencia: 0, esJefe: false,
  })
  const filas = [
    fila('p1', 'Zogbe Fabian', [
      { fecha: '2026-09-01', marca: 'ausencia', horas: 0, sinMotivo: true },
      { fecha: '2026-09-02', marca: 'sin-cargar', horas: null, sinMotivo: false },
    ]),
    fila('p2', 'Quiroga Ana', [{ fecha: '2026-09-01', marca: 'horas', horas: 9, sinMotivo: false }]),
  ]
  const e = estadoDeCierre([linea()], { porPersona: pendientesPorPersona(filas, '2026-09-08') })
  const motivo = e.pendientes.find((p) => p.clave === 'sin-motivo')
  const cargar = e.pendientes.find((p) => p.clave === 'sin-cargar')
  assert.equal(motivo?.cuantas, 1)
  assert.deepEqual(motivo?.personas, [{ personaId: 'p1', nombre: 'Zogbe Fabian', fechas: ['2026-09-01'] }])
  assert.equal(cargar?.cuantas, 1)
  assert.deepEqual(cargar?.personas, [{ personaId: 'p1', nombre: 'Zogbe Fabian', fechas: ['2026-09-02'] }])
  assert.equal(e.puedeCerrar, false)
})

test('SIN DETALLE POR PERSONA SE CONSERVA EL CONTEO DE SIEMPRE (la acción de cerrar no cambia)', () => {
  const e = estadoDeCierre([linea()], { diasSinMotivo: 3 })
  assert.equal(e.pendientes.find((p) => p.clave === 'sin-motivo')?.cuantas, 3)
  assert.equal(e.pendientes.some((p) => p.clave === 'sin-cargar'), false)
  assert.equal(estadoDeCierre([linea()]).puedeCerrar, true)
})
