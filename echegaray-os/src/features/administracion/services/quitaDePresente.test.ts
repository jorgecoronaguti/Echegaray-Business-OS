import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acuseDeQuita, jornadaAQuitarConElPresente, QUITAR_JORNADA_POR_DEFECTO_AL_QUITAR } from './quitaDePresente.ts'
import { FUENTE_CORRECCION_HORAS, FUENTE_HORAS_POR_DEFECTO, type HoraDelDia } from './presenciaDelDia.ts'

// DECISIÓN 3 (dueño, 17/09/2026): al quitar un presente se borran las horas por defecto, salvo que
// alguien las haya editado. El defecto que esto atrapa es el del 11/09: borrar 13 h tecleadas por el
// dueño porque la fila conservaba el origen `web:presencia-defecto`.

const fila = (id: string, extra: Partial<HoraDelDia> = {}): HoraDelDia =>
  ({ id, persona_id: 'juan', tipo_hora: 'normal', fuente_legacy: FUENTE_HORAS_POR_DEFECTO, actualizado_por: null, ...extra })

test('la regla está encendida (decisión confirmada)', () => {
  assert.equal(QUITAR_JORNADA_POR_DEFECTO_AL_QUITAR, true)
})

test('se retira la jornada por defecto que nadie tocó, y sólo de esa persona', () => {
  assert.deepEqual(jornadaAQuitarConElPresente([fila('a'), fila('b', { persona_id: 'otro' })], 'juan'), ['a'])
})

test('NUNCA se retira una fila que alguien editó, aunque conserve el origen por defecto', () => {
  assert.deepEqual(jornadaAQuitarConElPresente([fila('a', { actualizado_por: 'uid-dueno' })], 'juan'), [])
  assert.deepEqual(jornadaAQuitarConElPresente([fila('b', { fuente_legacy: FUENTE_CORRECCION_HORAS })], 'juan'), [])
  assert.deepEqual(jornadaAQuitarConElPresente([fila('c', { fuente_legacy: 'web:asistencia-obra' })], 'juan'), [])
})

test('con el flag apagado no se retira nada', () => {
  assert.deepEqual(jornadaAQuitarConElPresente([fila('a')], 'juan', false), [])
})

test('el acuse dice lo que la base hizo', () => {
  assert.match(acuseDeQuita({ retiradas: 1, noSePudo: null }), /retiró la jornada por defecto/)
  assert.match(acuseDeQuita({ retiradas: 0, noSePudo: null }), /no se tocaron/)
  assert.match(acuseDeQuita({ retiradas: 0, noSePudo: 'quincena cerrada' }), /quedó cargada: quincena cerrada/)
})
