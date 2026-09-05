// HUGGING FACE COMO PROVEEDOR DE RAZONAMIENTO — el mismo contrato que Anthropic, no un camino aparte.
//
// ═══ POR QUÉ NO ALCANZABA `openai-compatible.mjs` ═══
//
// El adapter genérico ya habla `/v1/chat/completions`, que es el dialecto del router de HF. Pero le
// faltan tres cosas que acá no son opcionales:
//
//   1. TOOL CALLING. El adapter genérico manda `messages` y devuelve texto. Un LLM que no puede
//      pedir herramientas no puede operar el ERP: contestaría de memoria, que es exactamente lo que
//      el OS tiene prohibido. Éste manda `tools` y devuelve `toolCalls`.
//   2. LA POLÍTICA DE SENSIBILIDAD. `openai-compatible` es un proveedor cualquiera y no sabe nada de
//      `politica.mjs`. Hugging Face sí tiene un techo declarado —INTERNAL— y ese techo no puede
//      depender de que el caller se acuerde. Se verifica ACÁ, antes de armar el cuerpo.
//   3. EL PROVEEDOR DE CÓMPUTO. El router de HF enruta a nscale, groq, deepinfra, cerebras… El
//      sufijo `:proveedor` fija cuál, y `x-inference-cost` dice cuánto salió de verdad. Sin eso el
//      costo se estima, y un costo estimado no sirve para decidir si conviene.
//
// ═══ EL TECHO NO ES UNA MOLESTIA: ES LA ARQUITECTURA ═══
//
// `clientes`, `obras`, `compras`, `cobranzas` son CONFIDENTIAL y NO salen hacia HF. Eso no impide
// que un LLM de HF opere el OS, porque lo que se le manda no son los datos: es LA PREGUNTA y el
// CATÁLOGO DE HERRAMIENTAS. «¿Cuánto tengo que cobrar esta semana?» es una intención, no una
// cobranza. El modelo elige `finanzas.cobranzas` y sus argumentos; la herramienta se ejecuta en la
// VM, contra Postgres, con los permisos del usuario. El dato nunca cruza la red.
//
// Ese reparto —HF entiende, el OS consulta— es lo que hace que la autonomía suba sin que la
// confidencialidad baje. Cuando una respuesta SÍ necesita que un modelo lea el dato confidencial,
// eso no es un caso de HF: escala a Claude, que es el proveedor que el OS ya tiene contratado para
// ese nivel.
//
// ═══ EL TOKEN ═══
//
// Sale de `lib/ml/hf-inferencia.mjs`, que ya lo lee de `~/.config/echegaray/orquestador.env` con
// permisos 600. No se duplica la lectura acá: un token con dos lugares de origen tiene dos lugares
// donde filtrarse.

import { token as tokenHF } from '../../ml/hf-inferencia.mjs'
import { puedeSalir } from '../../ml/politica.mjs'
import { verificar } from '../fusible.mjs'

const BASE = process.env.ORQ_HF_BASE_URL || 'https://router.huggingface.co/v1'

const env = (k, d = null) => {
  const v = process.env[k]
  return v && String(v).trim() ? String(v).trim() : d
}

/**
 * LOS DOS CEREBROS ECSAS, POR ALIAS.
 *
 * `ECSAS FAST` atiende lo que se repite: rutear, elegir una herramienta, completar argumentos,
 * clasificar. `ECSAS REASONING` atiende lo que requiere encadenar. Los IDs por defecto NO son una
 * opinión: salen del benchmark de `ecsas-llm-eval` y se cambian por variable de entorno sin tocar
 * código, igual que los alias de Anthropic.
 *
 * `gpt-oss-120b` es el default de razonamiento por una razón operativa además de su medición: el
 * router publica ONCE proveedores vivos para él (groq, cerebras, together, fireworks, nscale…). Un
 * modelo con un solo proveedor es un punto único de falla disfrazado de modelo.
 */
export function idDeModelo(alias) {
  const a = String(alias ?? '').toLowerCase()
  if (a === 'haiku' || a === 'fast' || a === 'simple') {
    return env('ORQ_HF_LLM_RAPIDO', 'Qwen/Qwen3-4B-Instruct-2507')
  }
  if (a === 'sonnet' || a === 'normal') return env('ORQ_HF_LLM', 'openai/gpt-oss-120b')
  if (a === 'opus' || a === 'reasoning' || a === 'complex') {
    return env('ORQ_HF_LLM_POTENTE', 'openai/gpt-oss-120b')
  }
  return alias
}

/**
 * UNA HERRAMIENTA DEL OS, EN EL DIALECTO DE OPENAI.
 *
 * Las tools del OS viven en `lib/tools/*.mjs` con la forma de Anthropic —`{name, description,
 * input_schema}`—, que es la que usa el Work Fabric. Traducir acá y no allá es deliberado: la
 * fuente de verdad de qué hace cada herramienta sigue siendo una sola, y agregar un proveedor no
 * obliga a reescribir cuarenta descripciones.
 *
 * Se traduce la FORMA, nunca el permiso: `capability` no viaja: qué puede ejecutar un agente lo
 * decide el OS al correr la herramienta, jamás el modelo que la pidió.
 */
export function comoFuncionOpenAI(schema) {
  return {
    type: 'function',
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.input_schema ?? schema.parameters ?? { type: 'object', properties: {} },
    },
  }
}

/** Las llamadas a herramientas que pidió el modelo, normalizadas a la forma del OS. */
export function toolCallsDe(json) {
  const crudas = json?.choices?.[0]?.message?.tool_calls
  if (!Array.isArray(crudas) || !crudas.length) return []
  return crudas.map((c) => {
    let argumentos = {}
    try {
      argumentos = typeof c.function?.arguments === 'string'
        ? JSON.parse(c.function.arguments || '{}')
        : (c.function?.arguments ?? {})
    } catch {
      // Un modelo puede devolver JSON roto. Se conserva el crudo y se marca: quien ejecuta decide
      // si reintenta o escala. Inventar `{}` haría creer que pidió la herramienta sin argumentos.
      argumentos = { __invalido: String(c.function?.arguments ?? '').slice(0, 400) }
    }
    return { id: c.id, nombre: c.function?.name, argumentos }
  })
}

/** El texto. Tolera el `content: null` de una respuesta que sólo trae `tool_calls`. */
export function textoDe(json) {
  const m = json?.choices?.[0]?.message
  if (typeof m?.content === 'string') return m.content.trim()
  if (Array.isArray(m?.content)) return m.content.map((b) => b?.text ?? '').join('').trim()
  return ''
}

export const huggingface = {
  nombre: 'huggingface',
  idDeModelo,

  /** Sin token no se intenta. El token es del servidor: nunca llega por parámetro desde un caller. */
  configurado() {
    return Boolean(tokenHF())
  },

  /**
   * @param dominio       el dominio del DATO que viaja. La política decide con esto, y sin él el
   *                      default es CONFIDENTIAL —o sea, no sale—. Fallar cerrado es la única
   *                      dirección aceptable acá.
   * @param herramientas  las tools del OS (forma Anthropic). Se traducen a `function` acá.
   * @param formato       `{ type: 'json_object' }` o un json_schema, para salida estructurada.
   */
  async completar({
    modelo, sistema, mensajes, maxTokens = 1024, temperatura, herramientas = null,
    dominio = null, permitidoExplicitamente = false, formato = null,
    señal, fetchImpl = globalThis.fetch,
  }) {
    // ── LA POLÍTICA, ANTES DE ARMAR EL CUERPO ──
    // Después del `fetch` no sirve de nada: el dato ya viajó.
    const permiso = puedeSalir(dominio, 'huggingface', { permitidoExplicitamente })
    if (!permiso.permitido) {
      const err = new Error(`huggingface: ${permiso.porQue}`)
      err.status = 403
      err.politica = permiso
      throw err
    }

    const tk = tokenHF()
    if (!tk) {
      const err = new Error('huggingface: sin token configurado en el servidor')
      err.status = 401
      throw err
    }

    const msgs = sistema ? [{ role: 'system', content: sistema }, ...mensajes] : mensajes
    const cuerpo = { model: modelo, messages: msgs, max_tokens: maxTokens }
    if (temperatura != null) cuerpo.temperature = temperatura
    if (Array.isArray(herramientas) && herramientas.length) {
      cuerpo.tools = herramientas.map((h) => (h?.type === 'function' ? h : comoFuncionOpenAI(h)))
    }
    if (formato) cuerpo.response_format = formato

    verificar({ doble: fetchImpl !== globalThis.fetch })

    const res = await fetchImpl(`${BASE.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: señal,
    })

    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      const err = new Error(`huggingface ${res.status}: ${detalle.slice(0, 200)}`)
      err.status = res.status
      err.cuerpo = detalle
      throw err
    }

    const json = await res.json()
    return {
      texto: textoDe(json),
      toolCalls: toolCallsDe(json),
      modeloUsado: json?.model ?? modelo,
      tokens: {
        in: json?.usage?.prompt_tokens ?? null,
        out: json?.usage?.completion_tokens ?? null,
      },
      // El router publica el costo real cuando corresponde. Si no viene queda null y NO se estima:
      // un costo inventado contamina la única tabla que responde «cuánto cuesta operar el OS».
      costoUsd: Number(res.headers.get?.('x-inference-cost')) || null,
      sensibilidad: permiso.sensibilidad,
      busquedas: 0,
    }
  },
}
