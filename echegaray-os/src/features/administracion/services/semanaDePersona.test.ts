// EL DEFECTO QUE ATRAPAN: un día sin ninguna imputación dibujado como un día de CERO horas.
//
// Si `semanaDePersona` devolviera `horas: 0` para el hueco, la barra del canónico sería idéntica
// a la de un día de ausencia cargada, y el total de la semana afirmaría «0,0 h» sobre una semana
// que nadie cargó todavía. Revertir el `null` pone estos tres casos en rojo.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { semanaDePersona, totalDeLaSemana } from './semanaDePersona.ts'
import type { ImputacionHH } from '../types'

function hh(fecha: string, horas: number, tipo_hora = 'normal'): ImputacionHH {
  return {
    id: `${fecha}-${tipo_hora}`, fecha, fecha_inicio_semana: '2026-08-17',
    obra_canonica_id: null, actividad_id: null, actividad_nombre: null, obra_nombre: null,
    horas, tipo_hora, notas: null, fuente_legacy: '',
  }
}

test('el día sin imputación queda en null, no en cero', () => {
  const dias = semanaDePersona([hh('2026-08-17', 9)], '2026-08-17')
  assert.equal(dias.length, 7)
  assert.equal(dias[0].horas, 9)
  assert.equal(dias[0].estado, 'trabajado')
  assert.equal(dias[1].horas, null)
  assert.equal(dias[1].estado, 'sin_registro')
})

test('la ausencia cargada vale cero horas pero NO es un hueco', () => {
  const dias = semanaDePersona([hh('2026-08-19', 8, 'ausencia')], '2026-08-17')
  assert.equal(dias[2].horas, 0)
  assert.equal(dias[2].estado, 'ausencia')
})

test('las horas del día se suman entre tipos trabajados', () => {
  const dias = semanaDePersona([hh('2026-08-17', 8), hh('2026-08-17', 2, 'extra_50')], '2026-08-17')
  assert.equal(dias[0].horas, 10)
})

test('una semana sin ningún registro no publica un total de cero', () => {
  assert.equal(totalDeLaSemana(semanaDePersona([], '2026-08-17')), null)
})

test('el total suma sólo los días con registro', () => {
  const dias = semanaDePersona([hh('2026-08-17', 9), hh('2026-08-18', 8, 'ausencia')], '2026-08-17')
  assert.equal(totalDeLaSemana(dias), 9)
})

test('los siete rótulos arrancan en lunes', () => {
  const dias = semanaDePersona([], '2026-08-17')
  assert.deepEqual(dias.map((d) => d.rotulo), ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'])
  assert.equal(dias[6].fecha, '2026-08-23')
})
