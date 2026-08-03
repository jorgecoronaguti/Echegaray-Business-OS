// PERMISOS DEL SKILL DE ASISTENCIA — dos modos, uno solo activo.
//
// MVP APROBADO (default): modo ABIERTO. Cualquier usuario AUTENTICADO de Mattermost
// registra y consulta. No hay roles, ni aprobaciones, ni lista de habilitados, y la
// tabla `comunicacion.permisos_skill` vacía NO bloquea nada — ni se consulta.
// Lo único no negociable es la identidad real: todo queda auditado con ella.
//
// MODO ESTRICTO (`ORQ_ASISTENCIA_PERMISOS=estricto`, que es lo que corre hoy en producción):
// opera quien tenga un grant activo en `comunicacion.permisos_skill` **o quien sea miembro del
// canal oficial del área**. El "quiénes" es CONFIGURACIÓN, no código: se otorga con el script
// `asistencia-permiso.mjs` —o agregando a la persona al canal— y se revoca en un segundo sin
// desplegar. Ahí sí es fail-closed: sin ninguna de las dos vías no se ejecuta, y si no se pudo
// preguntar tampoco — un permiso que se relaja cuando la base o Mattermost se caen no es un
// permiso. Las dos vías viven en `lib/permiso-de-canal.mjs`, compartidas con comprobantes.
//
// La infraestructura del modo estricto queda escrita y probada a propósito: endurecer
// es cambiar una variable de entorno, no volver a construir esto.

import { puedeOperar, VIA as VIA_PERMISO, MOTIVO as MOTIVO_PERMISO } from './permiso-de-canal.mjs'

export const PERMISO_ASISTENCIA_WRITE = 'personal.asistencia.write'

/** Por dónde entró el permiso. Se audita: sirve para saber quién opera por membresía y quién por
 *  grant, que es la diferencia entre «lo agregaron al canal» y «Dirección lo habilitó». */
export const VIA = Object.freeze({ ...VIA_PERMISO, MODO_ABIERTO: 'modo_abierto' })

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
export async function tienePermiso(port, {
  plataforma = 'mattermost', plataformaUserId, permiso = PERMISO_ASISTENCIA_WRITE,
  canalOficial = null, mattermost = undefined, log = null,
} = {}) {
  const modo = modoVigente()
  if (!plataformaUserId) return { ok: false, motivo: DENEGADO.SIN_IDENTIDAD, modo }
  if (modo === MODO.ABIERTO) return { ok: true, modo, display: null, via: VIA.MODO_ABIERTO }
  return permisoEstricto(port, { plataforma, plataformaUserId, permiso, modo, canalOficial, mattermost, log })
}

/**
 * Modo estricto: grant explícito O membresía del canal oficial. Fail-closed en las dos vías.
 *
 * LA SEGUNDA VÍA ES DEL 03/08 y responde al pedido textual del dueño: «que las personas agregadas
 * al canal todas puedan cargar». Hasta ese día, sumar a alguien al canal de Asistencia no lo
 * habilitaba: había que correr `scripts/asistencia-permiso.mjs` aparte, y en la práctica eso
 * significaba que el jefe de obra nuevo veía el formulario y recibía «no tenés habilitada la carga».
 *
 * La lógica no vive acá: vive en `lib/permiso-de-canal.mjs`, compartida con la guarda de
 * comprobantes, que tiene el mismo pedido. Este archivo sólo traduce sus motivos a los suyos.
 */
async function permisoEstricto(port, { plataforma, plataformaUserId, permiso, modo, canalOficial, mattermost, log }) {
  const r = await puedeOperar({ port, plataforma, plataformaUserId, permiso, canalOficial, mattermost, log })
  if (r.ok) return { ok: true, display: r.display ?? null, modo, via: r.via }
  return r.motivo === MOTIVO_PERMISO.NO_VERIFICABLE
    // El detalle viene ya recortado por la lib: la traza no puede llevarse un mensaje entero de
    // driver, que es de donde salen las filtraciones que nadie mira hasta que se leen.
    ? { ok: false, motivo: DENEGADO.ERROR_VERIFICANDO, modo, error: r.error ?? '' }
    : { ok: false, motivo: DENEGADO.SIN_PERMISO, modo }
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
