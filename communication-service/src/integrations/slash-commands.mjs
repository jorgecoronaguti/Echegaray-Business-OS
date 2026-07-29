// PR-3 · Infraestructura de Slash Commands (ARQUITECTURA — no funcionalidades).
//
// El pedido del PR-3 es explícito: "Diseñar la infraestructura. No implementar
// todavía funcionalidades complejas. Solamente la arquitectura." Así que esto es
// un REGISTRO + DESPACHADOR de comandos, con exactamente un comando trivial de
// referencia (`ayuda`/`ping`) que demuestra el circuito. Los comandos con lógica
// de negocio (consultar caja, aprobar un pago) son PR-4 y viven fuera de acá.
//
// Un slash command entra como evento canónico COMANDO_INVOCADO (lo produjo el
// adapter). Este registro decide qué handler lo atiende y devuelve una respuesta
// canónica, sin que el servicio ni el adapter sepan qué hace cada comando.

/** Registro de comandos: nombre → { descripcion, handler(evento) → respuesta }. */
export class RegistroComandos {
  constructor() {
    this.comandos = new Map()
    this._registrarDefaults()
  }

  /**
   * Registra un comando.
   * @param {string} nombre  sin la barra (ej. "caja")
   * @param {string} descripcion  ayuda de una línea
   * @param {(evento:object) => Promise<{texto:string}>|{texto:string}} handler
   */
  registrar(nombre, descripcion, handler) {
    if (typeof handler !== 'function') throw new Error('comando: handler debe ser función')
    this.comandos.set(nombre.toLowerCase(), { descripcion, handler })
    return this
  }

  /** Despacha un evento canónico COMANDO_INVOCADO al handler correspondiente.
   *  Devuelve { texto } para responder en el chat. Nunca lanza: un comando
   *  desconocido responde con ayuda, no rompe. */
  async despachar(evento) {
    const nombre = String(evento?.data?.comando ?? '').toLowerCase()
    const cmd = this.comandos.get(nombre)
    if (!cmd) return { texto: this._ayuda(`Comando desconocido: /${nombre || '?'}`) }
    try {
      const r = await cmd.handler(evento)
      return { texto: r?.texto ?? '(sin respuesta)' }
    } catch (e) {
      return { texto: `No pude ejecutar /${nombre}: ${String(e?.message ?? e).slice(0, 160)}` }
    }
  }

  _registrarDefaults() {
    // Comando trivial de referencia — demuestra el circuito sin lógica de negocio.
    this.registrar('ping', 'Verifica que el bot @os está vivo', () => ({ texto: 'pong · el OS te escucha ✅' }))
    this.registrar('ayuda', 'Lista los comandos disponibles', () => ({ texto: this._ayuda() }))
  }

  _ayuda(prefijo) {
    const lineas = [...this.comandos.entries()].map(([n, c]) => `• \`/os ${n}\` — ${c.descripcion}`)
    return [prefijo, 'Comandos del OS:', ...lineas].filter(Boolean).join('\n')
  }
}
