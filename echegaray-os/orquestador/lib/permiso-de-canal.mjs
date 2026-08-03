// DOS VÍAS PARA EL MISMO PERMISO: el grant explícito y la MEMBRESÍA DEL CANAL.
//
// EL PEDIDO, textual y repetido dos veces por el dueño: «que las personas agregadas al canal todas
// puedan cargar» (asistencia) y «todos los q esten ese canal tienen q estar habilitados a cargar»
// (comprobantes). Es el mismo pedido para dos skills, así que es UNA sola implementación: si la
// hubiera duplicado, mañana una de las dos se endurece y la otra no, y nadie se entera.
//
// QUÉ CAMBIA Y QUÉ NO
//
//   · El grant de `comunicacion.permisos_skill` SIGUE VALIENDO tal cual. No se saca: es la vía para
//     habilitar a alguien que no está —ni tiene por qué estar— en el canal. Hoy mismo hay tres
//     personas con grant de comprobantes que no son miembros de ese canal.
//   · Se SUMA la membresía. Estar en el canal oficial del área habilita esa skill y sólo esa: el
//     canal de Asistencia no habilita a cargar comprobantes, porque cada guarda pregunta por SU
//     canal oficial, el que sale de `comunicacion.canales_area`.
//   · NO cambia de dónde sale el canal oficial. Sigue siendo el binding, nunca un id en el código.
//
// EL CANAL QUE SE CONSULTA ES EL OFICIAL, NO EL QUE DECLARA EL PEDIDO. Preguntar «¿es miembro del
// canal desde el que dice estar escribiendo?» sería regalar el permiso: cualquiera crea un canal,
// se agrega solo y ya es miembro. Quien llama tiene que pasar el canal que YA validó contra el
// binding — por eso el parámetro se llama `canalOficial` y no `channelId`.
//
// FAIL-CLOSED, Y EN LOS DOS SENTIDOS. Hay tres respuestas posibles y no dos:
//   ok          → hay grant, o es miembro;
//   sin_permiso → la base contestó que no hay grant Y Mattermost contestó que no es miembro;
//   no_verificable → alguna de las dos no se pudo preguntar (base caída, Mattermost caído, sin
//                    cliente configurado). Se DENIEGA, con otro mensaje: no es lo mismo «no podés»
//                    que «no pude averiguar si podés», y del otro lado hay una planilla con la
//                    plata y las horas de la empresa.
//
// Cero modelo: son una consulta SQL y un GET. Nada de esto razona.

import { mattermostDelOs } from './mattermost-os.mjs'

/** Por dónde entró el permiso. Va a la auditoría: se puede revisar después quién entró por dónde. */
export const VIA = Object.freeze({
  GRANT: 'grant',
  MIEMBRO_CANAL: 'miembro_canal',
})

export const MOTIVO = Object.freeze({
  SIN_PERMISO: 'sin_permiso',
  NO_VERIFICABLE: 'no_verificable',
})

/**
 * ¿Esta persona puede operar esta skill?
 *
 * @param {object} o
 * @param {{query:Function}} o.port            pool del OS
 * @param {string} o.plataformaUserId          identidad real de la plataforma (ya verificada)
 * @param {string} o.permiso                   clave del grant (`personal.asistencia.write`, …)
 * @param {string|null} [o.canalOficial]       canal del área, YA validado contra `canales_area`
 * @param {string} [o.plataforma='mattermost']
 * @param {{miembroDeCanal:Function}|null} [o.mattermost]  cliente; por defecto, el del OS
 * @returns {Promise<{ok:true, via:string, display:string|null}|{ok:false, motivo:string}>}
 */
export async function puedeOperar({
  port, plataformaUserId, permiso, canalOficial = null,
  plataforma = 'mattermost', mattermost = undefined, log = null,
} = {}) {
  if (!plataformaUserId || !permiso) return { ok: false, motivo: MOTIVO.SIN_PERMISO }

  // 1) GRANT. Va primero porque es una consulta a la base que ya está abierta, mientras que la
  //    membresía es una llamada de red: para quien ya está habilitado explícitamente, el camino
  //    barato alcanza y Mattermost ni se entera.
  const g = await grant(port, { plataforma, plataformaUserId, permiso })
  if (g.ok) return { ok: true, via: VIA.GRANT, display: g.display ?? null }

  // 2) MEMBRESÍA. Sólo si hay un canal oficial contra el cual preguntarla.
  const m = await miembro({ mattermost, canalOficial, plataformaUserId, log })
  if (m.ok) return { ok: true, via: VIA.MIEMBRO_CANAL, display: null }

  // Denegar exige que las DOS vías hayan contestado que no. Si alguna no se pudo preguntar, el
  // veredicto es "no verificable": se deniega igual, pero se dice otra cosa y se audita distinto.
  if (g.motivo === MOTIVO.NO_VERIFICABLE || m.motivo === MOTIVO.NO_VERIFICABLE) {
    // El PORQUÉ va recortado: sirve para la traza, y un mensaje de driver de 5.000 caracteres en
    // un evento de auditoría es una filtración disfrazada de detalle útil.
    return { ok: false, motivo: MOTIVO.NO_VERIFICABLE, error: g.error ?? m.error ?? null }
  }
  return { ok: false, motivo: MOTIVO.SIN_PERMISO }
}

/** Recorte único para todo lo que se cuenta de un fallo. */
const detalle = (e) => String(e?.message ?? e).slice(0, 200)

/** Grant activo en `comunicacion.permisos_skill`. Una excepción NO es un "no": es un "no sé". */
async function grant(port, { plataforma, plataformaUserId, permiso }) {
  if (typeof port?.query !== 'function') {
    return { ok: false, motivo: MOTIVO.NO_VERIFICABLE, error: 'sin acceso a la base' }
  }
  try {
    const { rows } = await port.query(
      `select display from comunicacion.permisos_skill
        where plataforma = $1 and plataforma_user_id = $2 and permiso = $3 and activo
        limit 1`,
      [plataforma, plataformaUserId, permiso],
    )
    if (!rows.length) return { ok: false, motivo: MOTIVO.SIN_PERMISO }
    return { ok: true, display: rows[0].display ?? null }
  } catch (e) {
    return { ok: false, motivo: MOTIVO.NO_VERIFICABLE, error: detalle(e) }
  }
}

/**
 * ¿Es miembro del canal oficial? El cliente devuelve booleano sólo cuando Mattermost contestó de
 * forma concluyente (200 / 404) y TIRA en cualquier otro caso — ese `throw` es lo que distingue
 * "no está en el canal" de "no pude preguntarlo", y es la razón por la que se atrapa acá y se
 * traduce a `no_verificable` en vez de a un `false` que se leería como denegación limpia.
 */
async function miembro({ mattermost, canalOficial, plataformaUserId, log }) {
  if (!canalOficial) return { ok: false, motivo: MOTIVO.SIN_PERMISO }
  const cli = mattermost === undefined ? mattermostDelOs({ log }) : mattermost
  if (!cli || typeof cli.miembroDeCanal !== 'function') {
    return { ok: false, motivo: MOTIVO.NO_VERIFICABLE, error: 'sin cliente de Mattermost' }
  }
  try {
    const es = await cli.miembroDeCanal({ channel_id: canalOficial, user_id: plataformaUserId })
    return es === true ? { ok: true } : { ok: false, motivo: MOTIVO.SIN_PERMISO }
  } catch (e) {
    log?.warn?.('permiso: no se pudo verificar la membresía del canal', { detalle: detalle(e) })
    return { ok: false, motivo: MOTIVO.NO_VERIFICABLE, error: detalle(e) }
  }
}
