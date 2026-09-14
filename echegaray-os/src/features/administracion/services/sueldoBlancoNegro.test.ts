// EL SUELDO DE UN OBRERO ES BLANCO + NEGRO (dueño, 14/09/2026).
//
// Textual: *«revisar en cada caso el valor hs segun categoria q aparece en recibo de sueldo, esa es la
// parte en blanco y es una parte del sueldo. la otra es otro valor hora q se viene dando por sheet
// jornales … q cubre el otro 50 en negro del salario»*. Y al preguntarle: el negro paga SÓLO las horas
// que no están en el recibo; TOTAL = neto del recibo + negro; sin recibo todavía, el blanco se estima
// con la mitad de las horas × el $/h de su categoría, marcado «estimado».
//
// LAS MUTACIONES QUE TIENEN QUE PONER ESTO ROJO:
//   1. negro con TODAS las horas (no las que faltan del recibo);
//   2. total sin neto (sumar el negro solo cuando falta el neto);
//   3. sin recibo, horas completas en el blanco en lugar de la mitad;
//   4. estimado sin marca (estado 'recibo' con números inventados).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  entradaDeBlanco, periodoOrdenable, sueldoBlancoNegro, type ReciboDeSueldo,
} from './sueldoBlancoNegro.ts'

/** Rosales Diego José, recibo del estudio Q2-08/2026: 50 h × $6.348, bruto $317.400, neto $230.240,12. */
const RECIBO_Q2_08: ReciboDeSueldo = {
  personaId: 'rosales', cuil: '20358508783', periodo: 'Q2-08/2026', categoria: 'Oficial',
  valorHora: 6348, horasBlanco: 50, bruto: 317400, neto: 230240.12, driveFileId: 'pdf-q2-08',
}

test('ROSALES Q2-08, CON RECIBO: negro 44 h × $5.874, total $488.696,12, efectivo $58.456', () => {
  const s = sueldoBlancoNegro({
    horas: 94, valorHoraNegro: 5874, recibo: RECIBO_Q2_08, netoDeNomina: null,
    pisoCategoria: 6348, ultimoRecibo: null,
  })
  assert.equal(s.estado, 'recibo')
  assert.equal(s.horasBlanco, 50)
  assert.equal(s.valorHoraCategoria, 6348)
  assert.equal(s.bruto, 317400)
  assert.equal(s.neto, 230240.12)
  assert.equal(s.origenNeto, 'recibo')
  assert.equal(s.horasNegro, 44, 'MUTACIÓN 1: el negro paga sólo las horas que faltan del recibo')
  assert.equal(s.negro, 258456)
  assert.equal(s.total, 488696.12)
  assert.equal(s.driveFileId, 'pdf-q2-08')
  assert.equal(s.reciboExcedeHoras, false)
  // La fila cierra: total − banco (neto) − adelanto − ya transferido = efectivo.
  assert.equal(Math.round((s.total! - s.neto! - 0 - 200000) * 100) / 100, 58456)
})

test('ROSALES Q1-09, SIN RECIBO: mitad de 62 h × $6.348, neto con la proporción del último recibo', () => {
  const s = sueldoBlancoNegro({
    horas: 62, valorHoraNegro: 5874, recibo: null, netoDeNomina: null,
    pisoCategoria: 6348, ultimoRecibo: RECIBO_Q2_08,
  })
  assert.equal(s.estado, 'estimado', 'MUTACIÓN 4: un blanco sin recibo se marca estimado')
  assert.equal(s.horasBlanco, 31, 'MUTACIÓN 3: sin recibo el blanco lleva la MITAD de las horas')
  assert.equal(s.valorHoraCategoria, 6348)
  assert.equal(s.bruto, 196788)
  // 196.788 × 230.240,12 / 317.400 = 142.748,8744 → centavos.
  assert.equal(s.neto, 142748.87)
  assert.equal(s.origenNeto, 'estimado')
  assert.equal(s.horasNegro, 31)
  assert.equal(s.negro, 182094)
  assert.equal(s.total, 324842.87)
  assert.equal(s.driveFileId, null)
})

test('SIN NINGÚN RECIBO PREVIO: el neto queda null y el total también — no se inventa', () => {
  const s = sueldoBlancoNegro({
    horas: 62, valorHoraNegro: 5874, recibo: null, netoDeNomina: null,
    pisoCategoria: 6348, ultimoRecibo: null,
  })
  assert.equal(s.estado, 'estimado')
  assert.equal(s.bruto, 196788, 'el bruto estimado sí se puede decir')
  assert.equal(s.neto, null)
  assert.equal(s.negro, 182094, 'el negro no depende del recibo')
  assert.equal(s.total, null, 'MUTACIÓN 2: sin neto no hay total, aunque el negro exista')
})

test('EL RECIBO PAGA MÁS HORAS QUE LAS CARGADAS: negro 0 y la marca', () => {
  const s = sueldoBlancoNegro({
    horas: 40, valorHoraNegro: 5874, recibo: RECIBO_Q2_08, netoDeNomina: null,
    pisoCategoria: 6348, ultimoRecibo: null,
  })
  assert.equal(s.horasNegro, 0)
  assert.equal(s.negro, 0)
  assert.equal(s.reciboExcedeHoras, true)
  assert.equal(s.total, 230240.12)
})

test('SIN LA TABLA NUEVA: el neto del recibo de nómina es real, las horas del blanco se estiman', () => {
  const s = sueldoBlancoNegro({
    horas: 94, valorHoraNegro: 5874, recibo: null, netoDeNomina: 230240.12,
    pisoCategoria: 6348, ultimoRecibo: null,
  })
  assert.equal(s.estado, 'estimado')
  assert.equal(s.horasBlanco, 47)
  assert.equal(s.neto, 230240.12)
  assert.equal(s.origenNeto, 'nomina')
  assert.equal(s.negro, 47 * 5874)
  assert.equal(s.total, 230240.12 + 276078)
})

test('SIN $/H NEGRO O SIN HORAS: sin negro y sin total, nunca cero', () => {
  const sinTarifa = sueldoBlancoNegro({
    horas: 62, valorHoraNegro: null, recibo: RECIBO_Q2_08, netoDeNomina: null, pisoCategoria: 6348, ultimoRecibo: null,
  })
  assert.equal(sinTarifa.negro, null)
  assert.equal(sinTarifa.total, null)
  const sinHoras = sueldoBlancoNegro({
    horas: null, valorHoraNegro: 5874, recibo: null, netoDeNomina: null, pisoCategoria: 6348, ultimoRecibo: RECIBO_Q2_08,
  })
  assert.equal(sinHoras.horasBlanco, null)
  assert.equal(sinHoras.total, null)
  const sinPiso = sueldoBlancoNegro({
    horas: 62, valorHoraNegro: 5874, recibo: null, netoDeNomina: null, pisoCategoria: null, ultimoRecibo: RECIBO_Q2_08,
  })
  assert.equal(sinPiso.bruto, null, 'sin la escala de su categoría no hay bruto que estimar')
  assert.equal(sinPiso.neto, null)
})

test('LA ENTRADA: el recibo del período por persona o CUIL, y el ÚLTIMO recibo real anterior con bruto', () => {
  const q1 = { ...RECIBO_Q2_08, periodo: 'Q1-08/2026', bruto: 340000, neto: 249857.28 }
  const ajeno = { ...RECIBO_Q2_08, personaId: 'otro', cuil: '1', periodo: 'Q2-12/2025' }
  const recibos = [q1, RECIBO_Q2_08, ajeno]
  const e = entradaDeBlanco({ personaId: 'rosales', cuil: '20358508783', periodo: 'Q1-09/2026', recibos, pisoCategoria: 6348, netoDeNomina: null })
  assert.equal(e.recibo, null, 'no hay recibo de Q1-09')
  assert.equal(e.ultimoRecibo?.periodo, 'Q2-08/2026', 'el último es Q2-08, no Q1-08 ni el de otra persona')
  const conCuil = entradaDeBlanco({ personaId: 'x', cuil: '20358508783', periodo: 'Q2-08/2026', recibos, pisoCategoria: 6348, netoDeNomina: null })
  assert.equal(conCuil.recibo?.neto, 230240.12, 'empareja por CUIL cuando la persona_id no está')
  assert.equal(conCuil.ultimoRecibo?.periodo, 'Q1-08/2026', 'el último ANTERIOR al período mirado')
  // Un recibo sin bruto no sirve para la proporción.
  const sinBruto = entradaDeBlanco({ personaId: 'rosales', cuil: null, periodo: 'Q1-09/2026', recibos: [{ ...RECIBO_Q2_08, bruto: null }], pisoCategoria: 6348, netoDeNomina: null })
  assert.equal(sinBruto.ultimoRecibo, null)
  assert.ok(periodoOrdenable('Q2-12/2025') < periodoOrdenable('Q1-01/2026'))
})
