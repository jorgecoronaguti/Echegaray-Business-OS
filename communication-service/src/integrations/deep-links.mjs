// PR-3 · Deep Links al Business OS.
//
// Todo mensaje importante que el OS publica en el chat debe poder abrir DIRECTO
// la pantalla correspondiente del OS. Este módulo construye esas URLs de forma
// canónica, a partir de un "recurso" del OS — no a partir de strings sueltos
// esparcidos por el código.
//
// Dominio oficial del OS: app.ecsas.com.ar (regla del proyecto — NO usar el
// dominio .vercel.app como canónico). Configurable por env para staging/local.

const BASE_OS = (process.env.NEXT_PUBLIC_OS_URL || 'https://app.ecsas.com.ar').replace(/\/+$/, '')

// Mapa recurso canónico → ruta del OS. Extensible: sumar una entrada acá cuando
// una pantalla nueva deba ser enlazable desde el chat. La clave es el TIPO de
// recurso del OS, no la pantalla de Mattermost.
const RUTAS = Object.freeze({
  obra: (id) => `/control-obras/${encodeURIComponent(id)}`,
  cobranza: (id) => `/finanzas/cobranzas?obra=${encodeURIComponent(id)}`,
  flujo_caja: () => `/finanzas/flujo-caja`,
  obligacion: (id) => `/finanzas/obligaciones?id=${encodeURIComponent(id)}`,
  accion: (id) => `/acciones/${encodeURIComponent(id)}`,
  pedido_material: (id) => `/integraciones/pedidos-materiales?id=${encodeURIComponent(id)}`,
  legajo: (id) => `/personas/legajos/${encodeURIComponent(id)}`,
})

/** Tipos de recurso enlazables (para validación/documentación). */
export const RECURSOS = Object.freeze(Object.keys(RUTAS))

/**
 * Construye un deep link al OS para un recurso canónico.
 * @param {string} recurso  uno de RECURSOS
 * @param {string} [id]     identificador del recurso (obra, acción, etc.)
 * @param {string} [base]   override del dominio (default: app.ecsas.com.ar)
 * @returns {string} URL absoluta al OS
 */
export function deepLink(recurso, id, base = BASE_OS) {
  const fn = RUTAS[recurso]
  if (!fn) throw new Error(`deepLink: recurso desconocido "${recurso}" (válidos: ${RECURSOS.join(', ')})`)
  return `${base}${fn(id)}`
}

/** ¿Es un recurso enlazable conocido? Para que un caller decida si adjuntar link. */
export function esEnlazable(recurso) {
  return recurso in RUTAS
}
