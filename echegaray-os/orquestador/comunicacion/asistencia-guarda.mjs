// GUARDA DE CANAL Y PERMISOS DE LA ASISTENCIA — la puerta, antes de la puerta.
//
// Toda carga de asistencia entra por acá, y entra ANTES de que exista un solo pedido caro:
// antes de abrir sesión, antes de leer JORNALES, antes de hablar con Google. Negar después
// de haber leído la planilla cuesta segundos, cuota de API y un mensaje tardío al jefe de
// obra; negar acá cuesta, en el peor caso, una consulta a la base.
//
// QUÉ DECIDE, en este orden, y por qué en este orden:
//
//   1. CANAL (gratis). La forma del pedido y el tipo de canal: un mensaje directo, un grupo
//      armado a mano o una acción que dice venir de otro lado se rechazan sin tocar la base.
//   2. CANAL (una consulta). El canal oficial NO está escrito en este archivo: sale del
//      binding `comunicacion.canales_area` — el mismo dato que usa el Director. Un id de
//      Mattermost escrito a mano sería una configuración escondida en git, que nadie puede
//      cambiar sin desplegar; hay un test acá abajo que falla si aparece uno.
//   3. IDENTIDAD (gratis). Sin identidad real de la plataforma no hay a quién auditar, y una
//      escritura en la planilla de jornales sin nombre no es una escritura: es un agujero.
//   4. PERMISO. Con `lib/asistencia-permisos.mjs`, el sistema que YA existe. Acá no se
//      inventa un segundo sistema de permisos ni se lo modifica: se lo consulta. Desde el
//      03/08 ese sistema acepta DOS vías —el grant explícito y la membresía del canal
//      oficial— y por eso el paso 4 recibe el canal que el paso 2 acaba de validar.
//      SIGUEN SIENDO DOS PREGUNTAS: «¿desde dónde?» la contesta el binding, «¿quién?» la
//      contesta el permiso. Que la segunda ahora pueda contestarse mirando el canal no las
//      fusiona: un pedido desde otro canal muere en el paso 2 y nunca llega al 4.
//
// POR QUÉ LA CARGA VIVE EN UN SOLO CANAL. La asistencia es un acto de equipo con efecto
// económico: lo que se carga se ve, se corrige a la vista de todos y queda en un lugar
// donde Dirección lo mira. Por privado no hay testigo, y en un canal cualquiera el dato de
// las personas queda donde no corresponde.
//
// FAIL-CLOSED SIN EXCEPCIONES. Si la base no responde, si la identidad no llegó, si el
// pedido se contradice a sí mismo: se deniega. Una guarda que se relaja cuando el sistema
// falla no es una guarda. El costo de que el jefe reintente en un minuto es chico; el de
// escribir jornales de una obra ajena, no.
//
// LO QUE ESTE ARCHIVO NO HACE, a propósito: no lee JORNALES, no abre sesión, no publica en
// Mattermost, no escribe en la base y no razona con un modelo. Devuelve un veredicto.

import { tienePermiso, PERMISO_ASISTENCIA_WRITE, DENEGADO } from '../lib/asistencia-permisos.mjs'

/** Motivos de rechazo. Contrato con la integración: son estos tres y no más. */
export const RECHAZO = Object.freeze({
  CANAL: 'canal',
  PERMISO: 'permiso',
  SIN_IDENTIDAD: 'sin_identidad',
})

/**
 * Área canónica dueña de la asistencia (`public.area_canonica`). Es una CLAVE DE NEGOCIO
 * estable, no una configuración de Mattermost: qué canal está atado a esta área es el dato
 * que se puede cambiar sin desplegar.
 */
export const AREA_ASISTENCIA = 'personas'

/**
 * Detalle interno del rechazo. Va a la auditoría y a los logs, NUNCA al chat: sirve para
 * que Dirección entienda qué pasó sin que el jefe de obra lea jerga.
 */
export const DETALLE = Object.freeze({
  SIN_CANAL: 'sin_canal',
  CANAL_DIRECTO: 'canal_directo',
  CANAL_GRUPO: 'canal_grupo',
  CANAL_INCOHERENTE: 'canal_incoherente',
  HILO_DE_OTRO_CANAL: 'hilo_de_otro_canal',
  CANAL_NO_ES_EL_OFICIAL: 'canal_no_es_el_oficial',
  BASE_INDISPONIBLE: 'base_indisponible',
  SIN_IDENTIDAD: 'sin_identidad',
  SIN_PERMISO: 'sin_permiso',
  PERMISO_NO_VERIFICABLE: 'permiso_no_verificable',
})

/** Castellano rioplatense, sin jerga, sin ids, sin nombres de tablas. Qué pasó y qué hacer. */
export const TEXTO = Object.freeze({
  CANAL: [
    'La asistencia se carga sólo en el canal de asistencia del equipo.',
    'Entrá a ese canal y escribí ahí `@os asistencia`. Por mensaje privado, en un grupo o en otro canal no la registro.',
  ].join(' '),
  CANAL_NO_VERIFICABLE: [
    'No pude confirmar desde dónde estás escribiendo, así que no registré nada.',
    'Probá de nuevo en un minuto; si sigue igual, avisale a Dirección.',
  ].join(' '),
  SIN_IDENTIDAD: [
    'No pude reconocer quién está cargando, y la asistencia siempre queda a nombre de alguien.',
    'Cerrá sesión, volvé a entrar a Mattermost y probá otra vez.',
  ].join(' '),
  SIN_PERMISO: [
    'No tenés habilitada la carga de asistencia.',
    'Pedísela a Dirección: se activa en el momento y volvés a intentar.',
  ].join(' '),
  PERMISO_NO_VERIFICABLE: [
    'No pude confirmar si tenés habilitada la carga de asistencia, así que no registré nada.',
    'Probá de nuevo en un minuto; si sigue igual, avisale a Dirección.',
  ].join(' '),
})

const texto = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null)
const niega = (motivo, detalle, txt) => ({ ok: false, motivo, detalle, texto: txt })

/**
 * ¿Se puede iniciar una carga de asistencia acá y ahora?
 *
 * @param {object} o
 * @param {{query:Function}} o.port           pool del OS (sólo lectura del binding y del permiso)
 * @param {{plataforma_user_id?:string, channel_id?:string, channel_type?:string,
 *          root_post_id?:string, root_channel_id?:string}} o.actor  quién escribe y desde dónde
 * @param {string} o.channelId                canal del mensaje, según la plataforma
 * @param {string} [o.plataforma='mattermost']
 * @returns {Promise<{ok:true, canal:{id:string, nombre:string, area:string}, modoPermisos:string|null}
 *                 |{ok:false, motivo:string, detalle:string, texto:string}>}
 */
export async function puedeCargar({ port, actor, channelId, plataforma, mattermost } = {}) {
  const red = texto(plataforma) ?? 'mattermost'

  // 1) Canal, a costo cero: forma, tipo y coherencia del pedido.
  const forma = canalDelPedido({ actor, channelId })
  if (!forma.ok) return forma

  // 2) Canal, contra el binding: ¿este canal es el canal oficial del área `personas`?
  const oficial = await canalOficial(port, { channelId: forma.canal, plataforma: red })
  if (!oficial.ok) return oficial

  // 3) Identidad: sin ella no hay a quién auditar. Se corta antes de gastar el permiso.
  const identidad = texto(actor?.plataforma_user_id) ?? texto(actor?.plataformaUserId) ?? texto(actor?.user_id)
  if (!identidad) return niega(RECHAZO.SIN_IDENTIDAD, DETALLE.SIN_IDENTIDAD, TEXTO.SIN_IDENTIDAD)

  // 4) Permiso, con el sistema que ya existe (no se crea uno nuevo acá).
  //
  // EL CANAL VIAJA AL VERIFICADOR, y por eso el paso 2 tiene que haber corrido antes: lo que se
  // le pasa es el canal YA CONFIRMADO como oficial del área, no el que declaró el pedido. Estar
  // en ese canal es, desde el 03/08, una de las dos vías del permiso; estar en un canal cualquiera
  // no habilita nada, porque ese canal jamás llega hasta acá.
  const permiso = await verificarPermiso(port, {
    plataforma: red, plataformaUserId: identidad, canalOficial: forma.canal, mattermost,
  })
  if (!permiso.ok) return permiso

  return {
    ok: true,
    canal: { id: forma.canal, nombre: oficial.nombre, area: AREA_ASISTENCIA },
    modoPermisos: permiso.modo ?? null,
    via: permiso.via ?? null,
  }
}

/**
 * Canal efectivo del pedido, o el rechazo. Todo lo que se decide acá es en memoria.
 *
 * HILOS DE OTROS CANALES. En Mattermost una respuesta hereda el `channel_id` de la raíz del
 * hilo, así que un hilo que vive en otro canal llega con el id de ESE canal y muere en el
 * paso siguiente, contra el binding. Lo que se ataja acá es lo otro: cuando el pedido trae
 * DOS versiones del canal (el del mensaje y el del hilo o el que declara la acción) y no
 * coinciden. Un pedido que se contradice a sí mismo no se interpreta a favor: se rechaza.
 */
function canalDelPedido({ actor, channelId }) {
  const canal = texto(channelId)
  if (!canal) return niega(RECHAZO.CANAL, DETALLE.SIN_CANAL, TEXTO.CANAL_NO_VERIFICABLE)

  const tipo = (texto(actor?.channel_type) ?? texto(actor?.canal_tipo) ?? '').toUpperCase()
  if (tipo === 'D') return niega(RECHAZO.CANAL, DETALLE.CANAL_DIRECTO, TEXTO.CANAL)
  if (tipo === 'G') return niega(RECHAZO.CANAL, DETALLE.CANAL_GRUPO, TEXTO.CANAL)

  const declarado = texto(actor?.channel_id) ?? texto(actor?.channelId)
  if (declarado && declarado !== canal) {
    return niega(RECHAZO.CANAL, DETALLE.CANAL_INCOHERENTE, TEXTO.CANAL)
  }
  const delHilo = texto(actor?.root_channel_id) ?? texto(actor?.hilo_channel_id)
  if (delHilo && delHilo !== canal) {
    return niega(RECHAZO.CANAL, DETALLE.HILO_DE_OTRO_CANAL, TEXTO.CANAL)
  }
  return { ok: true, canal }
}

/**
 * ¿El canal está atado al área `personas` y activo? Es DATO, no código: la fila se agrega o
 * se desactiva sin desplegar, y desactivarla apaga la carga en el acto.
 *
 * Un binding apagado y un canal que nunca estuvo atado dan el mismo resultado a propósito:
 * de cara al jefe de obra son la misma situación, y el detalle interno alcanza para Dirección.
 */
/**
 * El id del canal SÓLO si es el oficial del área, y `null` si no lo es o si no se pudo verificar.
 *
 * Existe para el camino de CONSULTA, que no exige canal oficial (leer no es escribir) pero sí
 * necesita saber si el canal desde el que se pregunta cuenta como habilitación por membresía. Sin
 * esto, alguien agregado al canal podía CARGAR la asistencia y no podía CONSULTARLA: el mismo
 * sistema contestándole dos cosas distintas sobre el mismo permiso.
 */
export async function canalOficialDeAsistencia(port, { channelId, plataforma = 'mattermost' } = {}) {
  const canal = texto(channelId)
  if (!canal) return null
  const r = await canalOficial(port, { channelId: canal, plataforma })
  return r.ok ? canal : null
}

async function canalOficial(port, { channelId, plataforma }) {
  if (typeof port?.query !== 'function') {
    return niega(RECHAZO.CANAL, DETALLE.BASE_INDISPONIBLE, TEXTO.CANAL_NO_VERIFICABLE)
  }
  let filas
  try {
    const r = await port.query(
      `select canal_nombre from comunicacion.canales_area
        where plataforma = $1 and channel_id = $2 and area_clave = $3 and activo
        limit 1`,
      [plataforma, channelId, AREA_ASISTENCIA],
    )
    filas = r?.rows ?? []
  } catch {
    // Fail-closed: si no se puede verificar, no se concede.
    return niega(RECHAZO.CANAL, DETALLE.BASE_INDISPONIBLE, TEXTO.CANAL_NO_VERIFICABLE)
  }
  if (!filas.length) return niega(RECHAZO.CANAL, DETALLE.CANAL_NO_ES_EL_OFICIAL, TEXTO.CANAL)
  return { ok: true, nombre: texto(filas[0].canal_nombre) ?? null }
}

/** Permiso de escritura, con `lib/asistencia-permisos.mjs`. Traduce sus motivos a los míos. */
async function verificarPermiso(port, { plataforma, plataformaUserId, canalOficial, mattermost }) {
  let r
  try {
    r = await tienePermiso(port, {
      plataforma, plataformaUserId, permiso: PERMISO_ASISTENCIA_WRITE, canalOficial, mattermost,
    })
  } catch {
    return niega(RECHAZO.PERMISO, DETALLE.PERMISO_NO_VERIFICABLE, TEXTO.PERMISO_NO_VERIFICABLE)
  }
  if (r?.ok) return { ok: true, modo: r.modo ?? null, via: r.via ?? null }
  if (r?.motivo === DENEGADO.SIN_IDENTIDAD) {
    return niega(RECHAZO.SIN_IDENTIDAD, DETALLE.SIN_IDENTIDAD, TEXTO.SIN_IDENTIDAD)
  }
  if (r?.motivo === DENEGADO.ERROR_VERIFICANDO) {
    return niega(RECHAZO.PERMISO, DETALLE.PERMISO_NO_VERIFICABLE, TEXTO.PERMISO_NO_VERIFICABLE)
  }
  return niega(RECHAZO.PERMISO, DETALLE.SIN_PERMISO, TEXTO.SIN_PERMISO)
}
