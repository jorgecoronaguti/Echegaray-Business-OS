// EL PARTE GUARDADO — editar, corregir por voz y borrar. La corrección se arma con el parser REAL.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proponerParte } from '../../../../orquestador/lib/ml/voz-parte.mjs'
import { CONTEXTO } from '../../../../orquestador/lib/ml/voz-parte.fixtures.mjs'
import type { Propuesta } from './dictadoParte.ts'
import { aplicarCorreccion, diferencias, queSeBorra, revisionDeGuardado, validarEdicion, type ParteGuardado } from './parteGuardado.ts'

/** El parte de la maqueta, ya guardado: Quiroz ausente, la losa con +20 % hoy (40 % con este parte). */
const G: ParteGuardado = {
  obra_id: 'ob', fecha: '2026-09-25',
  personas: [
    { persona_id: 'p-arguello', nombre: 'Cristian Argüello', estado: 'presente', horas: 8, tarea_id: 't-encofrado', tarea_nombre: 'Encofrado de losa' },
    { persona_id: 'p-mansilla', nombre: 'Emilio Mansilla', estado: 'presente', horas: 8, tarea_id: 't-encofrado', tarea_nombre: 'Encofrado de losa' },
    { persona_id: 'p-quiroz', nombre: 'Sebastián Quiroz', estado: 'ausente', horas: null, tarea_id: null, tarea_nombre: null },
  ],
  avances: [{ ejecucion_id: 'e-losa', tarea_id: 't-losa', tarea_nombre: 'Losa', produccion: 20, metodo: 'manual', unidad: '', actual: 40 }],
  materiales: [
    { id_pedido: 'APP-1', material: 'cemento', cantidad: 20, unidad: 'bolsa', estado: 'PEDIDO', procesado: false },
    { id_pedido: 'APP-2', material: 'arena', cantidad: 1, unidad: 'camión', estado: 'ENTREGADO', procesado: true },
  ],
  novedad: { nota_id: 'n-1', texto: 'Se cortó la luz' },
  dictados: ['d-1'], vacio: false,
}
const ctx = { ...CONTEXTO, tareas: CONTEXTO.tareas.map((t) => (t.id === 't-losa' ? { ...t, avance_pct: 40 } : t)) }

test('editar sin tocar nada no cambia nada (no se reescribe lo que ya está)', () => {
  const d = diferencias(G, revisionDeGuardado(G))
  assert.equal(d.hayCambios, false)
  assert.deepEqual([d.marcas, d.quitarPersonas, d.avances, d.borrarEjecuciones, d.pedir, d.cancelar], [[], [], [], [], [], []])
})

test('«Quiroz sí vino, 8 horas en encofrado» y «la losa quedó al 45 %» se aplican SOBRE lo guardado', () => {
  const p = proponerParte('Quiroz sí vino, ocho horas en encofrado de losa. La losa quedó al cuarenta y cinco por ciento.', ctx) as unknown as Propuesta
  const r = aplicarCorreccion(revisionDeGuardado(G), p)
  assert.equal(r.personas.length, 3, 'Quiroz se ACTUALIZA, no se agrega otra fila')
  const q = r.personas.find((f) => f.persona_id === 'p-quiroz')
  assert.deepEqual([q?.estado, q?.horas, q?.tarea_id, q?.origen], ['presente', 8, 't-encofrado', 'dictado'])
  const losa = r.avances.find((a) => a.tarea_id === 't-losa')
  // 45 − (40 − 20 de hoy) = 25: el número del día se REEMPLAZA, no se suma encima.
  assert.equal(losa?.produccion, 25)
  assert.equal(losa?.ejecucion_id, 'e-losa')
  const d = diferencias(G, r)
  assert.deepEqual(d.marcas, [{ persona_id: 'p-quiroz', estado: 'presente', horas: 8, tarea_id: 't-encofrado' }])
  assert.deepEqual(d.avances, [{ tarea_id: 't-losa', produccion: 25 }])
  assert.deepEqual([d.borrarEjecuciones, d.cancelar, d.pedir], [[], [], []])
})

test('una corrección que baja el avance por debajo de lo previo se confirma', () => {
  const p = proponerParte('La losa quedó al quince por ciento.', ctx) as unknown as Propuesta
  const losa = aplicarCorreccion(revisionDeGuardado(G), p).avances.find((a) => a.tarea_id === 't-losa')
  assert.equal(losa?.produccion, null)
  assert.equal(losa?.dudoso, true)
})

test('sacar a alguien, un avance y un pedido: cada puerta recibe lo suyo; lo procesado no se toca', () => {
  const r = revisionDeGuardado(G)
  const editada = {
    ...r,
    personas: r.personas.map((f) => (f.persona_id === 'p-mansilla' ? { ...f, incluida: false } : f.persona_id === 'p-arguello' ? { ...f, horas: 9 } : f)),
    avances: r.avances.map((a) => ({ ...a, incluida: false })),
    materiales: r.materiales.map((m) => ({ ...m, incluida: false })),
    novedad: 'Se cortó la luz a la tarde',
  }
  const d = diferencias(G, editada)
  assert.deepEqual(d.marcas, [{ persona_id: 'p-arguello', estado: 'presente', horas: 9, tarea_id: 't-encofrado' }])
  assert.deepEqual(d.quitarPersonas, ['p-mansilla'])
  assert.deepEqual(d.borrarEjecuciones, ['e-losa'])
  assert.deepEqual(d.cancelar, ['APP-1'])
  assert.deepEqual(d.noSeCancela, ['arena'])
  assert.deepEqual(d.novedad, { cambia: true, borrar: 'n-1', nueva: 'Se cortó la luz a la tarde' })
})

test('cambiar la cantidad de un pedido sin procesar = cancelar y pedir de nuevo (no queda duplicado)', () => {
  const r = revisionDeGuardado(G)
  const d = diferencias(G, { ...r, materiales: r.materiales.map((m) => (m.id_pedido === 'APP-1' ? { ...m, cantidad: 30 } : m)) })
  assert.deepEqual(d.cancelar, ['APP-1'])
  assert.deepEqual(d.pedir, [{ material: 'cemento', cantidad: 30, unidad: 'bolsa' }])
})

test('Borrar dice exactamente qué se saca y qué queda', () => {
  assert.equal(queSeBorra(G), 'asistencia de 3 personas (16 h), 1 avance, 1 novedad y 1 pedido sin procesar. 1 pedido ya procesado queda.')
})

test('no se guarda una edición con algo naranja o con horas imposibles', () => {
  const p = proponerParte('Godoy ocho horas en contrapiso.', ctx) as unknown as Propuesta
  assert.match(validarEdicion(aplicarCorreccion(revisionDeGuardado(G), p)) ?? '', /confirmar 1 dato/)
  const r = revisionDeGuardado(G)
  assert.match(validarEdicion({ ...r, personas: r.personas.map((f, i) => (i === 0 ? { ...f, horas: 30 } : f)) }) ?? '', /de 0 a 24/)
  assert.equal(validarEdicion(r), null)
})
