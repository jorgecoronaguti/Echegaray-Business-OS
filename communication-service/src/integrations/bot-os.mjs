// PR-3 · Bot oficial del Business OS: @os (DISEÑO — sin especialistas).
//
// El pedido: "Diseñar el bot oficial del Business OS. No implementar
// especialistas todavía." Así que esto define la IDENTIDAD y la CONFIGURACIÓN
// del bot, y su rol dentro de la arquitectura — no su inteligencia. La
// inteligencia (rutear a Director/CFO/especialistas) es PR-4 y entra por los
// handlers del Communication Service, no acá.
//
// @os es el único actor autorizado del OS dentro del chat: publica avisos, abre
// hilos, responde slash commands. Nunca hay lógica de negocio en el bot: el bot
// es la CARA del OS en el chat, el cerebro sigue siendo el OS.

/** Configuración canónica del bot @os. Los valores sensibles (token) vienen por
 *  entorno; acá viven sólo defaults e identidad estable. */
export function configBotOs(env = process.env) {
  return Object.freeze({
    username: env.MM_BOT_USERNAME || 'os',
    display_name: env.MM_BOT_DISPLAY_NAME || 'Business OS',
    // El token del bot NUNCA se hardcodea ni se loguea. Si falta, el wiring real
    // debe fallar cerrado (no publicar) en vez de intentar sin credencial.
    token_presente: Boolean(env.MM_BOT_TOKEN),
    // user_id del bot en Mattermost: necesario para reaccionar y para ignorar su
    // propio eco entrante. Se resuelve una vez y se cachea en el wiring.
    user_id: env.MM_BOT_USER_ID || null,
    // Rol declarado del bot dentro del OS. Documenta el límite: comunica, no decide.
    rol: 'cara-de-comunicacion',
    descripcion:
      'Cuenta oficial del Business OS en el chat. Publica avisos y responde ' +
      'comandos. No contiene lógica de negocio: sólo emite y recibe eventos.',
  })
}

/** Verifica que el bot esté listo para operar (token + user_id). Devuelve el
 *  motivo si NO está listo, para que el wiring falle cerrado y visible. */
export function botListo(cfg = configBotOs()) {
  if (!cfg.token_presente) return { listo: false, motivo: 'falta MM_BOT_TOKEN' }
  if (!cfg.user_id) return { listo: false, motivo: 'falta MM_BOT_USER_ID (resolver una vez y cachear)' }
  return { listo: true }
}
