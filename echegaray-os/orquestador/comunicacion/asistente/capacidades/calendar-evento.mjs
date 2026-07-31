// "AGENDAME LA REUNIÓN CON RODRIGO MAÑANA A LAS 9" → un evento REAL en Google Calendar.
//
// TRES DECISIONES QUE VALEN MÁS QUE EL CÓDIGO:
//
// 1. LA DURACIÓN NO SE PREGUNTA. Nadie dice "de 9 a 10"; dice "a las 9". Preguntar la
//    duración convierte una frase en un formulario. Se afirma una hora, se DICE en la
//    confirmación y queda corregible. Buscamos una convención vigente de la empresa y no
//    existe: `operating_meeting_templates` tiene duración POR TIPO de reunión (45/60/90),
//    no un default para un evento cualquiera. Cuando exista, se lee de ahí.
//
// 2. ANTES DE CREAR, SE MIRA. El mismo pedido dicho dos veces (el mensaje que se reenvía,
//    el "¿lo agendaste?") no puede dejar dos reuniones iguales en la agenda de nadie: si ya
//    hay un evento con ese título y ese inicio, se devuelve ESE.
//
// 3. LA AGENDA ES DE SU DUEÑO. Si quien pide no conectó SU Google, el evento caería en la
//    cuenta operadora del OS: la persona confirmaría una reunión que no va a ver nunca.
//    Antes que eso, se le dice que conecte su cuenta.

import {
  CAPACIDAD, ERROR, errorAsistente, resultadoOk, resultadoError, zCalendarEvento,
} from '../contratos.mjs'
import { paredAR, formatearAR } from '../tiempo.mjs'
import {
  clasificarErrorGoogle, googlePropioDisponible, permiteEfectoExterno, errorSinCuenta, errorCuentaAjena,
} from '../google-cliente.mjs'

/** Lo que dura una reunión cuando nadie dijo cuánto. Se afirma y se avisa; no se pregunta. */
export const DURACION_DEFECTO_MIN = 60

const EMAIL = /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i
const DIA_MS = 86_400_000
const dosDig = (n) => String(n).padStart(2, '0')
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

const instante = (iso) => new Date(iso).getTime()

/** "hoy", "mañana", "pasado mañana" o el día con nombre. La agenda se lee en días, no en ISO. */
function diaRelativo(iso, ahora) {
  const a = paredAR(ahora); const b = paredAR(new Date(iso))
  const dias = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DIA_MS)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias === 2) return 'pasado mañana'
  return `el ${formatearAR(iso, { conHora: false })}`
}

const hhmm = (iso) => { const p = paredAR(new Date(iso)); return `${dosDig(p.hh)}:${dosDig(p.mm)}` }

/** Fin del evento: el que dijo la persona, el que sale de la duración, o el default. */
function calcularFin({ inicio, fin, duracionMin }) {
  if (fin) return { fin, asumida: false }
  const min = duracionMin ?? DURACION_DEFECTO_MIN
  const d = new Date(instante(inicio) + min * 60_000)
  const p = paredAR(d)
  return {
    fin: `${p.y}-${dosDig(p.m)}-${dosDig(p.d)}T${dosDig(p.hh)}:${dosDig(p.mm)}:00-03:00`,
    asumida: duracionMin == null,
    minutos: min,
  }
}

/**
 * ¿Ya existe este evento? Mismo título y mismo instante de inicio.
 *
 * Se mira con `calendarUpcoming`, que sólo ve hacia adelante: si el inicio ya pasó no hay con
 * qué comparar y se crea igual — un evento en el pasado es raro, pero mentir sobre por qué no
 * se creó lo es más.
 */
async function eventoYaExistente(google, { titulo, inicio, ahora }) {
  const dias = Math.ceil((instante(inicio) - ahora.getTime()) / DIA_MS) + 1
  if (!Number.isFinite(dias) || dias < 1 || dias > 400) return null
  const eventos = (await google.calendarUpcoming({ days: dias, max: 50 })) || []
  const t = norm(titulo); const i = instante(inicio)
  return eventos.find((e) => norm(e.summary) === t && instante(e.start?.dateTime ?? e.start) === i) ?? null
}

function validarParticipantes(lista) {
  const malos = lista.filter((e) => !EMAIL.test(String(e)))
  if (!malos.length) return null
  // Con un invitado mal escrito no se crea "casi todo el evento": se corrige y se crea entero.
  return errorAsistente(
    ERROR.DATO_FALTANTE,
    `No me cierra el mail de ${malos.join(', ')}. Pasámelo completo (ej. nombre@ecsas.com.ar) y lo agendo.`,
  )
}

function textoCreado({ titulo, inicio, fin, asumida, minutos, participantes, ahora }) {
  const partes = [`Listo. Creé "${titulo}" ${diaRelativo(inicio, ahora)} de ${hhmm(inicio)} a ${hhmm(fin)}.`]
  if (participantes.length) partes.push(`Le mandé la invitación a ${participantes.join(', ')}.`)
  if (asumida) partes.push(`Le puse ${minutos} minutos porque no me dijiste hasta cuándo; si va otra cosa, decime y lo corrijo.`)
  return partes.join(' ')
}

export const capacidad = {
  id: CAPACIDAD.CALENDAR_EVENTO_CREAR,
  nombre: 'Crear un evento en el calendario',
  descripcion: 'agendarte una reunión en tu Google Calendar (con invitados si querés)',
  version: '1.0.0',
  permisos: ['calendar.write'],
  efectoExterno: true,
  ejemplos: ['agendame reunión con Rodrigo mañana a las 9', 'poneme visita a la obra el jueves 15hs'],
  entrada: zCalendarEvento,
  habilitada: (ctx) => googlePropioDisponible(ctx, ctx?.googleDeps),

  async ejecutar(params, ctx = {}) {
    const p = zCalendarEvento.safeParse(params)
    if (!p.success) {
      return resultadoError(CAPACIDAD.CALENDAR_EVENTO_CREAR, errorAsistente(
        ERROR.DATO_FALTANTE, '¿Qué agendo y para cuándo? Decime el título y el día y hora.', p.error.message,
      ))
    }
    const { titulo, inicio, descripcion, participantes } = p.data
    if (!ctx.google) return resultadoError(CAPACIDAD.CALENDAR_EVENTO_CREAR, errorSinCuenta())
    if (!permiteEfectoExterno(ctx.google)) {
      return resultadoError(CAPACIDAD.CALENDAR_EVENTO_CREAR, errorCuentaAjena(ctx.google))
    }
    const malos = validarParticipantes(participantes)
    if (malos) return resultadoError(CAPACIDAD.CALENDAR_EVENTO_CREAR, malos)

    const { fin, asumida, minutos } = calcularFin(p.data)
    const ahora = ctx.ahora?.() ?? new Date()
    try {
      const ya = await eventoYaExistente(ctx.google, { titulo, inicio, ahora })
      if (ya) {
        return resultadoOk(
          CAPACIDAD.CALENDAR_EVENTO_CREAR,
          `Eso ya estaba agendado: "${titulo}" ${diaRelativo(inicio, ahora)} a las ${hhmm(inicio)}. No creé otro.`,
          { evento: { id: ya.id, enlace: null, titulo, inicio, fin: ya.end ?? fin }, duplicado: true },
        )
      }
      const r = await ctx.google.calendarCreateEvent({
        summary: titulo,
        description: descripcion ?? undefined,
        start: inicio,
        end: fin,
        attendees: participantes,
      })
      // Sin id no hay evento: decir "listo" acá sería exactamente la mentira que el contrato
      // de evidencia existe para impedir.
      if (!r?.id) {
        return resultadoError(CAPACIDAD.CALENDAR_EVENTO_CREAR, errorAsistente(
          ERROR.DEFINITIVO, 'Google aceptó el pedido pero no me devolvió el evento. No te lo doy por creado: revisalo en tu calendario.',
          JSON.stringify(r ?? null).slice(0, 200),
        ))
      }
      return resultadoOk(
        CAPACIDAD.CALENDAR_EVENTO_CREAR,
        textoCreado({ titulo, inicio, fin, asumida, minutos, participantes, ahora }),
        { evento: { id: r.id, enlace: r.link ?? null, titulo, inicio, fin }, duplicado: false },
      )
    } catch (e) {
      return resultadoError(CAPACIDAD.CALENDAR_EVENTO_CREAR, clasificarErrorGoogle(e, { que: 'el calendario' }))
    }
  },
}
