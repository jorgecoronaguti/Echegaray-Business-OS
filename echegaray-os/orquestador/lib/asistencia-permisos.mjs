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

/**
 * ¿Esta identidad de plataforma tiene este permiso?
 * @param {{query:Function}} port  pool del OS
 * @returns {Promise<{ok:boolean, motivo?:string, display?:string|null}>}
 */
export async function tienePermiso(port, { plataforma = 'mattermost', plataformaUserId, permiso = PERMISO_ASISTENCIA_WRITE } = {}) {
  if (!plataformaUserId) return { ok: false, motivo: DENEGADO.SIN_IDENTIDAD }
  try {
    const { rows } = await port.query(
      `select display from comunicacion.permisos_skill
        where plataforma = $1 and plataforma_user_id = $2 and permiso = $3 and activo
        limit 1`,
      [plataforma, plataformaUserId, permiso],
    )
    if (!rows.length) return { ok: false, motivo: DENEGADO.SIN_PERMISO }
    return { ok: true, display: rows[0].display ?? null }
  } catch (e) {
    // Fail-closed explícito: se registra el motivo, no se concede.
    return { ok: false, motivo: DENEGADO.ERROR_VERIFICANDO, error: String(e?.message ?? e).slice(0, 200) }
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
