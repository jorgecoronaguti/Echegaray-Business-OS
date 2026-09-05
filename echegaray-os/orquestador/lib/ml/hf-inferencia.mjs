// LA ÚNICA PUERTA A HUGGING FACE REMOTO. Ninguna otra parte del OS llama a HF directamente.
//
// ═══ POR QUÉ UNA SOLA PUERTA ═══
//
// Es la misma razón por la que `lib/ia/` es la única puerta a Claude. Llamadas dispersas significan
// que el token vive en N lugares, que el timeout es distinto en cada uno, que nadie puede contestar
// «cuánto gastamos» y —lo peor— que la comprobación de sensibilidad se hace o no se hace según qué
// módulo escribió cada uno. Un documento fiscal sale de la VM porque un módulo se olvidó de mirar.
//
// ═══ LA REGLA QUE NO SE NEGOCIA ═══
//
// Nada por encima de INTERNO sale de la VM sin autorización explícita. La política ya está escrita
// en `politica.mjs` y acá se aplica ANTES de armar la request, no después: si el chequeo estuviera
// después del `fetch`, el dato ya viajó.
//
// ═══ EL TOKEN ═══
//
// Vive en `~/.config/echegaray/orquestador.env`, con permisos 600, fuera del repositorio. Nunca en
// el código, nunca en un log, nunca en el frontend. Es de alcance acotado (`fine-grained`): lee
// repos, escribe repos propios e infiere. No puede facturar ni borrar la cuenta.

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { puedeSalir, SENSIBILIDAD } from './politica.mjs'
import { registrarTraza } from './traza.mjs'

const BASE = 'https://router.huggingface.co/v1'
const TIMEOUT_MS = Number(process.env.ORQ_HF_TIMEOUT_MS || 30_000)
/** Reintentos sólo para lo que se arregla esperando: 429 y 5xx. Un 401 no mejora reintentando. */
const ESPERAS = [800, 2500, 6000]

let _token
/** El token, del entorno o del archivo de configuración del servidor. Nunca del repositorio. */
export function token() {
  if (_token !== undefined) return _token
  _token = process.env.ORQ_HF_TOKEN || null
  if (!_token) {
    try {
      const txt = readFileSync(join(homedir(), '.config/echegaray/orquestador.env'), 'utf8')
      _token = txt.match(/^ORQ_HF_TOKEN=(.+)$/m)?.[1]?.trim() || null
    } catch { _token = null }
  }
  return _token
}

export function hayToken() { return Boolean(token()) }

/** Un error que dice qué pasó sin filtrar el token en el mensaje. */
class ErrorHF extends Error {
  constructor(mensaje, { estado = null, reintentable = false } = {}) {
    super(mensaje); this.name = 'ErrorHF'; this.estado = estado; this.reintentable = reintentable
  }
}

/**
 * Llama a Hugging Face remoto. Es la interfaz que usa el router; nadie más la llama a mano.
 *
 * @param {object} p
 *   capacidad     — qué se está pidiendo ('embed', 'classify', 'transcribe'...); va a la traza
 *   modelo        — el id del repo en el Hub
 *   revision      — el commit. Sin él no se sabe qué corrió; se exige para producción
 *   proveedor     — el proveedor del router (hf-inference, together, …) o null para que elija HF
 *   entrada       — el cuerpo que espera esa tarea
 *   sensibilidad  — la del DATO. Se compara contra la política ANTES de armar la request
 *   dominio       — el dominio del dato, para que la política resuelva su sensibilidad sola
 *   tarea         — 'feature-extraction' | 'text-classification' | 'automatic-speech-recognition' …
 */
export async function hfInferencia({
  capacidad, modelo, revision = null, proveedor = null, entrada, tarea = 'feature-extraction',
  sensibilidad = null, dominio = null, permitidoExplicitamente = false, timeoutMs = TIMEOUT_MS,
  traceId = null, modulo = null,
} = {}) {
  const tid = traceId ?? randomUUID()
  const t0 = Date.now()

  // ── 1. LA POLÍTICA, ANTES DE ARMAR NADA ──
  // El nombre del proveedor lo define `politica.mjs` y es 'huggingface'. Escribir 'hf-remoto' acá
  // no daba un error: daba «proveedor desconocido» y bloqueaba TODO, que es fallar cerrado — la
  // dirección correcta para fallar, pero por el motivo equivocado y sin que nadie lo note.
  const permiso = puedeSalir(dominio, 'huggingface', { permitidoExplicitamente })
  if (!permiso.permitido) {
    registrarTraza({ traceId: tid, capacidad, metodo: 'sin-resolver', proveedor: 'hf-remoto', ms: 0,
      accion: 'descartar', sensibilidad: permiso.sensibilidad, modelo }, { modulo })
    throw new ErrorHF(`la política no deja salir este dato a Hugging Face: ${permiso.porQue}`)
  }

  const tk = token()
  if (!tk) throw new ErrorHF('no hay token de Hugging Face configurado en el servidor')
  if (!modelo) throw new ErrorHF('hfInferencia necesita el modelo')

  const url = `${BASE}/${tarea === 'feature-extraction' ? 'embeddings' : 'chat/completions'}`
  const cuerpo = tarea === 'feature-extraction'
    ? { model: proveedor ? `${modelo}:${proveedor}` : modelo, input: entrada }
    : { model: proveedor ? `${modelo}:${proveedor}` : modelo, messages: entrada }

  let ultimo = null
  for (let intento = 0; intento <= ESPERAS.length; intento += 1) {
    const ctrl = new AbortController()
    const reloj = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      if (res.status === 429 || res.status >= 500) {
        throw new ErrorHF(`Hugging Face respondió ${res.status}`, { estado: res.status, reintentable: true })
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new ErrorHF(`Hugging Face respondió ${res.status}: ${t.slice(0, 160)}`, { estado: res.status })
      }
      const json = await res.json()
      const ms = Date.now() - t0
      // El costo real lo publica el router en las cabeceras cuando corresponde; si no viene, se
      // deja en null y NO se estima: un costo inventado es peor que un costo desconocido.
      const costoUsd = Number(res.headers.get('x-inference-cost')) || null
      registrarTraza({ traceId: tid, capacidad, metodo: 'hf-remoto', modelo, proveedor: proveedor ?? 'hf-router',
        ms, accion: 'aplicar', costoUsd, sensibilidad: permiso.sensibilidad, huboFallback: intento > 0 }, { modulo })
      return { ok: true, datos: json, ms, modelo, revision, proveedor: proveedor ?? 'hf-router', traceId: tid, costoUsd, intentos: intento + 1 }
    } catch (e) {
      ultimo = e
      const reintentable = e.reintentable || e.name === 'AbortError' || e.name === 'TypeError'
      if (!reintentable || intento === ESPERAS.length) break
      await new Promise((r) => setTimeout(r, ESPERAS[intento]))
    } finally {
      clearTimeout(reloj)
    }
  }

  registrarTraza({ traceId: tid, capacidad, metodo: 'sin-resolver', modelo, proveedor: proveedor ?? 'hf-router',
    ms: Date.now() - t0, accion: 'descartar', sensibilidad: permiso.sensibilidad }, { modulo })
  throw ultimo ?? new ErrorHF('Hugging Face no contestó')
}

/**
 * TRANSCRIBIR UN AUDIO EN HUGGING FACE. Manda los BYTES del archivo, sin decodificar.
 *
 * ═══ POR QUÉ ESTO EXISTE Y NO ALCANZA CON EL WHISPER LOCAL ═══
 *
 * `transformers.js` en Node NO decodifica audio: exige un Float32Array a 16 kHz y dice, textual,
 * «AudioContext is not available in your environment». Esta VM no tiene ffmpeg, ni numpy, ni
 * ningún decodificador de MP3 u Opus — y un mensaje de voz de Mattermost llega en Opus. O sea que
 * el whisper local, que está implementado y probado, hoy no puede recibir un archivo real.
 *
 * El endpoint de Hugging Face acepta el archivo tal como viene y lo decodifica del otro lado. Eso
 * convierte un bloqueo de infraestructura en una llamada de red.
 *
 * ═══ LA POLÍTICA SIGUE MANDANDO ═══
 *
 * Un parte de obra dictado nombra empleados y cantidades: no es público. Va con su `dominio` y la
 * política decide, igual que todo lo demás. Para MEDIR el modelo se usa audio público, que no tiene
 * nada de la empresa.
 */
export async function hfTranscribir({ audio, modelo = 'openai/whisper-large-v3', dominio,
  contentType = 'audio/mpeg', idioma = 'es', permitidoExplicitamente = false, traceId = null, modulo = null } = {}) {
  const tid = traceId ?? randomUUID()
  const t0 = Date.now()
  const permiso = puedeSalir(dominio, 'huggingface', { permitidoExplicitamente })
  if (!permiso.permitido) {
    registrarTraza({ traceId: tid, capacidad: 'transcribe', metodo: 'sin-resolver', proveedor: 'hf-router',
      ms: 0, accion: 'descartar', sensibilidad: permiso.sensibilidad, modelo }, { modulo })
    throw new ErrorHF(`la política no deja mandar este audio a Hugging Face: ${permiso.porQue}`)
  }
  const tk = token()
  if (!tk) throw new ErrorHF('no hay token de Hugging Face configurado')

  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${modelo}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': contentType },
    body: audio,
  })
  const ms = Date.now() - t0
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    registrarTraza({ traceId: tid, capacidad: 'transcribe', metodo: 'sin-resolver', modelo,
      proveedor: 'hf-router', ms, accion: 'descartar', sensibilidad: permiso.sensibilidad }, { modulo })
    throw new ErrorHF(`Hugging Face respondió ${res.status}: ${t.slice(0, 160)}`, { estado: res.status })
  }
  const j = await res.json()
  registrarTraza({ traceId: tid, capacidad: 'transcribe', metodo: 'hf-remoto', modelo,
    proveedor: 'hf-router', ms, accion: 'aplicar', sensibilidad: permiso.sensibilidad }, { modulo })
  return { texto: String(j.text ?? '').trim(), ms, modelo, traceId: tid, idioma }
}

/** Qué modelos publica el router para una tarea. Sirve para saber qué SE PUEDE pedir hoy, en vez de
 *  descubrirlo con un 404 en producción. */
export async function modelosDisponibles({ tarea = null } = {}) {
  const tk = token()
  if (!tk) return []
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${tk}` } })
  if (!res.ok) return []
  const j = await res.json()
  const lista = j.data ?? []
  return tarea ? lista.filter((m) => (m.tags ?? []).includes(tarea) || m.task === tarea) : lista
}

export { SENSIBILIDAD, ErrorHF }
