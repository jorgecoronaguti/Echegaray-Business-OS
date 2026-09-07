import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acuseDe, envioSchema, planDeGuardado } from './planDeJornada.ts'
import type { FilaExistente, MarcaDeJornada } from './planDeJornada.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const presente = (persona_id: string, horas: number): MarcaDeJornada =>
  ({ persona_id, estado: 'presente', horas })
const ausente = (persona_id: string, horas = 8.8): MarcaDeJornada =>
  ({ persona_id, estado: 'ausente', horas })
const fila = (id: string, persona_id: string, horas: number, tipo_hora = 'normal'): FilaExistente =>
  ({ id, persona_id, horas, tipo_hora })

test('EL DÍA QUE SE ABRE Y SE GUARDA SIN TOCAR NADA NO ESCRIBE DE NUEVO', () => {
  // El defecto que atrapa: reguardar el día crea una segunda fila y duplica las horas de la obra, o
  // choca contra la clave única y devuelve un error de Postgres a un jefe que no hizo nada mal.
  const plan = planDeGuardado([presente(A, 8.8)], [fila('r1', A, 8.8)])
  assert.deepEqual(plan, { insertar: [], actualizar: [], borrar: [] })
  assert.match(acuseDe(plan), /ya estaba así/)
})

test('CORREGIR 8,8 A 5 ACTUALIZA LA FILA, NO AGREGA UNA SEGUNDA', () => {
  // El defecto que atrapa: `imputarHHMasivo` saltea a quien ya tenía horas. Con esa lógica, corregir
  // a González de 8,8 a 5 no habría hecho nada y la pantalla habría dicho que guardó.
  const plan = planDeGuardado([presente(A, 5)], [fila('r1', A, 8.8)])
  assert.deepEqual(plan.insertar, [])
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].id, 'r1')
  assert.equal(plan.actualizar[0].marca.horas, 5)
  assert.deepEqual(plan.borrar, [])
})

test('MARCAR AUSENTE A QUIEN TENÍA HORAS BORRA LAS HORAS', () => {
  // El defecto que atrapa: dejar las dos filas. El día contaría 8,8 horas trabajadas Y una ausencia
  // de la misma persona, y ese doble conteo viaja al costo de mano de obra de la obra.
  const plan = planDeGuardado([ausente(A)], [fila('r1', A, 8.8)])
  assert.deepEqual(plan.borrar, ['r1'])
  assert.equal(plan.insertar.length, 1)
  assert.equal(plan.insertar[0].estado, 'ausente')
})

test('VOLVER DE AUSENTE A PRESENTE BORRA LA AUSENCIA', () => {
  const plan = planDeGuardado([presente(A, 8.8)], [fila('r1', A, 8.8, 'ausencia')])
  assert.deepEqual(plan.borrar, ['r1'])
  assert.equal(plan.insertar.length, 1)
})

test('LAS EXTRAS CARGADAS APARTE SE REEMPLAZAN: la casilla es UN número por día', () => {
  // El defecto que atrapa: corregir el día a 9 dejando viva una fila de 2 hs extras. El total de la
  // obra diría 11 y la casilla que el jefe cerró diría 9 — dos verdades sobre la misma jornada.
  const plan = planDeGuardado([presente(A, 9)], [fila('r1', A, 8.8), fila('r2', A, 2, 'extra_50')])
  assert.deepEqual(plan.borrar, ['r2'])
  assert.deepEqual(plan.actualizar.map((a) => a.id), ['r1'])
})

test('A QUIEN NO SE MANDÓ NO SE LE TOCA NADA: el silencio no se convierte en afirmación', () => {
  // La regla que gobierna toda la pantalla. Si el plan borrara «lo que no vino en el envío», guardar
  // el día de la cuadrilla A borraría las horas que otro jefe cargó de la cuadrilla B.
  const plan = planDeGuardado([presente(A, 8)], [fila('r1', A, 8), fila('r2', B, 8)])
  assert.deepEqual(plan.borrar, [])
  assert.deepEqual(plan.actualizar, [])
  assert.deepEqual(plan.insertar, [])
})

test('EL ENVÍO SE VALIDA: cero horas, 25 horas y un id que no es uuid no entran', () => {
  const ok = envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [presente(A, 5)],
  })
  assert.equal(ok.success, true)
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [presente(A, 0)],
  }).success, false, 'cero horas no es una marca')
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [presente(A, 25)],
  }).success, false)
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '7/9/2026', marcas: [presente(A, 5)],
  }).success, false, 'la fecha en formato del Sheet no es una fecha ISO')
  assert.equal(envioSchema.safeParse({
    obra_id: '', fecha: '2026-09-07', marcas: [presente(A, 5)],
  }).success, false)
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [{ persona_id: 'González', estado: 'presente', horas: 5 }],
  }).success, false, 'un nombre no identifica a una persona')
})

test('EL ACUSE DICE LO QUE PASÓ, no «guardado»', () => {
  const plan = planDeGuardado([presente(A, 5), ausente(B)], [fila('r1', A, 8.8)])
  assert.equal(acuseDe(plan), 'Día guardado: 1 marca nueva · 1 corregida.')
})
