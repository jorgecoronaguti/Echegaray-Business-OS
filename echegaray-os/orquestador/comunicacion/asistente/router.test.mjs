import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { atenderPedido } from './router.mjs'
import { CAPACIDAD, ERROR, zRecordatorioCrear, zCalendarEvento, zDriveBuscar, resultadoOk } from './contratos.mjs'
import { capacidad as capacidadAyuda } from './capacidades/ayuda.mjs'
import { baseFalsa, filaIdentidad, capacidadFalsa, registroFalso, fetchProhibido } from './dobles-de-prueba.mjs'

const AHORA = new Date('2026-07-31T12:00:00-03:00')

const EQUIPO = [
  filaIdentidad({ id: 'u-jorge', username: 'jorge', nombre: 'Jorge Corona', email: 'jorge@ecsas.com.ar' }),
  filaIdentidad({ id: 'u-rodrigo', username: 'rbronia', nombre: 'Rodrigo Bronia', email: 'rodrigo@ecsas.com.ar' }),
  filaIdentidad({ id: 'u-rodrigo2', username: 'rperez', nombre: 'Rodrigo Pérez', email: 'rperez@ecsas.com.ar' }),
]

/** Las capacidades REALES no existen todavía en esta rama: se doblan con sus schemas reales. */
function capacidades({ googleConectado = true } = {}) {
  return [
    capacidadAyuda,
    capacidadFalsa({ id: CAPACIDAD.RECORDATORIO_CREAR, entrada: zRecordatorioCrear.refine((p) => p.cuando || p.cadencia, { path: ['cuando'], message: 'falta cuándo' }) }),
    capacidadFalsa({ id: CAPACIDAD.CALENDAR_EVENTO_CREAR, entrada: zCalendarEvento, efectoExterno: true, habilitada: async () => googleConectado }),
    capacidadFalsa({ id: CAPACIDAD.TASKS_TAREA_CREAR, entrada: z.object({ titulo: z.string().min(1) }).passthrough(), efectoExterno: true, habilitada: async () => googleConectado }),
    capacidadFalsa({ id: CAPACIDAD.DRIVE_BUSCAR, entrada: zDriveBuscar }),
  ]
}

function entorno({ lista = capacidades(), identidades = EQUIPO, pendientes = [], ejecuciones = [], commEventId = 'e1111111-1111-4111-8111-111111111111' } = {}) {
  const db = baseFalsa({ identidades, pendientes, ejecuciones, ahora: () => AHORA })
  const auditados = []
  const ctx = {
    port: db, actor: { plataformaUserId: 'u-jorge', plataformaUsername: 'jorge' },
    channelId: 'canal-1', rootPostId: 'post-1', commEventId, ahora: () => AHORA,
    auditar: async (e) => { auditados.push(e) },
  }
  const deps = { registro: registroFalso(lista) }
  const pedir = (texto, extra = {}) => atenderPedido({ texto, ctx: { ...ctx, ...extra }, deps })
  return { db, ctx, deps, pedir, auditados, lista, cap: (id) => lista.find((c) => c.id === id) }
}

// ── Camino feliz ─────────────────────────────────────────────────────────────

test('un pedido completo se ejecuta y responde con la evidencia de la capacidad', async () => {
  const e = entorno()
  const r = await e.pedir('recordame el lunes a las 8 pagar IERIC')
  assert.equal(r.ok, true)
  assert.equal(r.capacidad, CAPACIDAD.RECORDATORIO_CREAR)
  assert.ok(r.evidencia?.id, 'sin evidencia no se dice que se hizo')
  const [llamada] = e.cap(CAPACIDAD.RECORDATORIO_CREAR).llamadas
  assert.equal(llamada.parametros.cuando, '2026-08-03T08:00:00-03:00')
  assert.equal(llamada.parametros.destinatarioUserId, 'u-jorge', 'sin destinatario, es para quien pide')
})

test('la ayuda sale del registro y sólo nombra lo HABILITADO para esa persona', async () => {
  const conGoogle = await entorno().pedir('¿qué sabés hacer?')
  assert.ok(conGoogle.texto.includes('evento'), 'con Google conectado ofrece Calendar')

  const sinGoogle = await entorno({ lista: capacidades({ googleConectado: false }) }).pedir('¿qué sabés hacer?')
  assert.equal(sinGoogle.ok, true)
  assert.equal(/calendar|tarea de google/i.test(sinGoogle.texto), false, 'no promete lo que va a fallar')
  assert.ok(sinGoogle.texto.includes('recordarte') || sinGoogle.texto.includes('recordatorio.crear'))
  assert.deepEqual(sinGoogle.evidencia.capacidades.includes(CAPACIDAD.CALENDAR_EVENTO_CREAR), false)
})

test('una capacidad existente pero no habilitada se dice, no se ejecuta a medias', async () => {
  const e = entorno({ lista: capacidades({ googleConectado: false }) })
  const r = await e.pedir('agendá la visita de obra el jueves a las 10')
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.CAPACIDAD_DESHABILITADA)
  assert.equal(e.cap(CAPACIDAD.CALENDAR_EVENTO_CREAR).llamadas.length, 0)
})

// ── Personas ─────────────────────────────────────────────────────────────────

test('"avisale a Rodrigo" con dos Rodrigos pregunta cuál, y no ejecuta nada', async () => {
  const e = entorno()
  const r = await e.pedir('avisale a Rodrigo que mañana viene el inspector')
  assert.equal(r.ok, false)
  assert.ok(r.aclaracion, 'es una pregunta, no un error')
  assert.equal(r.aclaracion.opciones.length, 2)
  assert.equal(e.cap(CAPACIDAD.RECORDATORIO_CREAR).llamadas.length, 0)
  assert.equal(e.db.pendientes.filter((p) => p.estado === 'abierta').length, 1)
})

test('un nombre que no está en la tabla no se resuelve al más parecido: se dice que no existe', async () => {
  const e = entorno()
  const r = await e.pedir('avisale a Marcelo que mañana viene el inspector')
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.USUARIO_INEXISTENTE)
  assert.equal(e.cap(CAPACIDAD.RECORDATORIO_CREAR).llamadas.length, 0)
})

test('los invitados a un evento se resuelven a EMAILS reales antes de crear nada', async () => {
  const e = entorno()
  const r = await e.pedir('agendá reunión con Rodrigo Bronia mañana a las 9')
  assert.equal(r.ok, true)
  const [llamada] = e.cap(CAPACIDAD.CALENDAR_EVENTO_CREAR).llamadas
  assert.deepEqual(llamada.parametros.participantes, ['rodrigo@ecsas.com.ar'])
})

// ── Una sola aclaración ──────────────────────────────────────────────────────

test('falta el cuándo: se pregunta UNA vez y queda guardado lo ya entendido', async () => {
  const e = entorno()
  const r = await e.pedir('recordame comprar cemento')
  assert.equal(r.aclaracion.pregunta, '¿Para cuándo?')
  const [p] = e.db.pendientes
  assert.equal(p.estado, 'abierta')
  assert.equal(p.parcial.parametros.contenido, 'comprar cemento', 'no se pierde lo entendido')
  assert.equal(p.parcial.faltante, 'cuando')
})

test('la respuesta a la pregunta se resuelve contra la fila pendiente, SIN volver al modelo', async () => {
  const e = entorno()
  await e.pedir('recordame comprar cemento')
  const r = await e.pedir('el lunes a las 8', { fetchImpl: fetchProhibido(), apiKey: 'sk-test' })
  assert.equal(r.ok, true)
  const [llamada] = e.cap(CAPACIDAD.RECORDATORIO_CREAR).llamadas
  assert.equal(llamada.parametros.contenido, 'comprar cemento')
  assert.equal(llamada.parametros.cuando, '2026-08-03T08:00:00-03:00')
  assert.equal(e.db.pendientes[0].estado, 'resuelta')
})

test('elegir una opción por número alcanza: "2" es la segunda que se ofreció', async () => {
  const e = entorno()
  await e.pedir('avisale a Rodrigo que mañana viene el inspector')
  const ofrecidas = e.db.pendientes[0].opciones
  const r = await e.pedir('2')
  assert.equal(r.ok, true)
  assert.equal(e.cap(CAPACIDAD.RECORDATORIO_CREAR).llamadas[0].parametros.destinatarioUserId, ofrecidas[1].valor)
})

test('después de responder una aclaración NO se abre una segunda ronda de preguntas', async () => {
  const e = entorno()
  await e.pedir('recordame comprar cemento')          // pregunta el cuándo
  const r = await e.pedir('cuando puedas')            // no es una fecha ni una opción
  assert.equal(r.ok, false)
  assert.equal(r.aclaracion, null, 'no vuelve a preguntar')
  assert.equal(r.error.codigo, ERROR.DATO_FALTANTE)
})

test('si la persona cambia de tema, la pregunta vieja se cierra y no contamina el pedido nuevo', async () => {
  const e = entorno()
  await e.pedir('recordame comprar cemento')
  const r = await e.pedir('buscame el contrato de la Estrella')
  assert.equal(r.ok, true)
  assert.equal(r.capacidad, CAPACIDAD.DRIVE_BUSCAR)
  assert.equal(e.db.pendientes[0].estado, 'cancelada')
})

test('una aclaración VENCIDA no se responde ni se mezcla: se cierra y se atiende lo nuevo', async () => {
  const vencida = {
    id: 'pend-vieja', plataforma: 'mattermost', plataforma_user_id: 'u-jorge', estado: 'abierta',
    capacidad: CAPACIDAD.RECORDATORIO_CREAR, pregunta: '¿Para cuándo?', opciones: [],
    parcial: { intencion: CAPACIDAD.RECORDATORIO_CREAR, parametros: { contenido: 'algo viejo' }, faltante: 'cuando' },
    expira_at: new Date(AHORA.getTime() - 60_000).toISOString(),
  }
  const e = entorno({ pendientes: [vencida] })
  const r = await e.pedir('recordame el lunes a las 8 pagar IERIC')
  assert.equal(r.ok, true)
  assert.equal(e.cap(CAPACIDAD.RECORDATORIO_CREAR).llamadas[0].parametros.contenido, 'pagar IERIC')
  assert.equal(e.db.pendientes.find((p) => p.id === 'pend-vieja').estado, 'vencida')
})

test('"creá algo para el jueves" pregunta de qué tipo y después lo crea como lo eligieron', async () => {
  const e = entorno()
  const pregunta = await e.pedir('programame algo para el jueves a las 9: visita de obra')
  assert.ok(pregunta.aclaracion)
  assert.equal(pregunta.aclaracion.opciones.length, 3)

  const r = await e.pedir('evento de Calendar')
  assert.equal(r.ok, true)
  const [llamada] = e.cap(CAPACIDAD.CALENDAR_EVENTO_CREAR).llamadas
  assert.equal(llamada.parametros.inicio, '2026-08-06T09:00:00-03:00')
  assert.ok(llamada.parametros.titulo.includes('visita de obra'))
})

// ── Idempotencia del efecto externo ──────────────────────────────────────────

test('un reintento del Work Fabric NO crea un segundo evento de Calendar', async () => {
  const e = entorno()
  const primera = await e.pedir('agendá la visita de obra el jueves a las 10')
  const segunda = await e.pedir('agendá la visita de obra el jueves a las 10')
  assert.equal(primera.ok, true)
  assert.equal(segunda.ok, true)
  assert.equal(segunda.repetida, true, 'la segunda devuelve lo mismo sin ejecutar')
  assert.equal(e.cap(CAPACIDAD.CALENDAR_EVENTO_CREAR).llamadas.length, 1, 'la capacidad corrió UNA vez')
  assert.deepEqual(segunda.evidencia, primera.evidencia)
  assert.equal(e.db.ejecuciones.length, 1)
})

test('la barrera es por (mensaje, capacidad): otro mensaje sí se ejecuta', async () => {
  const e = entorno()
  await e.pedir('agendá la visita de obra el jueves a las 10')
  const otro = await e.pedir('agendá la visita de obra el jueves a las 10', { commEventId: 'e2222222-2222-4222-8222-222222222222' })
  assert.equal(otro.repetida, undefined)
  assert.equal(e.cap(CAPACIDAD.CALENDAR_EVENTO_CREAR).llamadas.length, 2)
})

test('lo que no tiene efecto externo no pasa por la barrera (ni ensucia la tabla)', async () => {
  const e = entorno()
  await e.pedir('buscame el contrato de la Estrella')
  await e.pedir('buscame el contrato de la Estrella')
  assert.equal(e.cap(CAPACIDAD.DRIVE_BUSCAR).llamadas.length, 2, 'buscar dos veces no rompe nada')
  assert.equal(e.db.ejecuciones.length, 0)
})

// ── No mentir ────────────────────────────────────────────────────────────────

test('una capacidad que devuelve ok SIN evidencia no se reporta como hecha', async () => {
  const mentirosa = capacidadFalsa({
    id: CAPACIDAD.DRIVE_BUSCAR, entrada: zDriveBuscar,
    ejecutar: async () => ({ ...resultadoOk(CAPACIDAD.DRIVE_BUSCAR, 'listo', {}), evidencia: null }),
  })
  const e = entorno({ lista: [capacidadAyuda, mentirosa] })
  const r = await e.pedir('buscame el contrato de la Estrella')
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.DEFINITIVO)
})

test('si la capacidad explota, se avisa como error temporal y no como éxito', async () => {
  const rota = capacidadFalsa({
    id: CAPACIDAD.DRIVE_BUSCAR, entrada: zDriveBuscar,
    ejecutar: async () => { throw new Error('token vencido en /home/jorge/secreto') },
  })
  const e = entorno({ lista: [capacidadAyuda, rota] })
  const r = await e.pedir('buscame el contrato de la Estrella')
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.TEMPORAL)
  assert.equal(r.texto.includes('/home/jorge'), false, 'el detalle técnico no va al chat')
})

test('lo que no se entiende termina en la ayuda real, no en "comando no soportado"', async () => {
  const e = entorno()
  const r = await e.pedir('che, fijate eso del otro día', { apiKey: null })
  assert.equal(r.ok, false)
  assert.equal(r.error.codigo, ERROR.INTERPRETACION)
  assert.ok(r.texto.includes('Puedo:'))
})

test('quien no está registrado igual usa el asistente: la identidad provisoria sale del chat', async () => {
  const e = entorno({ identidades: [] })
  const r = await e.pedir('recordame el lunes a las 8 pagar IERIC')
  assert.equal(r.ok, true)
  assert.equal(e.cap(CAPACIDAD.RECORDATORIO_CREAR).llamadas[0].parametros.destinatarioUserId, 'u-jorge')
})

test('la auditoría es un hook opcional: se avisa qué pasó sin que el router sepa de orq.events', async () => {
  const e = entorno()
  await e.pedir('buscame el contrato de la Estrella')
  assert.deepEqual(e.auditados.map((a) => a.evento), ['asistente.ejecucion'])
  await e.pedir('recordame comprar cemento')
  assert.ok(e.auditados.some((a) => a.evento === 'asistente.aclaracion'))
})
