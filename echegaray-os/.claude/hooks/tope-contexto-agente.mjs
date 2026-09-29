#!/usr/bin/env node
// TOPE DE CONTEXTO POR AGENTE — corre en `PreToolUse`.
//
// POR QUÉ EXISTE. La regla «un agente no pasa de ~250k de contexto y nunca se retoma uno que pasó
// los 300k» vivía sólo como instrucción, y una instrucción se olvida justo cuando la sesión está
// cargada. Medido (tokens-plan-2609): 75 % del gasto de una sesión eran subagentes, y el costo de
// cada vuelta de un agente crece con TODO lo que ya leyó — retomar uno de 400k cuesta 400k por vuelta.
//
// QUÉ HACE. Mide el contexto real del agente en SU transcript (la última respuesta del modelo:
// input + caché leído + caché escrito) y:
//   · SendMessage a un agente por encima del tope → se niega: hay que lanzar uno nuevo con un resumen.
//   · Una herramienta pedida DESDE un subagente por encima del tope → se niega con la orden de
//     cerrar: devolver ya el resultado con lo que tiene.
//
// NUNCA ROMPE. Sin transcript, sin id, o ante cualquier error: sale 0 sin decir nada. Sólo fs/path.
import { readFileSync, existsSync, openSync, readSync, fstatSync, closeSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TOPE = Number(process.env.ECOS_TOPE_CONTEXTO_AGENTE) || 250_000

/** Contexto de la última respuesta del modelo en un transcript .jsonl (lee sólo la cola). */
export function contextoDelTranscript(ruta, bytes = 256 * 1024) {
  if (!ruta || !existsSync(ruta)) return null
  const fd = openSync(ruta, 'r')
  try {
    const { size } = fstatSync(fd)
    const largo = Math.min(size, bytes)
    const buf = Buffer.alloc(largo)
    readSync(fd, buf, 0, largo, size - largo)
    const lineas = buf.toString('utf8').split('\n')
    for (let i = lineas.length - 1; i >= 0; i--) {
      if (!lineas[i].includes('"usage"')) continue
      try {
        const u = JSON.parse(lineas[i])?.message?.usage
        if (u) return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
      } catch { /* línea cortada por la cola: la anterior sirve */ }
    }
    return null
  } finally { closeSync(fd) }
}

/** Dónde está el transcript del agente, a partir del evento del hook. */
export function rutaDelAgente(ev) {
  const t = ev?.transcript_path
  if (!t) return { modo: null, ruta: null }
  const sub = (id) => join(dirname(t), basename(t, '.jsonl'), 'subagents', `agent-${id}.jsonl`)
  if (ev.agent_id) {
    const ruta = ev.agent_transcript_path ?? (t.includes('/subagents/') ? t : sub(ev.agent_id))
    return { modo: 'interno', ruta, id: ev.agent_id }
  }
  if (ev.tool_name === 'SendMessage') {
    const id = String(ev.tool_input?.to ?? '').trim()
    if (!/^[\w-]+$/.test(id)) return { modo: null, ruta: null }
    return { modo: 'reanudar', ruta: sub(id), id }
  }
  return { modo: null, ruta: null }
}

/** La decisión. PURA. `null` = dejar pasar. */
export function decidir({ modo, contexto, tope = TOPE }) {
  if (!modo || contexto == null || contexto <= tope) return null
  const k = Math.round(contexto / 1000)
  const t = Math.round(tope / 1000)
  if (modo === 'reanudar') {
    return `Ese agente ya tiene ${k}k de contexto (tope ${t}k): retomarlo cuesta ${k}k por vuelta. ` +
      'Lanzá un agente NUEVO con un resumen de lo que hizo y de lo que falta.'
  }
  return `Tu contexto llegó a ${k}k (tope ${t}k). No pidas más herramientas: devolvé YA tu resultado ` +
    'final con lo que tenés, y decí qué quedó sin verificar.'
}

// ═══ SESIÓN PRINCIPAL (29/09/2026) ═══
// El tope de arriba sólo miraba subagentes; la sesión principal crecía sin freno hasta el
// autocompactado. Dos controles, los dos baratos (un stat y la cola del transcript):
//   · LECTURA ENTERA de un archivo grande (Read sin offset/limit, o `cat archivo` suelto) → se niega
//     y se dice cómo leer la parte. Con el contexto ya cargado, el máximo baja.
//   · CRECIMIENTO: pasado el umbral de aviso, una nota por cada 10k nuevos (no en cada herramienta).
// Lo usa el hook GLOBAL (~/.echegaray-os/bin/hook-tope.mjs), que corre en toda sesión de la máquina.

export const AVISO_PRINCIPAL = Number(process.env.ECOS_AVISO_CONTEXTO) || 110_000
export const LECTURA_MAX = Number(process.env.ECOS_LECTURA_MAX) || 60 * 1024
export const LECTURA_MAX_CARGADO = Math.min(LECTURA_MAX, 20 * 1024)
const NO_TEXTO = /\.(png|jpe?g|gif|webp|bmp|pdf|ipynb)$/i

/** Qué archivo se lee ENTERO con esta herramienta, o null (lectura acotada o no es lectura). */
export function archivoDeLectura(tool, input) {
  if (tool === 'Read') {
    if (input?.offset != null || input?.limit != null) return null
    return typeof input?.file_path === 'string' ? input.file_path : null
  }
  if (tool === 'Bash') {
    // Sólo `cat ARCHIVO` solo: con un caño (| head, | grep) la salida ya viene acotada.
    const m = String(input?.command ?? '').match(/^\s*cat\s+(["']?)([^\s|;&<>"']+)\1\s*$/)
    return m ? m[2] : null
  }
  return null
}

/**
 * La decisión para la sesión principal (y la lectura de un subagente). PURA.
 * `tamano` en bytes del archivo que se leería entero; `banda` la última decena de miles avisada.
 * Devuelve { niega?, aviso?, banda? }.
 */
export function decidirPrincipal({ tool, input, contexto, tamano, banda = 0, aviso = AVISO_PRINCIPAL }) {
  const r = {}
  const archivo = archivoDeLectura(tool, input)
  const cargado = contexto != null && contexto >= aviso
  if (archivo && tamano != null && !NO_TEXTO.test(archivo)) {
    const max = cargado ? LECTURA_MAX_CARGADO : LECTURA_MAX
    if (tamano > max) {
      r.niega = `Leer entero ${archivo} son ${Math.round(tamano / 1024)} KB (~${Math.round(tamano / 4000)}k tokens, estimado a 4 bytes/token)` +
        `${cargado ? ` con ${Math.round(contexto / 1000)}k de contexto ya cargado` : ''}; el máximo es ${Math.round(max / 1024)} KB. ` +
        'Leé la parte que necesitás: Read con offset/limit, `grep -n` para ubicarla, o un subagente que devuelva sólo la conclusión.'
    }
  }
  if (cargado) {
    const b = Math.floor(contexto / 10_000)
    if (b > banda) {
      r.banda = b
      r.aviso = `Contexto de esta sesión: ${Math.round(contexto / 1000)}k (aviso desde ${Math.round(aviso / 1000)}k). ` +
        'Cerrá el bloque en curso —commit, traspaso breve— y /compact; hasta entonces, lecturas acotadas y salidas con | tail.'
    }
  }
  return r
}

function main() {
  let ev
  try { ev = JSON.parse(readFileSync(0, 'utf8')) } catch { return }
  const { modo, ruta } = rutaDelAgente(ev)
  if (!modo) return
  const motivo = decidir({ modo, contexto: contextoDelTranscript(ruta) })
  if (!motivo) return
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo },
  }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main() } catch { /* nunca rompe */ }
}
