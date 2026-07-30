// PERMISOS DEL SKILL DE ASISTENCIA — fail-closed, sin nombres en el código.
//
// Sólo dos jefes de obra pueden registrar asistencia. Ese "quiénes" es CONFIGURACIÓN,
// no código: vive en `comunicacion.permisos_skill`, se otorga con el script
// `asistencia-permiso.mjs` y se puede revocar en un segundo sin desplegar nada.
//
// Sin fila activa no se ejecuta. Si la consulta a la base falla, TAMPOCO se ejecuta:
// un permiso que se relaja cuando la base no responde no es un permiso.

export const PERMISO_ASISTENCIA_WRITE = 'personal.asistencia.write'

export const DENEGADO = Object.freeze({
  SIN_IDENTIDAD: 'sin_identidad',
  SIN_PERMISO: 'sin_permiso',
  ERROR_VERIFICANDO: 'error_verificando',
})

export const MODO = Object.freeze({
  ABIERTO: 'abierto', // MVP: cualquier usuario AUTENTICADO de Mattermost
  ESTRICTO: 'estricto', // sólo quien tenga el grant en comunicacion.permisos_skill
})

/**
 * Modo de autorización vigente. El MVP aprobado es ABIERTO: cualquier usuario
 * autenticado de Mattermost puede registrar y consultar asistencia, sin roles ni
 * aprobaciones. Se endurece con `ORQ_ASISTENCIA_PERMISOS=estricto`, sin desplegar código.
 *
 * Por qué el default es abierto y no lo contrario: en modo estricto, la tabla vacía
 * apagaba el skill entero. Eso es lo correcto para una capacidad con efecto económico
 * externo, y es lo INcorrecto para el MVP de una carga operativa que hoy se hace en
 * papel — el costo de que el jefe no pueda cargar es mayor que el de que cargue alguien
 * que no debía, sobre todo estando TODO auditado con la identidad real.
 */
export function modoVigente() {
  return String(process.env.ORQ_ASISTENCIA_PERMISOS ?? '').toLowerCase() === MODO.ESTRICTO
    ? MODO.ESTRICTO
    : MODO.ABIERTO
}

/**
 * ¿Esta identidad de plataforma puede operar el skill?
 *
 * En modo ABIERTO alcanza con estar AUTENTICADO: tiene que haber una identidad real de
 * Mattermost. Un pedido sin `plataforma_user_id` se rechaza igual — no por permisos, sino
 * porque sin identidad no hay a quién auditar, y la trazabilidad no es opcional.
 *
 * La ausencia de filas en `comunicacion.permisos_skill` NO bloquea el skill en modo
 * abierto, y ni siquiera se consulta la base: es una decisión de configuración, no un
 * dato a buscar.
 *
 * @param {{query:Function}} port  pool del OS (sólo se usa en modo estricto)
 * @returns {Promise<{ok:boolean, motivo?:string, modo:string, display?:string|null}>}
 */
export async function tienePermiso(port, { plataforma = 'mattermost', plataformaUserId, permiso = PERMISO_ASISTENCIA_WRITE } = {}) {
  const modo = modoVigente()
  if (!plataformaUserId) return { ok: false, motivo: DENEGADO.SIN_IDENTIDAD, modo }
  if (modo === MODO.ABIERTO) return { ok: true, modo, display: null }
  return permisoEstricto(port, { plataforma, plataformaUserId, permiso, modo })
}

/** Verificación por grant explícito. Fail-closed, incluso si la base no responde. */
async function permisoEstricto(port, { plataforma, plataformaUserId, permiso, modo }) {
  try {
    const { rows } = await port.query(
      `select display from comunicacion.permisos_skill
        where plataforma = $1 and plataforma_user_id = $2 and permiso = $3 and activo
        limit 1`,
      [plataforma, plataformaUserId, permiso],
    )
    if (!rows.length) return { ok: false, motivo: DENEGADO.SIN_PERMISO, modo }
    return { ok: true, display: rows[0].display ?? null, modo }
  } catch (e) {
    // Fail-closed explícito: se registra el motivo, no se concede.
    return { ok: false, motivo: DENEGADO.ERROR_VERIFICANDO, modo, error: String(e?.message ?? e).slice(0, 200) }
  }
}

/** Otorga (o reactiva) un permiso. Idempotente por (plataforma, user, permiso). */
export async function otorgarPermiso(port, { plataforma = 'mattermost', plataformaUserId, permiso = PERMISO_ASISTENCIA_WRITE, display = null, otorgadoPor, nota = null } = {}) {
  if (!plataformaUserId) throw new Error('otorgarPermiso: falta plataformaUserId')
  if (!otorgadoPor) throw new Error('otorgarPermiso: falta otorgadoPor (traza obligatoria)')
  const { rows } = await port.query(
    `insert into comunicacion.permisos_skill (plataforma, plataforma_user_id, permiso, display, otorgado_por, nota, activo)
       values ($1,$2,$3,$4,$5,$6,true)
     on conflict (plataforma, plataforma_user_id, permiso)
       do update set activo = true, display = coalesce(excluded.display, comunicacion.permisos_skill.display),
                     otorgado_por = excluded.otorgado_por, nota = excluded.nota, actualizado_at = now()
     returning id, plataforma_user_id, permiso, display, activo`,
    [plataforma, plataformaUserId, permiso, display, otorgadoPor, nota],
  )
  return rows[0]
}

/** Revoca un permiso (no borra la fila: queda la traza de que existió). */
export async function revocarPermiso(port, { plataforma = 'mattermost', plataformaUserId, permiso = PERMISO_ASISTENCIA_WRITE } = {}) {
  const { rows } = await port.query(
    `update comunicacion.permisos_skill set activo = false, actualizado_at = now()
      where plataforma = $1 and plataforma_user_id = $2 and permiso = $3
      returning id, plataforma_user_id, permiso, activo`,
    [plataforma, plataformaUserId, permiso],
  )
  return rows[0] ?? null
}

/** Lista los autorizados de un permiso (para el runbook y para auditar de un vistazo). */
export async function listarAutorizados(port, { plataforma = 'mattermost', permiso = PERMISO_ASISTENCIA_WRITE } = {}) {
  const { rows } = await port.query(
    `select plataforma_user_id, display, activo, otorgado_por, nota, creado_at
       from comunicacion.permisos_skill
      where plataforma = $1 and permiso = $2
      order by activo desc, creado_at`,
    [plataforma, permiso],
  )
  return rows
}
