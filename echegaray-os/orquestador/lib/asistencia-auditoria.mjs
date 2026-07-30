// AUDITORÍA DEL SKILL DE ASISTENCIA — sobre el ledger que YA existe.
//
// No hay tabla de auditoría nueva. Cada hecho se emite con `orq.emit_event`, que es el
// log append-only oficial del Work Fabric (no se puede editar ni borrar), y se consulta
// por `comunicacion.v_asistencia_auditoria`. Reusar el ledger es lo correcto acá: el
// evento de comunicación ya nace con correlation_id, así que la asistencia queda cosida
// al mensaje de Mattermost que la originó, sin inventar una segunda trazabilidad.
//
// Qué NO se guarda: tokens, secretos, ni una copia completa de la planilla. El detalle
// por trabajador se guarda como EVIDENCIA del cambio confirmado (old_value/new_value de
// las celdas que se tocaron) — no para reconstruir la asistencia después. Si alguien
// quiere saber quién trabajó el 30/7, la respuesta se lee de JORNALES, no de acá.

/** Eventos del ciclo de vida del skill. */
export const EVENTO = Object.freeze({
  STARTED: 'personal.asistencia.started',
  SHEET_READ: 'personal.asistencia.sheet_read',
  PREVIEWED: 'personal.asistencia.previewed',
  CONFIRMED: 'personal.asistencia.confirmed',
  WRITTEN: 'personal.asistencia.written',
  CONFLICT: 'personal.asistencia.conflict',
  FAILED: 'personal.asistencia.failed',
  CANCELLED: 'personal.asistencia.cancelled',
  DENIED: 'personal.asistencia.denied',
})

export const SKILL = 'personal.registrar_asistencia'
export const TIMEZONE = 'America/Argentina/San_Juan'

/** Recorta y limpia un mensaje de error para el log: nunca tokens ni secretos. */
export function sanitizarError(e) {
  return String(e?.message ?? e ?? '')
    .replace(/Bearer\s+[\w.\-]+/gi, 'Bearer ***')
    .replace(/(token|secret|key|password)[=:]\s*\S+/gi, '$1=***')
    .slice(0, 400)
}

/** Resuelve tenant/project una sola vez por proceso (igual que la ingesta del PR-4). */
function resolverIds(port) {
  let cache = null
  return async () => {
    if (cache) return cache
    const { rows } = await port.query(
      `select (select id from orq.tenants  where slug='echegaray')    as tenant_id,
              (select id from orq.projects where slug='echegaray-os') as project_id`)
    cache = rows[0]
    if (!cache?.tenant_id) throw new Error('auditoria-asistencia: falta el tenant echegaray en orq')
    return cache
  }
}

/**
 * Crea el auditor. Se le pasa el pool del OS; devuelve `registrar(evento, datos)`.
 * Nunca lanza hacia el llamador por un fallo de auditoría: la operación de negocio no
 * se cae porque no se pudo escribir un log, pero el fallo se devuelve para que el
 * handler lo pueda reportar.
 */
export function crearAuditor(port, { correlationId = null, causationId = null } = {}) {
  const ids = resolverIds(port)
  return async function registrar(evento, datos = {}) {
    try {
      const { tenant_id, project_id } = await ids()
      const payload = {
        skill_name: SKILL,
        timezone: TIMEZONE,
        ...datos,
      }
      await port.query(
        'select orq.emit_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',
        [tenant_id, 'comunicacion', null, evento, null, project_id,
          correlationId, causationId, 'low', JSON.stringify(payload)],
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, error: sanitizarError(e) }
    }
  }
}

/**
 * Arma el payload de auditoría de una confirmación con los campos que el pedido exige.
 * Está en una función aparte para que el contenido del registro sea testeable sin base.
 */
export function payloadConfirmacion({
  actor, plan, resultado, sesion, iniciadoEn, confirmadoEn, status, error,
} = {}) {
  const celdas = resultado?.celdas ?? []
  return {
    status,
    mattermost_user_id: actor?.plataforma_user_id ?? null,
    mattermost_username: actor?.plataforma_username ?? null,
    fecha_operativa: plan?.fecha ?? null,
    spreadsheet_id: plan?.spreadsheet_id ?? null,
    sheet_name: plan?.pestana ?? null,
    sheet_id: sesion?.sheet_id ?? null,
    obra_original: plan?.obra_original ?? null,
    obra_normalizada: plan?.clave_obra ?? null,
    columna: plan?.columna_letra ?? null,
    timestamp_started: iniciadoEn ?? null,
    timestamp_confirmed: confirmadoEn ?? new Date().toISOString(),
    idempotency_key: plan?.idempotency_key ?? null,
    sesion_id: sesion?.id ?? null,
    cantidad_trabajadores: plan?.resumen?.trabajadores ?? 0,
    cantidad_presentes: plan?.resumen?.presentes ?? 0,
    cantidad_ausentes: plan?.resumen?.ausentes ?? 0,
    cantidad_parciales: plan?.resumen?.parciales ?? 0,
    cantidad_bloqueadas: plan?.resumen?.bloqueadas ?? 0,
    cantidad_tarde: plan?.resumen?.tardes ?? 0,
    cantidad_con_extras: plan?.resumen?.con_extras ?? 0,
    horas_normales: plan?.resumen?.horas_normales ?? 0,
    horas_extra: plan?.resumen?.horas_extra ?? 0,
    horas_total: plan?.resumen?.horas_total ?? 0,
    // EVIDENCIA del cambio (no fuente de verdad): qué celda, de qué a qué, con el
    // desglose normal/extra de LOS DOS lados. Sin el desglose, la auditoría de una carga
    // con horas extra decía "de 11 a 12" y no se podía saber si cambió la jornada o las
    // extras — que es justo la distinción que hay que poder controlar.
    celdas_modificadas: celdas.map((c) => ({
      celda: c.celda_a1, trabajador: c.nombre_original, estado: c.estado,
      old_value: c.old_value ?? null,
      old_formula: c.old_formula ?? null,
      old_effective_value: c.old_effective_value ?? null,
      old_normal_hours: c.old_normal_hours ?? null,
      old_extra_hours: c.old_extra_hours ?? null,
      new_normal_hours: c.new_normal_hours ?? null,
      new_extra_hours: c.new_extra_hours ?? null,
      new_total_hours: c.new_total_hours ?? null,
      new_formula: c.new_formula ?? null,
      new_value: c.new_value,
    })),
    old_values: celdas.map((c) => c.old_value ?? null),
    new_values: celdas.map((c) => c.new_value),
    google_api_response_metadata: resultado?.google_meta ?? null,
    error_code: error?.code ?? resultado?.motivo ?? null,
    error_message_sanitized: error ? sanitizarError(error) : null,
  }
}
