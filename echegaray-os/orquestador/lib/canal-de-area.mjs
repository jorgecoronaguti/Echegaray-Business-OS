// ¿CUÁL ES EL CANAL OFICIAL DE ESTA ÁREA? Una sola respuesta, en un solo lugar.
//
// EL PEDIDO DEL DUEÑO, textual: «las funciones del bot tienen q estar habilitadas para todos y
// segun el canal para quienes participen del canal». Esa regla se apoya entera sobre esta pregunta:
// el canal acota QUÉ se puede hacer, y estar adentro habilita a hacerlo (`lib/permiso-de-canal.mjs`).
// Si la pregunta se contesta en tres lugares distintos, la regla vale tres cosas distintas.
//
// Y se contestaba en tres. La guarda de asistencia tenía su propia consulta a
// `comunicacion.canales_area`, la de comprobantes tenía otra igual con otra área, y el prefiltro de
// adjuntos del consumidor de WebSocket ni siquiera preguntaba: leía una lista de slugs del entorno
// con un default escrito en el código (`comprobantes-gastos,compras`). Consecuencia concreta y
// silenciosa: atar un canal nuevo al área `compras` en el binding habilitaba la carga… pero la foto
// mandada a ese canal no llegaba a crear un evento, así que nadie la atendía nunca. La capacidad
// estaba impecable y no se ejecutaba.
//
// EL BINDING ES EL DATO, NO EL CÓDIGO. Ningún id ni slug de Mattermost se escribe acá: se agrega
// una fila en `comunicacion.canales_area` y se cambia sin desplegar. Lo único que este módulo sabe
// es que existe una tabla que ata canales a áreas.
//
// FAIL-CLOSED, EN LOS DOS SENTIDOS. Hay tres respuestas y no dos: es el oficial, no lo es, o NO SE
// PUDO PREGUNTAR (base caída, sin port). La tercera no se colapsa contra la segunda: quien llama
// tiene que poder decir «no pude verificar» —que es distinto de «no tenés permiso»— y denegar igual.
//
// Cero modelo: son dos SELECT.

/** Motivos por los que un canal no cuenta como el oficial del área. */
export const CANAL = Object.freeze({
  SIN_CANAL: 'sin_canal',
  NO_ES_EL_OFICIAL: 'no_es_el_oficial',
  NO_VERIFICABLE: 'no_verificable',
})

const txt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * ¿Este canal es el canal oficial de esta área, y está activo?
 *
 * @param {object} o
 * @param {{query:Function}} o.port
 * @param {string} o.channelId          el canal que declara el pedido
 * @param {string} o.area               clave de `public.area_canonica` (`personas`, `compras`, …)
 * @param {string} [o.plataforma='mattermost']
 * @returns {Promise<{ok:true, canal:string, nombre:string|null}|{ok:false, motivo:string}>}
 */
export async function canalOficialDeArea({ port, channelId, area, plataforma = 'mattermost' } = {}) {
  const canal = txt(channelId)
  if (!canal) return { ok: false, motivo: CANAL.SIN_CANAL }
  if (!txt(area)) return { ok: false, motivo: CANAL.NO_ES_EL_OFICIAL }
  if (typeof port?.query !== 'function') return { ok: false, motivo: CANAL.NO_VERIFICABLE }
  let filas
  try {
    const r = await port.query(
      `select canal_nombre from comunicacion.canales_area
        where plataforma = $1 and channel_id = $2 and area_clave = $3 and activo
        limit 1`,
      [plataforma, canal, area],
    )
    filas = r?.rows ?? []
  } catch {
    // Una excepción NO es un "no": es un "no sé". Se deniega igual, pero con otro motivo.
    return { ok: false, motivo: CANAL.NO_VERIFICABLE }
  }
  // Un binding apagado y un canal que nunca estuvo atado dan el mismo resultado a propósito: de
  // cara a quien escribe son la misma situación.
  if (!filas.length) return { ok: false, motivo: CANAL.NO_ES_EL_OFICIAL }
  return { ok: true, canal, nombre: txt(filas[0].canal_nombre) }
}

/**
 * TODOS los canales activos atados a un área. Es la lista que necesita quien tiene que decidir
 * ANTES de saber de qué canal se trata —el prefiltro de ingesta— y la que evita que esa decisión
 * se tome contra una lista escrita a mano en el entorno.
 *
 * Devuelve ids Y nombres porque los dos identifican al canal según por dónde se lo mire: el frame
 * del WebSocket trae el SLUG, la base y la API traen el `channel_id`.
 *
 * @returns {Promise<{ok:true, canales:Array<{channelId:string, nombre:string|null}>}
 *                 |{ok:false, motivo:string}>}
 */
export async function canalesDeArea({ port, area, plataforma = 'mattermost' } = {}) {
  if (!txt(area)) return { ok: true, canales: [] }
  if (typeof port?.query !== 'function') return { ok: false, motivo: CANAL.NO_VERIFICABLE }
  try {
    const r = await port.query(
      `select channel_id, canal_nombre from comunicacion.canales_area
        where plataforma = $1 and area_clave = $2 and activo`,
      [plataforma, area],
    )
    const canales = (r?.rows ?? [])
      .map((f) => ({ channelId: txt(f.channel_id), nombre: txt(f.canal_nombre) }))
      .filter((c) => c.channelId)
    return { ok: true, canales }
  } catch {
    return { ok: false, motivo: CANAL.NO_VERIFICABLE }
  }
}
