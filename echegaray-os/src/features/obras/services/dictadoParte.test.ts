// DICTAR PARTE — la revisión y lo que viaja al guardar, construido con la propuesta REAL del parser
// (no con una propuesta fabricada a mano: un control se prueba con la función de producción).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proponerParte } from '../../../../orquestador/lib/ml/voz-parte.mjs'
import { CASOS, CONTEXTO } from '../../../../orquestador/lib/ml/voz-parte.fixtures.mjs'
import {
  armarEnvio, avisoDeConfirmar, comentarioDeTarea, numeroParaElParte, pendientesDeConfirmar, renglonesDeGente,
  resumenDeRevision, revisionInicial, textoGuardado, tramosDelTexto, type Propuesta, type Revision,
} from './dictadoParte.ts'

const MAQUETA = proponerParte(CASOS[0].texto, CONTEXTO) as unknown as Propuesta
const confirmarTodo = (r: Revision): Revision => ({
  ...r,
  personas: r.personas.map((f) => ({ ...f, confirmada: true })),
  avances: r.avances.map((a) => ({ ...a, confirmada: true })),
  materiales: r.materiales.map((m) => ({ ...m, confirmada: true })),
})

test('NUNCA guarda con algo naranja sin confirmar: «¿Quiroz faltó todo el día?»', () => {
  const r = revisionInicial(MAQUETA)
  assert.equal(pendientesDeConfirmar(r), 1)
  assert.match(avisoDeConfirmar(r) ?? '', /1 dato para confirmar: ¿Sebastián Quiroz faltó todo el día\?/)
  const e = armarEnvio(r, '2026-09-25')
  assert.equal(e.ok, false)
})

test('confirmado, viaja a las puertas: 6 presentes con horas y tarea, 1 ausente sin horas, el avance del día y el pedido', () => {
  const e = armarEnvio(confirmarTodo(revisionInicial(MAQUETA)), '2026-09-25')
  assert.ok(e.ok)
  if (!e.ok) return
  assert.equal(e.envio.personas.filter((p) => p.estado === 'presente').length, 6)
  const q = e.envio.personas.find((p) => p.persona_id === 'p-quiroz')
  assert.deepEqual(q, { persona_id: 'p-quiroz', estado: 'ausente', horas: null, tarea_id: null })
  assert.deepEqual(e.envio.avances, [{ tarea_id: 't-losa', produccion: 20 }])
  assert.deepEqual(e.envio.materiales, [{ material: 'cemento', cantidad: 20, unidad: 'bolsa' }])
  assert.equal(e.envio.urgencia, 'hoy')
})

test('quitar lo dudoso también destraba; lo quitado no viaja', () => {
  const r = revisionInicial(MAQUETA)
  const sinQuiroz = { ...r, personas: r.personas.map((f) => (f.persona_id === 'p-quiroz' ? { ...f, incluida: false } : f)) }
  const e = armarEnvio(sinQuiroz, '2026-09-25')
  assert.ok(e.ok && !e.envio.personas.some((p) => p.persona_id === 'p-quiroz'))
})

test('dos personas con el mismo apellido: hasta elegir cuál, no se guarda', () => {
  const p = proponerParte('Godoy ocho horas en contrapiso.', CONTEXTO) as unknown as Propuesta
  const r = revisionInicial(p)
  assert.equal(r.personas[0].persona_id, null)
  assert.equal(pendientesDeConfirmar(r), 1)
  assert.equal(armarEnvio(confirmarTodo(r), '2026-09-25').ok, false, 'confirmar no alcanza: hay que ELEGIR')
  const elegido = { ...r, personas: [{ ...r.personas[0], persona_id: 'p-godoy-m', nombre: 'Mario Godoy', confirmada: true }] }
  const e = armarEnvio(elegido, '2026-09-25')
  assert.ok(e.ok && e.envio.personas[0].persona_id === 'p-godoy-m' && e.envio.personas[0].horas === 8)
})

test('horas imposibles no viajan', () => {
  const r = confirmarTodo(revisionInicial(MAQUETA))
  const mal = { ...r, personas: r.personas.map((f, i) => (i === 0 ? { ...f, horas: 30 } : f)) }
  const e = armarEnvio(mal, '2026-09-25')
  assert.equal(e.ok, false)
})

test('lo que no entendió arranca escrito en Novedades', () => {
  const p = proponerParte('Navarro ocho horas en pintura de rejas.', CONTEXTO) as unknown as Propuesta
  assert.match(revisionInicial(p).novedad, /pintura de rejas/)
})

test('«4 más · hormigonado»: el resto se muestra junto, con la suma de horas', () => {
  const g = renglonesDeGente(revisionInicial(MAQUETA).personas)
  const grupo = g.find((x) => x.tipo === 'grupo')
  assert.ok(grupo && grupo.tipo === 'grupo')
  if (grupo?.tipo !== 'grupo') return
  assert.equal(grupo.n, 4)
  assert.equal(grupo.horas, 32)
  assert.equal(grupo.tarea, 'Hormigonado de vigas')
})

test('el resumen de la maqueta, vivo', () => {
  assert.equal(resumenDeRevision(revisionInicial(MAQUETA)), 'Entendí 6 personas, 2 tareas, 1 avance y 1 pedido. Hay 1 dato para confirmar.')
})

test('«Lo que dijo»: los tramos recomponen el texto entero y marcan la falta en naranja', () => {
  const t = tramosDelTexto(MAQUETA.texto, MAQUETA.marcas)
  assert.equal(t.map((x) => x.texto).join(''), MAQUETA.texto)
  assert.ok(t.some((x) => x.tipo === 'duda' && x.texto === 'Quiroz no vino'))
  assert.ok(t.some((x) => x.tipo === 'dato' && x.texto === 'veinte bolsas de cemento'))
})

test('la tarea de cada persona queda en el comentario del renglón (las horas no se imputan dos veces)', () => {
  const e = armarEnvio(confirmarTodo(revisionInicial(MAQUETA)), '2026-09-25')
  assert.ok(e.ok)
  if (!e.ok) return
  const nombres = new Map(MAQUETA.personas.filter((f) => f.persona_id).map((f) => [f.persona_id as string, f.nombre]))
  assert.equal(comentarioDeTarea('t-encofrado', e.envio.personas, nombres), 'Dictado: Cristian Argüello, Emilio Mansilla · 16 h')
  assert.match(comentarioDeTarea('t-hormigonado', e.envio.personas, nombres) ?? '', /y 1 más · 32 h$/)
  assert.equal(comentarioDeTarea('t-losa', e.envio.personas, nombres), null)
})

test('el número viaja con coma: el lector del parte lee «20.5» como veinte mil quinientos', () => {
  assert.equal(numeroParaElParte(20.5), '20,5')
  assert.equal(numeroParaElParte(15), '15')
})

test('guardado: dice la hora y adónde fue el pedido; si una puerta rebotó, lo dice', () => {
  const base = { asistencia: { ok: true, mensaje: '' }, parte: { ok: true, mensaje: '' }, material: { ok: true, mensaje: '' }, horasPorTarea: [], presentes: 6, ausentes: 1, pedido: '20 bolsa de cemento' }
  assert.equal(textoGuardado(base, '18:12'), 'Parte guardado a las 18:12. El pedido de 20 bolsa de cemento pasó a Material.')
  assert.match(textoGuardado({ ...base, asistencia: { ok: false, mensaje: 'quincena cerrada' } }, '18:12'), /1 parte que NO entró/)
})
