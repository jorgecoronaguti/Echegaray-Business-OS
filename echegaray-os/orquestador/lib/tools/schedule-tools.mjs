// Tools de AGENDA para el chat: el modelo, tras un diálogo que deja la tarea bien definida
// (alcance, expectativa, cronograma, costo), llama programar_tarea para dejarla corriendo sola.
// Persisten en orq.schedules; el timer del OS (0 API) las dispara en su cadencia. Corren AUTO
// (sin aprobación): son internas y reversibles (Nivel D). Usan capability 'drive.read' — el
// mismo truco que la tool "aprender" — para que la policy las deje ejecutar directo.
import { createSchedule, listSchedules, toggleSchedule, HERRAMIENTAS_DE_AGENDA } from '../schedules.mjs'
import { parseCadence, describeCadence } from '../schedule-intent.mjs'

export function scheduleTools({ tenantId, createdBy }) {
  return {
    'schedule.create': {
      capability: 'drive.read',
      schema: {
        name: 'programar_tarea',
        description: 'Deja corriendo SOLA, en su cronograma, una HERRAMIENTA PROPIA del OS (sin modelo): briefing_caja (briefing de caja del día), alias_pendientes (nombres de cliente que el eje no reconoce) o indices_economicos (inflación esperada del REM del BCRA). No programa órdenes en lenguaje natural: si lo pedido no es una de esas tres, decile al dueño que la agenda todavía no lo sabe correr. Pasá herramienta, cadencia_texto en palabras (ej. "todos los lunes a las 8") y un titulo corto.',
        input_schema: {
          type: 'object',
          properties: {
            herramienta: { type: 'string', enum: [...HERRAMIENTAS_DE_AGENDA], description: 'la herramienta propia que corre cada vez' },
            directiva: { type: 'string', description: 'para qué la pidió el dueño, en una línea (queda como nota)' },
            cadencia_texto: { type: 'string', description: 'cada cuánto, en palabras: "todos los lunes a las 8", "cada día a las 9", "el día 5 de cada mes"' },
            titulo: { type: 'string', description: 'nombre corto de la tarea (ej. "Vencimientos semanales")' },
          },
          required: ['herramienta', 'cadencia_texto'],
        },
      },
      async run(input) {
        const herramienta = String(input?.herramienta ?? '').trim()
        if (!HERRAMIENTAS_DE_AGENDA.includes(herramienta)) return { error: `la agenda sólo corre herramientas propias (${HERRAMIENTAS_DE_AGENDA.join(', ')}): «${herramienta}» no se puede programar` }
        const directive = String(input?.directiva ?? '').trim() || herramienta
        const cad = parseCadence(input?.cadencia_texto)
        if (!cad) return { error: `no entendí "${input?.cadencia_texto ?? ''}". Decime la cadencia en palabras, ej. "todos los lunes a las 8", "cada día a las 9" o "el día 5 de cada mes".` }
        const s = await createSchedule({
          tenantId, createdBy,
          title: String(input?.titulo || directive).slice(0, 60),
          directive: directive.slice(0, 2000),
          cadence: cad.cadence,
          herramienta,
        })
        return { ok: true, id: s.id, titulo: s.title, cuando: cad.legible, cadence: cad.cadence, proxima_corrida: s.next_run_at, nota: 'Queda corriendo sola hasta que la frenes.' }
      },
    },

    'schedule.list': {
      capability: 'drive.read',
      schema: {
        name: 'listar_tareas_programadas',
        description: 'Lista las tareas recurrentes que el OS tiene programadas (título, cronograma, próxima corrida, si está activa).',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        const items = await listSchedules()
        return {
          count: items.length,
          tareas: items.map((s) => ({ id: s.id, titulo: s.title, cuando: describeCadence(s.cadence), proxima_corrida: s.next_run_at, activa: s.enabled, ultima: s.last_run_at ?? null })),
        }
      },
    },

    'schedule.stop': {
      capability: 'drive.read',
      schema: {
        name: 'frenar_tarea',
        description: 'Frena (desactiva) una tarea programada para que deje de correr. Pasá el id (preferido) o el titulo aproximado. No la borra: se puede reactivar.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'id de la tarea (preferido)' },
            titulo: { type: 'string', description: 'título aproximado si no tenés el id' },
          },
        },
      },
      async run(input) {
        let id = input?.id
        if (!id && input?.titulo) {
          const items = await listSchedules()
          const q = String(input.titulo).toLowerCase()
          const match = items.filter((s) => String(s.title || '').toLowerCase().includes(q) || String(s.directive || '').toLowerCase().includes(q))
          if (match.length === 0) return { error: `no encontré ninguna tarea que coincida con "${input.titulo}".` }
          if (match.length > 1) return { error: `hay ${match.length} tareas que coinciden con "${input.titulo}"; decime cuál por su id.`, opciones: match.map((s) => ({ id: s.id, titulo: s.title })) }
          id = match[0].id
        }
        if (!id) return { error: 'falta el id o el título de la tarea a frenar' }
        const s = await toggleSchedule(id, false)
        return { ok: true, id, titulo: s?.title ?? null, estado: 'frenada', nota: 'Dejó de correr. Se puede reactivar cuando quieras.' }
      },
    },
  }
}
