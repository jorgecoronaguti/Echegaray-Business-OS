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
