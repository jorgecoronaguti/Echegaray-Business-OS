// LA PUERTA DE LA CARGA DE COMPROBANTES — dos cerrojos, no uno.
//
// Cargar un comprobante escribe en el Flujo de Fondos de la empresa: cambia el costo de una obra, la
// cuenta corriente de un proveedor y el IVA del período. Es efecto económico. Por eso hay dos
// cerrojos distintos y hay que pasar los dos:
//
//   1. CANAL. Sólo desde el canal oficial del área `compras`, y ese canal NO está escrito acá: sale
//      de `comunicacion.canales_area`, el mismo binding que usa el Director. Un id de Mattermost
//      hardcodeado sería configuración escondida en git que nadie puede cambiar sin desplegar.
//   2. PERMISO. Hace falta un grant activo en `comunicacion.permisos_skill`. **Siempre estricto**,
//      sin importar `ORQ_ASISTENCIA_PERMISOS`: la asistencia puede permitirse el modo abierto —el
//      costo de que un jefe no pueda cargar es mayor que el de que cargue quien no debía— pero acá
//      el efecto es plata y la asimetría se da vuelta.
//
// ESTAR EN EL CANAL NO HABILITA. Son dos preguntas distintas: "¿desde dónde?" y "¿quién?".
//
// FAIL-CLOSED SIN EXCEPCIONES. Si la base no responde, se deniega. Un permiso que se afloja cuando
// se cae Postgres no es un permiso; y del otro lado hay una planilla con la plata de la empresa.

/** Área canónica dueña del gasto de compras (`public.area_canonica`). */
export const AREA_COMPRAS = 'compras'

/** El grant que hace falta. Se otorga con `scripts/asistencia-permiso.mjs --permiso …`. */
export const PERMISO_COMPROBANTES = 'compras.comprobantes.write'

export const RECHAZO = Object.freeze({
  CANAL: 'canal',
  PERMISO: 'permiso',
  SIN_IDENTIDAD: 'sin_identidad',
  SIN_ESQUEMA: 'sin_esquema',
})

export const DETALLE = Object.freeze({
  SIN_CANAL: 'sin_canal',
  CANAL_DIRECTO: 'canal_directo',
  CANAL_NO_ES_EL_OFICIAL: 'canal_no_es_el_oficial',
  BASE_INDISPONIBLE: 'base_indisponible',
  SIN_IDENTIDAD: 'sin_identidad',
  SIN_PERMISO: 'sin_permiso',
  PERMISO_NO_VERIFICABLE: 'permiso_no_verificable',
})

/** Castellano llano: qué pasó y qué hacer. Sin ids, sin nombres de tablas, sin jerga. */
export const TEXTO = Object.freeze({
  CANAL: 'Los comprobantes se cargan sólo desde el canal de comprobantes del equipo. Mandá la foto ahí y la registro.',
  CANAL_NO_VERIFICABLE: 'No pude confirmar desde dónde estás escribiendo, así que no cargué nada. Probá de nuevo en un minuto.',
  SIN_IDENTIDAD: 'No pude reconocer quién manda el comprobante, y cada carga queda a nombre de alguien. Volvé a entrar a Mattermost y probá otra vez.',
  SIN_PERMISO: 'No tenés habilitada la carga de comprobantes. Pedísela a Dirección: se activa en el momento.',
  PERMISO_NO_VERIFICABLE: 'No pude confirmar si tenés habilitada la carga, así que no cargué nada. Probá de nuevo en un minuto.',
})

const txt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const niega = (motivo, detalle, texto) => ({ ok: false, motivo, detalle, texto })

/**
 * ¿Se puede cargar un comprobante acá y ahora?
 *
 * @param {object} o
 * @param {{query:Function}} o.port
 * @param {{plataforma_user_id?:string, channel_type?:string}} o.actor
 * @param {string} o.channelId
 * @param {string} [o.plataforma='mattermost']
 * @returns {Promise<{ok:true, canal:{id,nombre,area}}|{ok:false, motivo, detalle, texto}>}
 */
export async function puedeCargarComprobantes({ port, actor = {}, channelId, plataforma = 'mattermost' } = {}) {
  const canal = txt(channelId)
  if (!canal) return niega(RECHAZO.CANAL, DETALLE.SIN_CANAL, TEXTO.CANAL_NO_VERIFICABLE)

  // Un DM no es el canal oficial de nada, y se descarta sin gastar una consulta.
  const tipo = (txt(actor.channel_type) ?? txt(actor.channelType) ?? '').toUpperCase()
  if (tipo === 'D') return niega(RECHAZO.CANAL, DETALLE.CANAL_DIRECTO, TEXTO.CANAL)

  const oficial = await canalOficial(port, { channelId: canal, plataforma })
  if (!oficial.ok) return oficial

  const identidad = txt(actor.plataforma_user_id) ?? txt(actor.plataformaUserId) ?? txt(actor.user_id)
  if (!identidad) return niega(RECHAZO.SIN_IDENTIDAD, DETALLE.SIN_IDENTIDAD, TEXTO.SIN_IDENTIDAD)

  const permiso = await permisoEstricto(port, { plataforma, plataformaUserId: identidad })
  if (!permiso.ok) return permiso

  return { ok: true, canal: { id: canal, nombre: oficial.nombre, area: AREA_COMPRAS }, display: permiso.display ?? null }
}

/** ¿Este canal está atado al área `compras` y activo? Es DATO: se cambia sin desplegar. */
async function canalOficial(port, { channelId, plataforma }) {
  if (typeof port?.query !== 'function') {
    return niega(RECHAZO.CANAL, DETALLE.BASE_INDISPONIBLE, TEXTO.CANAL_NO_VERIFICABLE)
  }
  try {
    const { rows } = await port.query(
      `select canal_nombre from comunicacion.canales_area
        where plataforma = $1 and channel_id = $2 and area_clave = $3 and activo limit 1`,
      [plataforma, channelId, AREA_COMPRAS])
    if (!rows.length) return niega(RECHAZO.CANAL, DETALLE.CANAL_NO_ES_EL_OFICIAL, TEXTO.CANAL)
    return { ok: true, nombre: rows[0].canal_nombre ?? null }
  } catch {
    return niega(RECHAZO.CANAL, DETALLE.BASE_INDISPONIBLE, TEXTO.CANAL_NO_VERIFICABLE)
  }
}

/**
 * Grant explícito, siempre. No consulta `modoVigente()` a propósito: el modo abierto es una decisión
 * tomada para la asistencia, y heredarla acá convertiría una decisión sobre horas trabajadas en una
 * decisión sobre la caja de la empresa sin que nadie la tomara.
 */
async function permisoEstricto(port, { plataforma, plataformaUserId }) {
  try {
    const { rows } = await port.query(
      `select display from comunicacion.permisos_skill
        where plataforma = $1 and plataforma_user_id = $2 and permiso = $3 and activo limit 1`,
      [plataforma, plataformaUserId, PERMISO_COMPROBANTES])
    if (!rows.length) return niega(RECHAZO.PERMISO, DETALLE.SIN_PERMISO, TEXTO.SIN_PERMISO)
    return { ok: true, display: rows[0].display ?? null }
  } catch {
    return niega(RECHAZO.PERMISO, DETALLE.PERMISO_NO_VERIFICABLE, TEXTO.PERMISO_NO_VERIFICABLE)
  }
}
