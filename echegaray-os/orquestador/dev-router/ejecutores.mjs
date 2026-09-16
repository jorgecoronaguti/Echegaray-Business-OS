/**
 * ejecutores.mjs — QUIÉN HACE EL TRABAJO. Claude NO es la primera opción.
 *
 * Orden real de preferencia: determinístico → script → modelo HF remoto → Claude.
 * Un ejecutor devuelve SIEMPRE la misma forma (compatible con `lib/ml/resultado.mjs`):
 *   { ok, ejecutor, modelo, proveedor, ms, costoUsd, edicion|null, porQue, huboFallback }
 *
 * EGRESO: ningún ejecutor remoto recibe un fragmento que no pasó por `revisarEgreso()`.
 * No es una convención: `ejecutorHF` lo llama él mismo y tira si no pasa.
 *
 * ═══ UNA SOLA PUERTA A HUGGING FACE (resuelto el 16/09/2026) ═══
 *
 * La regla del repo es que TODA llamada remota a Hugging Face pasa por `lib/ml/hf-inferencia.mjs`
 * y por ningún otro lado. La regla existe porque una vez una captura con datos de clientes reales
 * se fue a un proveedor sin pasar por ahí. Este ejecutor tuvo su propio `fetch` durante unas horas
 * y eso era una SEGUNDA puerta: un control que se agregara al adapter no lo habría protegido.
 *
 * Ahora pasa por el adapter, y la pieza que faltaba se agregó del lado correcto:
 *   · `politica.mjs` clasifica el dominio `'codigo'` como INTERNAL — antes no existía y un dominio
 *     sin clasificar es CONFIDENTIAL, así que el adapter lo habría bloqueado (fallar cerrado, bien).
 *   · `hfInferencia()` acepta `opciones` para el cuerpo (`temperature`, `max_tokens`), que es lo
 *     único que le faltaba para servir a chat además de a embeddings.
 *
 * EL CONTROL EXTRA DE DESARROLLO NO SE PERDIÓ, VA ANTES: `revisarEgreso()` escanea fragmento por
 * fragmento y bloquea un CUIT o un mail pegado en el fuente. Eso el adapter no lo hace —su política
 * es por DOMINIO, no por contenido—, así que los dos controles se suman en vez de reemplazarse.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { revisarEgreso } from './politica-codigo.mjs'
import { hfInferencia, ErrorHF } from '../lib/ml/hf-inferencia.mjs'

const BASE = 'https://router.huggingface.co/v1'

export class ClaudeNoDisponible extends Error {
  constructor(porQue) { super(porQue); this.name = 'ClaudeNoDisponible'; this.esperaAClaude = true }
}

/** ¿Está Claude disponible? Se apaga con CLAUDE_UNAVAILABLE=1 y NO se simula ni se sustituye. */
export function claudeDisponible() {
  return !(process.env.CLAUDE_UNAVAILABLE === '1' || process.env.CLAUDE_UNAVAILABLE === 'true')
}

// ─────────────────────────── EJECUTOR DETERMINÍSTICO ───────────────────────────

/**
 * Aplica una transformación PURA sobre el texto de un archivo. Sin modelo, sin red, sin costo.
 * Es el ejecutor que tiene que ganar siempre que la tarea se pueda expresar así.
 * @param {(texto:string)=>string} transformar
 */
export function ejecutorDeterministico({ raiz, ruta, transformar, seco = false }) {
  const t0 = Date.now()
  const abs = path.join(raiz, ruta)
  const antes = readFileSync(abs, 'utf8')
  const despues = transformar(antes)
  if (despues === antes) {
    return { ok: false, ejecutor: 'deterministico', modelo: null, proveedor: 'local', ms: Date.now() - t0,
      costoUsd: 0, edicion: null, porQue: 'la transformación no cambió nada', huboFallback: false }
  }
  if (!seco) writeFileSync(abs, despues)
  return { ok: true, ejecutor: 'deterministico', modelo: null, proveedor: 'local', ms: Date.now() - t0,
    costoUsd: 0, edicion: { ruta, bytesAntes: antes.length, bytesDespues: despues.length }, porQue: 'transformación pura aplicada', huboFallback: false }
}

// ─────────────────────────────── EJECUTOR HF ───────────────────────────────

/** Precio de referencia por millón de tokens. Es ESTIMACIÓN: el router de HF no devuelve costo. */
export const PRECIO_REFERENCIA = Object.freeze({
  'Qwen/Qwen3-Coder-480B-A35B-Instruct': { in: 0.45, out: 1.80 },
  'moonshotai/Kimi-K2.7-Code': { in: 0.60, out: 2.50 },
  'openai/gpt-oss-120b': { in: 0.10, out: 0.50 },
  'deepseek-ai/DeepSeek-V4-Flash-0731': { in: 0.28, out: 0.42 },
  'Qwen/Qwen3-4B-Instruct-2507': { in: 0.04, out: 0.12 },
})

function costoDe(modelo, uso) {
  const p = PRECIO_REFERENCIA[modelo]
  if (!p || !uso) return { costoUsd: 0, estimado: false }
  return {
    costoUsd: ((uso.prompt_tokens || 0) * p.in + (uso.completion_tokens || 0) * p.out) / 1e6,
    estimado: true,
  }
}

/**
 * Llama a un modelo del Hub por el router de Hugging Face.
 * `fragmentos` es [{ruta, texto}] y CADA UNO pasa por la puerta de egreso antes de salir.
 */
export async function ejecutorHF({
  modelo = 'Qwen/Qwen3-Coder-480B-A35B-Instruct', proveedor = null,
  instruccion, fragmentos = [], autorizadoPorElDueno = false,
  temperatura = 0, maxTokens = 4096, timeoutMs = 120_000,
} = {}) {
  const t0 = Date.now()

  // ── LA PUERTA, ANTES DE ARMAR NADA ──
  const bloqueos = []
  for (const f of fragmentos) {
    const v = revisarEgreso({ ruta: f.ruta, texto: f.texto, autorizadoPorElDueno })
    if (!v.permitido) bloqueos.push(`${f.ruta}: ${v.porQue}`)
  }
  if (bloqueos.length) {
    return { ok: false, ejecutor: 'hf', modelo, proveedor, ms: Date.now() - t0, costoUsd: 0, edicion: null,
      porQue: `EGRESO BLOQUEADO — ${bloqueos.join(' | ')}`, huboFallback: false, bloqueadoPorPolitica: true }
  }

  const contexto = fragmentos.map((f) => `--- ${f.ruta} ---\n${f.texto}`).join('\n\n')
  const t0hf = Date.now()
  try {
    // POR EL ADAPTER: él resuelve token, política por dominio, URL, reintentos, timeout y traza.
    // Acá sólo se dice QUÉ se manda. `dominio: 'codigo'` es lo que la política evalúa; el escaneo
    // por fragmento ya corrió arriba y es lo que el adapter no puede hacer.
    const r = await hfInferencia({
      capacidad: 'editCode', modelo, proveedor, tarea: 'chat-completions', dominio: 'codigo',
      timeoutMs, modulo: 'dev-router',
      opciones: { temperature: temperatura, max_tokens: maxTokens },
      entrada: [
        { role: 'system', content: 'Sos un programador que edita código de un repo TypeScript/Node. Respondés SÓLO con lo que se te pide, sin explicaciones, sin markdown de cierre, sin texto alrededor.' },
        { role: 'user', content: `${instruccion}\n\n${contexto}` },
      ],
    })
    const json = r.datos ?? {}
    const texto = json.choices?.[0]?.message?.content ?? ''
    // EL COSTO REAL LO DA EL ADAPTER (cabecera del router) y puede ser null. Si no vino, se estima
    // por tarifa publicada y se DICE que es estimado: un costo inventado sin marcar es peor que
    // ninguno, y este número después entra en un KPI.
    const est = costoDe(modelo, json.usage)
    const costoUsd = r.costoUsd ?? est.costoUsd
    return {
      ok: Boolean(texto), ejecutor: 'hf', modelo: json.model || modelo,
      proveedor: json.provider || r.proveedor || proveedor, ms: r.ms ?? (Date.now() - t0hf),
      costoUsd, costoEstimado: r.costoUsd == null, uso: json.usage || null, salida: texto, edicion: null,
      traceId: r.traceId ?? null,
      porQue: texto ? 'el modelo respondió' : 'el modelo devolvió vacío', huboFallback: false,
    }
  } catch (e) {
    // UN BLOQUEO DE LA POLÍTICA NO ES UN ERROR DE RED, y no se lee igual: se marca aparte para que
    // el router no lo reintente ni lo cuente como fallo del modelo.
    const porPolitica = e instanceof ErrorHF && /pol\u00edtica no deja salir/.test(String(e.message))
    return {
      ok: false, ejecutor: 'hf', modelo, proveedor, ms: Date.now() - t0, costoUsd: 0, edicion: null,
      bloqueadoPorPolitica: porPolitica || undefined,
      porQue: `${porPolitica ? 'EGRESO BLOQUEADO POR LA POLITICA' : e.name}: ${e.message}`.slice(0, 200),
      huboFallback: false,
    }
  }
}

// ───────────────────────────── EJECUTOR CLAUDE ─────────────────────────────

/**
 * Claude. En modo CLAUDE_UNAVAILABLE **tira `ClaudeNoDisponible` y no hace nada más**:
 * no se simula, no se sustituye en silencio, no se degrada a otro modelo sin decirlo.
 * El router atrapa la excepción, marca la tarea como bloqueada y persiste el estado.
 */
export async function ejecutorClaude({ instruccion } = {}) {
  if (!claudeDisponible()) {
    throw new ClaudeNoDisponible('CLAUDE_UNAVAILABLE=1 — la tarea queda bloqueada esperando a Claude, no se sustituye')
  }
  return { ok: false, ejecutor: 'claude', modelo: 'claude', proveedor: 'anthropic', ms: 0, costoUsd: 0,
    edicion: null, porQue: 'el ejecutor Claude es la sesión de Claude Code: la tarea se devuelve al orquestador humano', huboFallback: false, instruccion }
}
