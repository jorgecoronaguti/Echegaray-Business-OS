// UN SEGUNDO PROVEEDOR, DETRÁS DEL MISMO CONTRATO — el fallback cuando el primero no puede.
//
// ═══ QUÉ ES ═══
//
// El dialecto `/v1/chat/completions` lo hablan hoy OpenAI, Groq, Together, DeepSeek, OpenRouter,
// Mistral, vLLM y Ollama. Por eso este adapter no se llama por el nombre de una empresa: es el
// PROTOCOLO, y el host, el modelo y la clave son configuración. Cambiar de proveedor compatible es
// cambiar tres variables de entorno, no escribir otro archivo.
//
// ═══ LO QUE NO HACE, A PROPÓSITO ═══
//
// NO trae credenciales, NO inventa un default de host que apunte a un servicio de nadie y NO se
// activa solo. Sin `ORQ_IA_ALT_BASE_URL` + `ORQ_IA_ALT_API_KEY`, `configurado()` devuelve false y el
// cliente lo salta como si no existiera: un adapter listo pero apagado NO cambia el comportamiento
// de hoy, y ése es el punto — dejar el camino hecho sin fabricar una dependencia que el dueño no
// contrató.
//
// ═══ POR QUÉ EL ALIAS SE CONFIGURA Y NO SE ADIVINA ═══
//
// 'haiku' y 'opus' son nombres de otro proveedor. Traducirlos a `gpt-…` o `llama-…` por mi cuenta
// sería elegirle el modelo al dueño. Acá el alias se mapea con una variable por nivel; sin ella, se
// usa `ORQ_IA_ALT_MODELO` para los tres y queda registrado cuál respondió de verdad.

const env = (k, d = null) => {
  const v = process.env[k]
  return v && String(v).trim() ? String(v).trim() : d
}

/** Alias → ID, por configuración. Un valor que ya parece un ID pasa tal cual. */
export function idDeModelo(alias) {
  const a = String(alias ?? '').toLowerCase()
  const porNivel = { haiku: 'ORQ_IA_ALT_MODELO_RAPIDO', sonnet: 'ORQ_IA_ALT_MODELO', opus: 'ORQ_IA_ALT_MODELO_POTENTE' }[a]
  return (porNivel && env(porNivel)) || env('ORQ_IA_ALT_MODELO') || alias
}

/** El texto de la respuesta. Tolera el `content: null` de una respuesta que sólo trae tool_calls. */
export function textoDe(json) {
  const m = json?.choices?.[0]?.message
  if (typeof m?.content === 'string') return m.content.trim()
  if (Array.isArray(m?.content)) return m.content.map((b) => b?.text ?? '').join('').trim()
  return ''
}

export const openaiCompatible = {
  nombre: env('ORQ_IA_ALT_NOMBRE', 'openai-compatible'),
  idDeModelo,

  /** Sin host Y sin clave no se intenta. `apiKey` entra por firma para que el cliente pueda
   *  probarlo, pero la clave de ESTE proveedor nunca es la de Anthropic: se lee de su variable. */
  configurado() {
    return Boolean(env('ORQ_IA_ALT_BASE_URL') && env('ORQ_IA_ALT_API_KEY'))
  },

  async completar({
    modelo, sistema, mensajes, maxTokens = 1024, temperatura, señal,
    fetchImpl = globalThis.fetch,
  }) {
    const base = env('ORQ_IA_ALT_BASE_URL')
    const clave = env('ORQ_IA_ALT_API_KEY')
    if (!base || !clave) {
      const err = new Error('openai-compatible: sin credencial')
      err.status = 401
      throw err
    }
    // El rol `system` va como primer mensaje: es la forma del dialecto, no un `system` aparte.
    const msgs = sistema ? [{ role: 'system', content: sistema }, ...mensajes] : mensajes
    const cuerpo = { model: modelo, messages: msgs, max_tokens: maxTokens }
    if (temperatura != null) cuerpo.temperature = temperatura

    const res = await fetchImpl(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: señal,
    })
    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      const err = new Error(`${openaiCompatible.nombre} ${res.status}: ${detalle.slice(0, 200)}`)
      err.status = res.status
      err.cuerpo = detalle
      throw err
    }
    const json = await res.json()
    return {
      texto: textoDe(json),
      modeloUsado: json?.model ?? modelo,
      tokens: { in: json?.usage?.prompt_tokens ?? null, out: json?.usage?.completion_tokens ?? null },
      busquedas: 0,
    }
  },
}
