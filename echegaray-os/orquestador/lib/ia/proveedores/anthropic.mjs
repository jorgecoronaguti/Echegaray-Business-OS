// EL PROVEEDOR ANTHROPIC, DETRÁS DE UNA INTERFAZ — no es «la» forma de hablar con un modelo.
//
// ═══ EL CONTRATO QUE CUMPLE (y que cumpliría cualquier otro) ═══
//
//   nombre                                     identificador para el registro de costo
//   idDeModelo(alias, cfg) → string            'opus' → el ID que hoy usa este proveedor
//   async completar({ modelo, sistema, mensajes, maxTokens, temperatura, señal })
//     → { texto, tokens: {in, out}, modeloUsado }
//     lanza un error con `.status` cuando la respuesta no vino ok
//
// Todo lo que sabe de Anthropic vive acá: el host, la versión de la API, la forma del cuerpo, cómo
// se nombra `max_tokens` y de dónde se saca el texto. Un segundo proveedor es OTRO archivo con estas
// tres cosas, y nada más del OS cambia.
//
// ═══ POR QUÉ `fetch` Y NO EL SDK ═══
//
// El SDK ya está en `engines/anthropic-api.mjs`, que necesita tool-use y sus reintentos. Los tres
// caminos que este módulo unifica piden UN texto y ya —leer un comprobante, rutear, interpretar—, y
// los tres estaban escritos con `fetch`. Meter el SDK acá sumaría una dependencia y un
// comportamiento de reintento distinto del que el cliente ya controla y mide.

const HOST = process.env.ORQ_ANTHROPIC_HOST || 'https://api.anthropic.com'
const VERSION = '2023-06-01'

/** Alias → ID. Un valor que ya es un ID (`claude-…`) pasa tal cual, igual que en `resolveModelId`. */
export function idDeModelo(alias, cfg = {}) {
  const a = String(alias ?? '').toLowerCase()
  if (a === 'haiku') return cfg.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5'
  if (a === 'sonnet') return cfg.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6'
  if (a === 'opus') return cfg.ANTHROPIC_MODEL_OPUS || 'claude-opus-4-8'
  return alias
}

/** El texto de la respuesta: concatena los bloques y tolera un refusal (que llega vacío). */
export function textoDe(json) {
  const bloques = Array.isArray(json?.content) ? json.content : []
  return bloques.filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('').trim()
}

export const anthropic = {
  nombre: 'anthropic',
  idDeModelo,

  /** ¿Está configurado? Sin credencial no se intenta: fallar rápido es mejor que un 401 por llamada. */
  configurado(apiKey = process.env.ANTHROPIC_API_KEY) {
    return Boolean(apiKey)
  },

  /**
   * @param herramientas  Herramientas SERVER-SIDE del proveedor —hoy sólo `web_search`—. Se pasan
   *   tal cual. NO son las tools del OS: aquéllas las ejecuta el Work Fabric con los permisos de
   *   `orq.agents` y no pasan por acá. Éstas las corre el proveedor de su lado y tienen su propio
   *   cargo, así que la llamada tiene que quedar registrada igual que cualquier otra.
   */
  async completar({
    modelo, sistema, mensajes, maxTokens = 1024, temperatura, herramientas = null,
    señal, apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = globalThis.fetch,
  }) {
    const cuerpo = { model: modelo, max_tokens: maxTokens, messages: mensajes }
    if (sistema) cuerpo.system = sistema
    if (temperatura != null) cuerpo.temperature = temperatura
    if (Array.isArray(herramientas) && herramientas.length) cuerpo.tools = herramientas

    const res = await fetchImpl(`${HOST}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': VERSION, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: señal,
    })

    if (!res.ok) {
      // El cuerpo del error lleva el motivo —«credit balance is too low»— y sin él un 400 de saldo
      // se clasifica como un bug nuestro. Que leer el motivo falle no puede tapar el error real.
      const detalle = await res.text().catch(() => '')
      const err = new Error(`anthropic ${res.status}: ${detalle.slice(0, 200)}`)
      err.status = res.status
      err.cuerpo = detalle
      throw err
    }

    const json = await res.json()
    return {
      texto: textoDe(json),
      modeloUsado: json?.model ?? modelo,
      tokens: {
        in: json?.usage?.input_tokens ?? null,
        out: json?.usage?.output_tokens ?? null,
      },
      // CUÁNTAS BÚSQUEDAS HIZO EL PROVEEDOR DE SU LADO. Cada una tiene cargo propio ADEMÁS de los
      // tokens: sin este número el costo de una búsqueda se subestima siempre.
      busquedas: (json?.content ?? []).filter((b) => b?.type === 'server_tool_use').length,
    }
  },
}
