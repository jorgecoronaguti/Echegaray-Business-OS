// EL CUADRO TIENE QUE SERVIR PARA CALCULAR.
//
// Dueño, 14/09/2026: *«no sé cuánto es el total que cobra cada persona»* y *«no puedo calcular nada
// de ahí que me sirva»*. La semántica de la cadena la fijó él el 01/09:
//
//   GANA (COBRA) − ADELANTO − YA TRANSFERIDO  =  LE FALTA PAGAR (TOTAL)  =  POR BANCO + EFECTIVO
//
// Si una fila no cierra —un override manual o de JORNALES que rompe la cuenta— se marca, no se esconde.
// Y el pie cierra igual, sobre las filas visibles.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cierreDeLaFila, cierreDeTotales } from './cuadroDeJornales.ts'
import { filasDelEspejo, totalesDelEspejo, type DatosDelEspejo } from './espejoDeJornales.ts'
import { quincenaDe } from './quincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

test('Rosales 16–31/08 (planilla): gana $552.156, le falta pagar $352.156 = banco $230.240,12 + efectivo $121.915,88', () => {
  const c = cierreDeLaFila({
    cobra: 552156, adelanto: 0, yaTransferido: 200000, porBanco: 230240.12, enEfectivo: 121915.88, total: 352156,
  })
  assert.deepEqual(c, { cierra: true, leFaltaPagar: 352156, diferencia: 0 })
})

test('una fila cuyo total no sale de gana − adelanto − ya transferido NO cierra, y dice por cuánto', () => {
  const c = cierreDeLaFila({
    cobra: 552156, adelanto: 0, yaTransferido: 200000, porBanco: 230240.12, enEfectivo: 169759.88, total: 400000,
  })
  assert.equal(c?.cierra, false)
  assert.equal(c?.diferencia, 47844)
})

test('sin COBRA no hay cierre que afirmar: null, nunca «cierra»', () => {
  assert.equal(cierreDeLaFila({ cobra: null, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: null, total: null }), null)
})

const linea = (personaId: string, l: Partial<LineaConOverrides>): LineaConOverrides => ({
  personaId, nombre: personaId, horas: 0, valorHora: 5874, netoMensual: null, modalidad: 'hora',
  cobra: 0, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 0, total: 0,
  efectivoRedondeado: null, sinTarifa: false, reciboNeto: null, blancoAcuerdo: null,
  efectivoAcuerdo: null, reciboSinGiro: false, origenTarifa: 'test',
  manual: {}, origen: {}, discrepancia: {}, ...l,
} as unknown as LineaConOverrides)

const JORNALES = (id: string, fecha: string, horas: number) => ({
  id, persona_id: 'r', fecha, horas, tipo_hora: 'normal', fuente_legacy: 'sheet:jornales', actualizado_por: null,
  notas: 'JORNALES Obreros 26 f571 · JAVIER SANCHEZ · Mamposteria',
})

function datosDeRosales(): DatosDelEspejo {
  return {
    quincena: quincenaDe('2026-09-01'),
    personas: [
      { id: 'r', nombre: 'ROSALES DIEGO JOSE', valorHora: 5874, convenio: null, fechaIngreso: '2024-08-12', categoria: 'oficial' },
      { id: 'a', nombre: 'AGUERO CRISTIAN', valorHora: 5974, convenio: null, fechaIngreso: '2025-05-26', categoria: 'oficial' },
    ],
    registros: [
      JORNALES('1', '2026-09-01', 9), JORNALES('2', '2026-09-02', 9), JORNALES('3', '2026-09-03', 9),
      JORNALES('4', '2026-09-04', 8), JORNALES('5', '2026-09-08', 9), JORNALES('6', '2026-09-09', 9),
      JORNALES('7', '2026-09-10', 9),
      { id: '8', persona_id: 'r', fecha: '2026-09-11', horas: 8, tipo_hora: 'normal', fuente_legacy: 'web:presencia-defecto', actualizado_por: null, notas: null },
    ],
    presencias: [],
    lineas: {
      r: { grupo: 'obreros', linea: linea('r', { horas: 62, cobra: 364188, enEfectivo: 364188, total: 364188 }) },
      a: { grupo: 'obreros', linea: linea('a', { horas: 89, cobra: 531686, yaTransferido: 100000, porBanco: 215564.62, enEfectivo: 216121.38, total: 431686 }) },
    },
    cuadrosCerrados: new Set(),
    horasDeLaPlanilla: new Map(),
    diasDeLaPlanilla: new Map(),
    hayEspejo: false,
    hoy: '2026-09-14',
  }
}

test('la jornada automática de Rosales (11/09, 8 h) se ve aparte y no entra en las horas de la fila', () => {
  const r = filasDelEspejo(datosDeRosales()).find((f) => f.personaId === 'r')
  assert.ok(r)
  assert.equal(r.horasPorTipo.normales, 62)
  assert.equal(r.horasPorTipo.automaticas, 8)
  const once = r.celdas.find((c) => c.fecha === '2026-09-11')
  assert.ok(once)
  assert.notEqual(once.marca, 'horas')
  assert.equal(once.automatica, 8)
})

test('el pie cierra: gana − adelantos − ya transferido = le falta pagar = banco + efectivo, y recorta con las filas', () => {
  const filas = filasDelEspejo(datosDeRosales())
  const t = totalesDelEspejo(filas)
  assert.equal(t.cobra, 895874)
  assert.equal(t.total, 795874)
  assert.equal(t.porBanco + t.enEfectivo, t.total)
  assert.deepEqual(cierreDeTotales(t), { cierra: true, leFaltaPagar: 795874, diferencia: 0 })
  const soloRosales = totalesDelEspejo(filas.filter((f) => f.personaId === 'r'))
  assert.equal(soloRosales.total, 364188)
  assert.equal(soloRosales.horasPagas, 62)
})
