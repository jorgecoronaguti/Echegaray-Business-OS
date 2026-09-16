/**
 * ejecutores.mjs — QUIÉN HACE EL TRABAJO. Claude NO es la primera opción.
 *
 * Orden real de preferencia: determinístico → script → modelo HF remoto → Claude.
 * Un ejecutor devuelve SIEMPRE la misma forma (compatible con `lib/ml/resultado.mjs`):
 *   { ok, ejecutor, modelo, proveedor, ms, costoUsd, edicion|null, porQue, huboFallback }
 *
 * EGRESO: ningún ejecutor remoto recibe un fragmento que no pasó por `revisarEgreso()`.
 * No es una convención: `ejecutorHF` lo llama él mismo y tira si no pasa.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { revisarEgreso } from './politica-codigo.mjs'
import { token as tokenHF } from '../lib/ml/hf-inferencia.mjs'

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

  const tk = tokenHF() || (() => { try { return readFileSync(`${process.env.HOME}/.cache/huggingface/token`, 'utf8').trim() } catch { return null } })()
  if (!tk) {
    return { ok: false, ejecutor: 'hf', modelo, proveedor, ms: Date.now() - t0, costoUsd: 0, edicion: null,
      porQue: 'no hay token de Hugging Face', huboFallback: false }
  }

  const contexto = fragmentos.map((f) => `--- ${f.ruta} ---\n${f.texto}`).join('\n\n')
  const ctrl = new AbortController()
  const reloj = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: proveedor ? `${modelo}:${proveedor}` : modelo,
        temperature: temperatura, max_tokens: maxTokens,
        messages: [
          { role: 'system', content: 'Sos un programador que edita código de un repo TypeScript/Node. Respondés SÓLO con lo que se te pide, sin explicaciones, sin markdown de cierre, sin texto alrededor.' },
          { role: 'user', content: `${instruccion}\n\n${contexto}` },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, ejecutor: 'hf', modelo, proveedor, ms: Date.now() - t0, costoUsd: 0, edicion: null,
        porQue: `HF respondió ${res.status}: ${t.slice(0, 200)}`, huboFallback: false }
    }
    const json = await res.json()
    const texto = json.choices?.[0]?.message?.content ?? ''
    const { costoUsd, estimado } = costoDe(modelo, json.usage)
    return {
      ok: Boolean(texto), ejecutor: 'hf', modelo: json.model || modelo,
      proveedor: json.provider || proveedor, ms: Date.now() - t0, costoUsd, costoEstimado: estimado,
      uso: json.usage || null, salida: texto, edicion: null,
      porQue: texto ? 'el modelo respondió' : 'el modelo devolvió vacío', huboFallback: false,
    }
  } catch (e) {
    return { ok: false, ejecutor: 'hf', modelo, proveedor, ms: Date.now() - t0, costoUsd: 0, edicion: null,
      porQue: `${e.name}: ${e.message}`.slice(0, 200), huboFallback: false }
  } finally { clearTimeout(reloj) }
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
