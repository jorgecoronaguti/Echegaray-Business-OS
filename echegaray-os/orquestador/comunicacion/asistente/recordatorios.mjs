// RECORDATORIOS INTERNOS DEL OS — repositorio y reglas de la entrega.
//
// POR QUÉ SON DEL OS Y NO DE GOOGLE (lo dice también la migración, se repite acá porque es
// la decisión que gobierna todo este archivo): un recordatorio no es un evento de agenda ni
// un pendiente — es "el OS me habla a mí, o a otro, en tal momento". Si viviera en Calendar,
// el OS no podría entregarlo por Mattermost ni saber si la entrega entró.
//
// PUERTO + DOS IMPLEMENTACIONES, igual que `asistencia-sesion.mjs`: `RecordatoriosPostgres`
// para producción y `RecordatoriosMemoria` para los tests. Y una tercera pieza que es la que
// realmente importa: las REGLAS (`planReprogramacion`, `planFallo`, `backoffMs`) son
// funciones puras que usan LAS DOS implementaciones. Así lo que los tests prueban es la
// decisión de verdad — cuándo vuelve a sonar, cuándo se reintenta, cuándo se abandona — y no
// una simulación de esa decisión escrita al lado.
//
// LAS TRES BARRERAS, que son distintas y protegen cosas distintas:
//   1. CREACIÓN — `idempotency_key` (el comm_event_id del mensaje). Un reintento del mismo
//      mensaje devuelve el recordatorio que ya existe, no crea un segundo.
//   2. TOMA — claim transaccional con lease (`for update skip locked`). Dos workers vivos no
//      pueden estar entregando el mismo recordatorio a la vez.
//   3. ENTREGA — `unique (recordatorio_id, programada_para)`. Ni un reinicio en el medio, ni
//      un lease vencido, ni una reprogramación torcida pueden entregar dos veces el mismo
//      lunes a las 8. Es la única barrera que sigue en pie aunque las otras dos fallen.
//
// EL REINTENTO NO MUEVE `proxima_ejecucion`. Parece un detalle y es el corazón de la barrera
// 3: `proxima_ejecucion` ES la identidad de la ocurrencia. Si el backoff la corriera, el
// reintento entregaría "otra" ocurrencia y el índice único dejaría de reconocer el duplicado.
// El backoff se hace entonces con el LEASE (`lease_hasta` en el futuro): el claim no lo toma
// hasta que esa espera pase, y la ocurrencia sigue siendo la misma.

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { computeNextRun } from '../../lib/schedules.mjs'
import { ESTADO_RECORDATORIO, TZ_EMPRESA, zCadencia, zInstante } from './contratos.mjs'

/** Cuántas veces se intenta entregar antes de darlo por muerto. Un fallo de entrega no
 *  puede dejar el recordatorio girando para siempre contra un Mattermost que no contesta. */
export const MAX_INTENTOS_DEFAULT = 4
export const BACKOFF_BASE_MS = 60_000
export const BACKOFF_TECHO_MS = 30 * 60_000
/** Vida del lease de entrega. Holgado frente a lo que tarda un POST a Mattermost, corto
 *  frente a la tolerancia de un recordatorio: si el worker muere, otro lo retoma en 2'. */
export const LEASE_SEGUNDOS_DEFAULT = 120

export const RECHAZO = Object.freeze({
  NO_EXISTE: 'recordatorio_no_existe',
  AJENO: 'recordatorio_ajeno',
  CERRADO: 'recordatorio_cerrado',
})

const ESTADO_ENTREGA = Object.freeze({ ENTREGADA: 'entregada', FALLIDA: 'fallida' })
export { ESTADO_ENTREGA }

// ── Formas de entrada ────────────────────────────────────────────────────────

/** Una persona: el id de plataforma alcanza; el nombre visible es para el texto del chat. */
const zPersona = z.union([
  z.string().min(1).transform((userId) => ({ userId, display: null })),
  z.object({ userId: z.string().min(1), display: z.string().nullable().default(null) }),
])

const zCrear = z.object({
  plataforma: z.string().default('mattermost'),
  creador: zPersona,
  destinatario: zPersona.nullable().default(null), // null ⇒ a sí mismo
  // `.trim()` ANTES del `.min(1)`: "   " tiene largo 3 y pasaría, dejando un recordatorio
  // que suena sin decir nada. Lo que se valida es el contenido, no la cantidad de espacios.
  contenido: z.string().trim().min(1).max(500),
  cuando: zInstante,
  cadencia: zCadencia.nullable().default(null),
  zonaHoraria: z.string().default(TZ_EMPRESA),
  idempotencyKey: z.string().min(1).nullable().default(null),
  correlationId: z.string().uuid().nullable().default(null),
})

/** Normaliza los argumentos de creación y resuelve el destinatario implícito (uno mismo). */
function normalizarCreacion(args) {
  const a = zCrear.parse(args ?? {})
  return { ...a, destinatario: a.destinatario ?? a.creador }
}

/** Un instante, siempre en la misma forma, para que dos escrituras de la misma ocurrencia
 *  produzcan la misma clave. Sin esto la barrera 3 se puede esquivar con un string distinto. */
const aISO = (x) => new Date(x).toISOString()

// ── Reglas puras (las comparten las dos implementaciones) ─────────────────────

/** Espera creciente y ACOTADA. Sin techo, el cuarto intento caería fuera de todo horario útil. */
export function backoffMs(intento, { base = BACKOFF_BASE_MS, techo = BACKOFF_TECHO_MS } = {}) {
  return Math.min(base * 2 ** Math.max(0, Number(intento) - 1), techo)
}

/**
 * Qué pasa con el recordatorio DESPUÉS de una entrega exitosa.
 *
 * La próxima ocurrencia se calcula desde `proxima_ejecucion` — la que se acaba de entregar —
 * y NUNCA desde "ahora". Es la única base que no puede saltear: si el worker estuvo caído,
 * calcular desde ahora se comería las ocurrencias perdidas en silencio. La contracara asumida
 * es que al volver de una caída larga se entregan los atrasos de a uno (cada uno con su
 * `programada_para` propia, así que ninguno se duplica).
 */
export function planReprogramacion(rec, ahora = Date.now()) {
  if (!rec?.cadencia) {
    return { estado: ESTADO_RECORDATORIO.ENTREGADO, proximaEjecucion: aISO(rec.proxima_ejecucion), cerrado: true }
  }
  const siguiente = computeNextRun(rec.cadencia, new Date(rec.proxima_ejecucion))
  return {
    estado: ESTADO_RECORDATORIO.ACTIVO,
    proximaEjecucion: aISO(siguiente ?? new Date(ahora + 86_400_000)),
    cerrado: false,
  }
}

/** Qué pasa después de una entrega fallida: reintento con espera, o dead-letter. */
export function planFallo(rec, { maxIntentos = MAX_INTENTOS_DEFAULT, ahora = Date.now() } = {}) {
  const intentos = Number(rec?.intentos ?? 0) + 1
  if (intentos >= maxIntentos) return { agotado: true, intentos, esperaMs: 0, reintentaEn: null }
  const esperaMs = backoffMs(intentos)
  return { agotado: false, intentos, esperaMs, reintentaEn: aISO(ahora + esperaMs) }
}

/** Cancelar es un acto de propiedad: sólo el que lo creó o el que lo recibe. */
export function puedeCancelar(rec, porUserId) {
  return Boolean(rec) && (rec.creador_user_id === porUserId || rec.destinatario_user_id === porUserId)
}

/** ¿Es un recordatorio que la persona se puso a sí misma? Decide el texto de la entrega. */
export const esPropio = (rec) => rec?.creador_user_id === rec?.destinatario_user_id

const DOW_TEXTO = { dom: 'domingos', lun: 'lunes', mar: 'martes', mie: 'miércoles', mié: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábados', sáb: 'sábados' }

/**
 * Cadencia → castellano, para que la confirmación sea VERIFICABLE: la persona tiene que
 * poder leer "todos los lunes a las 08:00" y darse cuenta al instante de que quiso decir
 * martes. Un "listo, lo programé" sin la fecha adentro no se puede desmentir.
 */
export function frecuenciaEnTexto(cadencia) {
  const p = String(cadencia || '').toLowerCase().split(':')
  if (p[0] === 'daily') return `todos los días a las ${p[1]}:${p[2]}`
  if (p[0] === 'weekly') return `todos los ${DOW_TEXTO[p[1]] ?? p[1]} a las ${p[2]}:${p[3]}`
  if (p[0] === 'monthly') return `el ${Number(p[1])} de cada mes a las ${p[2]}:${p[3]}`
  return null
}

/** Fila de la base → la forma pública del contrato compartido (`zRecordatorio`). */
export function aContrato(rec) {
  return {
    id: String(rec.id),
    creadorUserId: rec.creador_user_id,
    creadorDisplay: rec.creador_display ?? null,
    destinatarioUserId: rec.destinatario_user_id,
    destinatarioDisplay: rec.destinatario_display ?? null,
    contenido: rec.contenido,
    cadencia: rec.cadencia ?? null,
    zonaHoraria: rec.zona_horaria ?? TZ_EMPRESA,
    proximaEjecucion: aISO(rec.proxima_ejecucion),
    estado: rec.estado,
  }
}

// ── Implementación en MEMORIA (tests) ────────────────────────────────────────

export class RecordatoriosMemoria {
  constructor({ ahora = () => Date.now() } = {}) {
    this.filas = []
    this.entregas = []
    this.ahora = ahora
  }

  async crear(args) {
    const a = normalizarCreacion(args)
    if (a.idempotencyKey) {
      const ya = this.filas.find((f) => f.idempotency_key === a.idempotencyKey)
      if (ya) return { ...ya, duplicado: true }
    }
    const t = new Date(this.ahora()).toISOString()
    const fila = {
      id: randomUUID(), plataforma: a.plataforma,
      creador_user_id: a.creador.userId, creador_display: a.creador.display ?? null,
      destinatario_user_id: a.destinatario.userId, destinatario_display: a.destinatario.display ?? null,
      contenido: a.contenido, cadencia: a.cadencia, zona_horaria: a.zonaHoraria,
      proxima_ejecucion: aISO(a.cuando), estado: ESTADO_RECORDATORIO.ACTIVO,
      intentos: 0, ultimo_error: null, idempotency_key: a.idempotencyKey,
      correlation_id: a.correlationId, lease_hasta: null, lease_worker: null,
      creado_at: t, actualizado_at: t, cerrado_at: null,
    }
    this.filas.push(fila)
    return { ...fila, duplicado: false }
  }

  async porId(id) { return this.filas.find((f) => f.id === id) ?? null }

  async listarDe(userId, { estado = ESTADO_RECORDATORIO.ACTIVO, plataforma = 'mattermost' } = {}) {
    return this.filas
      .filter((f) => f.plataforma === plataforma
        && (f.destinatario_user_id === userId || f.creador_user_id === userId)
        && (estado == null || f.estado === estado))
      .sort((a, b) => Date.parse(a.proxima_ejecucion) - Date.parse(b.proxima_ejecucion))
      .map((f) => ({ ...f }))
  }

  async cancelar(id, porUserId) {
    const f = this.filas.find((x) => x.id === id)
    if (!f) return { ok: false, motivo: RECHAZO.NO_EXISTE }
    if (!puedeCancelar(f, porUserId)) return { ok: false, motivo: RECHAZO.AJENO }
    if (f.estado !== ESTADO_RECORDATORIO.ACTIVO) return { ok: false, motivo: RECHAZO.CERRADO, recordatorio: { ...f } }
    Object.assign(f, {
      estado: ESTADO_RECORDATORIO.CANCELADO, lease_hasta: null, lease_worker: null,
      cerrado_at: new Date(this.ahora()).toISOString(), actualizado_at: new Date(this.ahora()).toISOString(),
    })
    return { ok: true, recordatorio: { ...f } }
  }

  async reclamarVencidos({ worker, limite = 20, ahora = this.ahora(), leaseSegundos = LEASE_SEGUNDOS_DEFAULT } = {}) {
    const t = new Date(ahora).getTime()
    const hasta = new Date(t + leaseSegundos * 1000).toISOString()
    const elegibles = this.filas
      .filter((f) => f.estado === ESTADO_RECORDATORIO.ACTIVO
        && Date.parse(f.proxima_ejecucion) <= t
        && (!f.lease_hasta || Date.parse(f.lease_hasta) < t))
      .sort((a, b) => Date.parse(a.proxima_ejecucion) - Date.parse(b.proxima_ejecucion))
      .slice(0, limite)
    for (const f of elegibles) { f.lease_hasta = hasta; f.lease_worker = worker ?? null }
    return elegibles.map((f) => ({ ...f }))
  }

  async yaEntregada(recordatorioId, programadaPara) {
    const k = aISO(programadaPara)
    return this.entregas.some((e) => e.recordatorio_id === recordatorioId
      && e.programada_para === k && e.estado === ESTADO_ENTREGA.ENTREGADA)
  }

  async registrarEntrega(rec, { programadaPara, estado, canalId = null, postId = null, error = null, intento = 1 }) {
    const k = aISO(programadaPara ?? rec.proxima_ejecucion)
    const ya = this.entregas.find((e) => e.recordatorio_id === rec.id && e.programada_para === k)
    // Un intento fallido ocupa la clave de la ocurrencia pero NO la cierra: el reintento que
    // sí entra lo pisa. Lo que es un muro es una entrega que YA salió.
    if (ya && ya.estado === ESTADO_ENTREGA.ENTREGADA) return { ok: true, duplicado: true, entrega: { ...ya } }
    const fila = {
      id: this.entregas.length + 1, recordatorio_id: rec.id, programada_para: k,
      estado, canal_id: canalId, post_id: postId, error: error ? String(error).slice(0, 500) : null,
      intento, creado_at: new Date(this.ahora()).toISOString(),
    }
    if (ya) Object.assign(ya, fila, { id: ya.id })
    else this.entregas.push(fila)
    return { ok: true, duplicado: false, entrega: { ...(ya ?? fila) } }
  }

  async reprogramar(rec) {
    const f = this.filas.find((x) => x.id === rec.id)
    if (!f) return null
    const plan = planReprogramacion(f, this.ahora())
    Object.assign(f, {
      estado: plan.estado, proxima_ejecucion: plan.proximaEjecucion, intentos: 0, ultimo_error: null,
      lease_hasta: null, lease_worker: null,
      cerrado_at: plan.cerrado ? new Date(this.ahora()).toISOString() : null,
      actualizado_at: new Date(this.ahora()).toISOString(),
    })
    return { ...f }
  }

  async marcarFallido(rec, error, { maxIntentos = MAX_INTENTOS_DEFAULT } = {}) {
    const f = this.filas.find((x) => x.id === rec.id)
    if (!f) return null
    const plan = planFallo(f, { maxIntentos, ahora: this.ahora() })
    Object.assign(f, {
      intentos: plan.intentos, ultimo_error: String(error ?? '').slice(0, 500),
      actualizado_at: new Date(this.ahora()).toISOString(),
      ...(plan.agotado
        ? { estado: ESTADO_RECORDATORIO.FALLIDO, lease_hasta: null, lease_worker: null, cerrado_at: new Date(this.ahora()).toISOString() }
        // El backoff vive en el LEASE, no en proxima_ejecucion: ver el encabezado del archivo.
        : { lease_hasta: plan.reintentaEn }),
    })
    return { ...f, agotado: plan.agotado }
  }
}

// ── Implementación en POSTGRES (producción) ──────────────────────────────────

const COLS = `plataforma, creador_user_id, creador_display, destinatario_user_id,
  destinatario_display, contenido, cadencia, zona_horaria, proxima_ejecucion,
  idempotency_key, correlation_id`

export class RecordatoriosPostgres {
  /** @param {{query:Function, withTx:Function}} port
   *  Exige las dos capacidades al construirse, no al usarse: `crear` y `reclamarVencidos`
   *  necesitan transacción, y un port sin `withTx` fallaría recién en producción. */
  constructor(port) {
    if (!port?.query) throw new Error('RecordatoriosPostgres: falta el port')
    if (typeof port.withTx !== 'function') throw new Error('RecordatoriosPostgres: el port no sabe abrir transacciones (falta withTx)')
    this.port = port
  }

  async crear(args) {
    const a = normalizarCreacion(args)
    const vals = [a.plataforma, a.creador.userId, a.creador.display, a.destinatario.userId,
      a.destinatario.display, a.contenido, a.cadencia, a.zonaHoraria, aISO(a.cuando),
      a.idempotencyKey, a.correlationId]
    // `do nothing` + relectura en vez de un select previo: dos mensajes gemelos en vuelo al
    // mismo tiempo no se pisan, gana el índice único y el segundo lee lo que escribió el primero.
    const { rows } = await this.port.query(
      `insert into comunicacion.recordatorios (${COLS})
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (idempotency_key) where idempotency_key is not null do nothing
       returning *`, vals)
    if (rows.length) return { ...rows[0], duplicado: false }
    const ya = await this.port.query(
      'select * from comunicacion.recordatorios where idempotency_key = $1', [a.idempotencyKey])
    if (!ya.rows.length) throw new Error('crear recordatorio: no se insertó ni existe (idempotency_key)')
    return { ...ya.rows[0], duplicado: true }
  }

  async porId(id) {
    const { rows } = await this.port.query('select * from comunicacion.recordatorios where id = $1', [id])
    return rows[0] ?? null
  }

  async listarDe(userId, { estado = ESTADO_RECORDATORIO.ACTIVO, plataforma = 'mattermost', limite = 50 } = {}) {
    const { rows } = await this.port.query(
      `select * from comunicacion.recordatorios
        where plataforma = $1
          and (destinatario_user_id = $2 or creador_user_id = $2)
          and ($3::text is null or estado = $3)
        order by proxima_ejecucion asc limit $4`,
      [plataforma, userId, estado ?? null, limite])
    return rows
  }

  async cancelar(id, porUserId) {
    const rec = await this.porId(id)
    if (!rec) return { ok: false, motivo: RECHAZO.NO_EXISTE }
    if (!puedeCancelar(rec, porUserId)) return { ok: false, motivo: RECHAZO.AJENO }
    const { rows } = await this.port.query(
      `update comunicacion.recordatorios
          set estado = $2, lease_hasta = null, lease_worker = null,
              cerrado_at = now(), actualizado_at = now()
        where id = $1 and estado = $3 returning *`,
      [id, ESTADO_RECORDATORIO.CANCELADO, ESTADO_RECORDATORIO.ACTIVO])
    if (!rows.length) return { ok: false, motivo: RECHAZO.CERRADO, recordatorio: rec }
    return { ok: true, recordatorio: rows[0] }
  }

  /** Claim con lease. `for update skip locked` es lo que impide que dos workers se lleven el
   *  mismo recordatorio: el segundo saltea la fila bloqueada en vez de esperarla. */
  async reclamarVencidos({ worker, limite = 20, ahora = new Date(), leaseSegundos = LEASE_SEGUNDOS_DEFAULT } = {}) {
    const t = aISO(ahora)
    return this.port.withTx(async (client) => {
      const { rows } = await client.query(
        `update comunicacion.recordatorios r
            set lease_hasta = $1::timestamptz + make_interval(secs => $2),
                lease_worker = $3, actualizado_at = now()
          where r.id in (
            select id from comunicacion.recordatorios
             where estado = $4 and proxima_ejecucion <= $1::timestamptz
               and (lease_hasta is null or lease_hasta < $1::timestamptz)
             order by proxima_ejecucion asc limit $5
             for update skip locked)
        returning r.*`,
        [t, leaseSegundos, worker ?? null, ESTADO_RECORDATORIO.ACTIVO, limite])
      return rows
    })
  }

  async yaEntregada(recordatorioId, programadaPara) {
    const { rows } = await this.port.query(
      `select 1 from comunicacion.recordatorio_entregas
        where recordatorio_id = $1 and programada_para = $2::timestamptz and estado = $3 limit 1`,
      [recordatorioId, aISO(programadaPara), ESTADO_ENTREGA.ENTREGADA])
    return rows.length > 0
  }

  /**
   * Registra el resultado de UNA ocurrencia. El conflicto contra
   * `unique (recordatorio_id, programada_para)` NO es un error: es "esto ya se entregó".
   * El `where e.estado = 'fallida'` es lo que deja que un reintento exitoso pise su propio
   * intento fallido sin abrirle la puerta a una segunda entrega real.
   */
  async registrarEntrega(rec, { programadaPara, estado, canalId = null, postId = null, error = null, intento = 1 }) {
    const { rows } = await this.port.query(
      `insert into comunicacion.recordatorio_entregas as e
         (recordatorio_id, programada_para, estado, canal_id, post_id, error, intento)
       values ($1, $2::timestamptz, $3, $4, $5, $6, $7)
       on conflict (recordatorio_id, programada_para) do update
          set estado = excluded.estado, canal_id = excluded.canal_id, post_id = excluded.post_id,
              error = excluded.error, intento = excluded.intento, creado_at = now()
        where e.estado = $8
       returning id, estado`,
      [rec.id, aISO(programadaPara ?? rec.proxima_ejecucion), estado, canalId, postId,
        error ? String(error).slice(0, 500) : null, intento, ESTADO_ENTREGA.FALLIDA])
    if (!rows.length) return { ok: true, duplicado: true, entrega: null }
    return { ok: true, duplicado: false, entrega: rows[0] }
  }

  async reprogramar(rec) {
    const plan = planReprogramacion(rec)
    const { rows } = await this.port.query(
      `update comunicacion.recordatorios
          set estado = $2, proxima_ejecucion = $3::timestamptz, intentos = 0, ultimo_error = null,
              lease_hasta = null, lease_worker = null,
              cerrado_at = case when $4::boolean then now() else null end, actualizado_at = now()
        where id = $1 returning *`,
      [rec.id, plan.estado, plan.proximaEjecucion, plan.cerrado])
    return rows[0] ?? null
  }

  async marcarFallido(rec, error, { maxIntentos = MAX_INTENTOS_DEFAULT } = {}) {
    const plan = planFallo(rec, { maxIntentos })
    const detalle = String(error ?? '').slice(0, 500)
    if (plan.agotado) {
      const { rows } = await this.port.query(
        `update comunicacion.recordatorios
            set estado = $2, intentos = $3, ultimo_error = $4, lease_hasta = null,
                lease_worker = null, cerrado_at = now(), actualizado_at = now()
          where id = $1 returning *`,
        [rec.id, ESTADO_RECORDATORIO.FALLIDO, plan.intentos, detalle])
      return rows[0] ? { ...rows[0], agotado: true } : null
    }
    // Sigue activo y con la MISMA `proxima_ejecucion`: la espera se hace corriendo el lease.
    const { rows } = await this.port.query(
      `update comunicacion.recordatorios
          set intentos = $2, ultimo_error = $3, lease_hasta = $4::timestamptz, actualizado_at = now()
        where id = $1 returning *`,
      [rec.id, plan.intentos, detalle, plan.reintentaEn])
    return rows[0] ? { ...rows[0], agotado: false } : null
  }
}
