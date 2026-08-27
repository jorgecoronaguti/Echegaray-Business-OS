// LA IDENTIDAD DEL BOT EN MATTERMOST — un solo bot, que ahora se llama XSAS.
//
// ═══ POR QUÉ SE RENOMBRA Y NO SE CREA OTRO ═══
//
// El bot `@os` tiene historial, membresías de canal, tokens, webhooks y el `user_id` con el que
// están escritos los eventos de `orq.events` y las tablas de comunicación. Crear un `@xsas` nuevo
// perdería todo eso y dejaría DOS identidades hablando: la vieja seguiría siendo miembro de los
// canales y la gente seguiría escribiéndole. Mattermost permite cambiar `username` y
// `display_name` conservando el `id`, que es lo que de verdad identifica al bot.
//
// ═══ POR QUÉ `@os` SIGUE RESPONDIENDO ═══
//
// Porque hay costumbre escrita: mensajes agendados, docs, y sobre todo gente que lo escribe de
// memoria. Un alias de TRANSICIÓN no es una segunda identidad —es el mismo bot, el mismo `user_id`,
// la misma respuesta— y se apaga poniendo `MM_BOT_ALIAS=` vacío el día que ya nadie lo use. Lo que
// sí sería un error es tener dos bots.

/** El nombre canónico. Cambiarlo acá es cambiarlo en todo el OS. */
export const USERNAME_CANONICO = 'xsas'
export const NOMBRE_VISIBLE = 'XSAS'

/** Los alias de transición que el bot sigue atendiendo además del canónico. */
export const ALIAS_TRANSICION = Object.freeze(['os'])

/**
 * Los nombres a los que el bot responde, en minúscula y sin repetidos.
 *
 * `MM_BOT_USERNAME` sigue mandando si está puesto (es lo que hoy dice el `.env` del servicio vivo);
 * `MM_BOT_ALIAS` es una lista separada por comas, y vacía explícita APAGA la transición. Un default
 * que no se puede apagar no es una transición, es una segunda identidad permanente.
 *
 * @param {object} [env]
 * @returns {string[]} el canónico primero
 */
export function nombresDelBot(env = process.env) {
  const canonico = String(env.MM_BOT_USERNAME || USERNAME_CANONICO).trim().toLowerCase()
  const crudo = env.MM_BOT_ALIAS
  const alias = crudo === undefined
    ? [...ALIAS_TRANSICION]
    : String(crudo).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return [...new Set([canonico, ...alias])].filter(Boolean)
}

/** El nombre visible (el que se ve en el canal). */
export function nombreVisible(env = process.env) {
  return String(env.MM_BOT_DISPLAY_NAME || NOMBRE_VISIBLE).trim() || NOMBRE_VISIBLE
}

/**
 * EL TEXTO SIN LA MENCIÓN AL BOT. Se quita SÓLO el nombre del bot, no toda `@palabra`: un mensaje
 * puede nombrar a una persona («@xsas decile a @rodrigo…») y borrarle esa mención al texto le saca
 * al especialista el dato que necesita. `limpiar()` de `fecha-operativa` borra todas porque compara
 * gramáticas cortas; acá el texto sigue viaje hacia un modelo y tiene que quedar entero.
 */
export function sinMencion(texto, env = process.env) {
  let t = String(texto ?? '')
  for (const n of nombresDelBot(env)) {
    t = t.replace(new RegExp(`(^|\\s)@${n.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi'), '$1')
  }
  return t.trim()
}
