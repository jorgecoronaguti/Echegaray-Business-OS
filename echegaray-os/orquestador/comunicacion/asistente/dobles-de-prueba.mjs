// DOBLES PARA LOS TESTS DEL ASISTENTE. No se usa en producción.
//
// Mismo criterio que el resto de la casa: los dobles están en la FRONTERA DE E/S —la base y
// la API de Anthropic— y nunca en la lógica. El intérprete, el registro, el router y el
// contrato que entran a los tests son los REALES. Doblar el router dejaría probada una
// simulación del router, que es exactamente lo que no sirve.

import { z } from 'zod'
import { resultadoOk } from './contratos.mjs'

/**
 * Base en memoria con las cuatro tablas que toca el asistente. Entiende sólo las consultas
 * que el código realmente hace: si mañana el router escribe otra, el doble falla ruidoso en
 * vez de devolver `[]` y tapar el defecto.
 */
export function baseFalsa({ identidades = [], pendientes = [], ejecuciones = [], ahora = () => new Date() } = {}) {
  const db = {
    identidades: identidades.map((i) => ({ ...i })),
    pendientes: pendientes.map((p) => ({ ...p })),
    ejecuciones: ejecuciones.map((e) => ({ ...e })),
    consultas: [],
  }
  let seq = 1

  db.query = async (sql, params = []) => {
    db.consultas.push({ sql, params })
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s.startsWith('select') && s.includes('comunicacion.identidades')) {
      const porId = s.includes('plataforma_user_id = $2')
      const filas = db.identidades.filter((i) => i.activo !== false
        && i.plataforma === params[0]
        && (!porId || String(i.plataforma_user_id) === String(params[1])))
      return { rows: filas }
    }
    if (s.startsWith('insert into comunicacion.identidades')) {
      const [plataforma, userId, username, nombre, alias, email, tz, activo] = params
      const previa = db.identidades.find((i) => i.plataforma === plataforma && i.plataforma_user_id === userId)
      const fila = { plataforma, plataforma_user_id: userId, plataforma_username: username, display: nombre, alias, email, zona_horaria: tz, activo }
      if (previa) Object.assign(previa, fila)
      else db.identidades.push(fila)
      return { rows: [{ ...fila, insertada: !previa }] }
    }
    if (s.startsWith('select') && s.includes('asistente_pendientes')) {
      const filas = db.pendientes.filter((p) => p.estado === 'abierta'
        && p.plataforma === params[0] && String(p.plataforma_user_id) === String(params[1]))
      return { rows: filas.slice(-1) }
    }
    if (s.startsWith('update comunicacion.asistente_pendientes') && s.includes('where id = $1')) {
      const p = db.pendientes.find((x) => x.id === params[0])
      if (p) p.estado = params[1]
      return { rows: [] }
    }
    if (s.startsWith('update comunicacion.asistente_pendientes')) {
      for (const p of db.pendientes) {
        if (p.estado === 'abierta' && p.plataforma === params[0] && String(p.plataforma_user_id) === String(params[1])) p.estado = 'cancelada'
      }
      return { rows: [] }
    }
    if (s.startsWith('insert into comunicacion.asistente_pendientes')) {
      const [plataforma, userId, channelId, rootPostId, capacidad, parcial, pregunta, opciones, minutos] = params
      const fila = {
        id: `pend-${seq++}`, plataforma, plataforma_user_id: userId, channel_id: channelId, root_post_id: rootPostId,
        capacidad, parcial: JSON.parse(parcial), pregunta, opciones: JSON.parse(opciones),
        estado: 'abierta', expira_at: new Date(ahora().getTime() + minutos * 60_000).toISOString(),
      }
      db.pendientes.push(fila)
      return { rows: [{ id: fila.id }] }
    }
    if (s.startsWith('select') && s.includes('asistente_ejecuciones')) {
      const e = db.ejecuciones.find((x) => x.comm_event_id === params[0] && x.capacidad === params[1])
      return { rows: e ? [e] : [] }
    }
    if (s.startsWith('insert into comunicacion.asistente_ejecuciones')) {
      const [commEventId, capacidad, userId, estado, resultado, errorCodigo] = params
      if (!db.ejecuciones.some((x) => x.comm_event_id === commEventId && x.capacidad === capacidad)) {
        db.ejecuciones.push({ comm_event_id: commEventId, capacidad, plataforma_user_id: userId, estado, resultado: JSON.parse(resultado), error_codigo: errorCodigo })
      }
      return { rows: [] }
    }
    throw new Error(`baseFalsa: consulta no contemplada → ${s.slice(0, 90)}`)
  }
  db.withTx = async (fn) => fn({ query: db.query })
  return db
}

/** Fila de identidad tal como la devuelve Postgres. */
export function filaIdentidad({ id, username = null, nombre, alias = [], email = null, activo = true }) {
  return {
    plataforma: 'mattermost', plataforma_user_id: String(id), plataforma_username: username,
    display: nombre, alias, email, zona_horaria: 'America/Argentina/San_Juan', activo,
  }
}

/**
 * Capacidad de prueba: registra con qué la llamaron y devuelve evidencia.
 * `efectoExterno` la mete en la barrera de idempotencia, igual que Calendar.
 */
export function capacidadFalsa({ id, entrada = z.object({}).passthrough(), efectoExterno = false, habilitada = async () => true, ejecutar = null, descripcion = null }) {
  const llamadas = []
  const cap = {
    id, nombre: id, descripcion: descripcion ?? `hacer ${id}`, version: '1.0.0',
    permisos: [], ejemplos: [], efectoExterno, habilitada, entrada, llamadas,
    async ejecutar(parametros, ctx) {
      llamadas.push({ parametros, ctx })
      if (ejecutar) return ejecutar(parametros, ctx)
      return resultadoOk(id, `listo: ${id}`, { id: `ext-${llamadas.length}` })
    },
  }
  return cap
}

/** Registro de capacidades inyectable: la misma forma que `registro.mjs`, sin filesystem. */
export function registroFalso(lista) {
  return {
    capacidadPorId: async (id) => lista.find((c) => c.id === id) ?? null,
    capacidadesHabilitadas: async (ctx) => {
      const out = []
      for (const c of lista) {
        let ok = false
        try { ok = (await c.habilitada(ctx)) === true } catch { ok = false }
        if (ok) out.push(c)
      }
      return out
    },
  }
}

/** `fetch` que grita si alguien lo llama: es como se prueba que NO se gastó API. */
export function fetchProhibido() {
  const f = async () => { throw new Error('se llamó a la API de Anthropic cuando no correspondía') }
  f.llamadas = 0
  return f
}

/** `fetch` que responde como la API de Anthropic con el texto que se le pase. */
export function fetchAnthropic(texto, { ok = true } = {}) {
  const llamadas = []
  const f = async (url, init) => {
    llamadas.push({ url, body: JSON.parse(init.body) })
    return { ok, json: async () => ({ content: [{ type: 'text', text: texto }] }) }
  }
  f.llamadas = llamadas
  return f
}
