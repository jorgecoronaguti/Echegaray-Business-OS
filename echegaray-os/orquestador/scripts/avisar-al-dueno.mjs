#!/usr/bin/env node
// AVISARLE AL DUEÑO POR EL BOT. Un mensaje directo, no un canal.
//
//   node orquestador/scripts/avisar-al-dueno.mjs "el texto"
//   echo "el texto" | node orquestador/scripts/avisar-al-dueno.mjs
//
// ═══ POR QUÉ UN DM Y NO UN CANAL ═══
//
// Un aviso de despliegue en un canal lo leen todos y no lo atiende nadie. Va al DM del dueño con el
// bot, que es donde él ya conversa con el OS.
//
// ═══ FALLA CERRADO, Y RUIDOSO ═══
//
// Sin `MM_BASE_URL` o `MM_BOT_TOKEN` no inventa un canal ni escribe en otro lado: sale con error.
// Un avisador que «funciona» sin haber avisado es peor que ninguno — quien lo llamó se queda
// creyendo que el dueño se enteró.
//
// El token sale del archivo del servicio, con permisos 600 y fuera del repositorio. Nunca se
// imprime, ni siquiera en el error.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const USUARIO = process.env.ORQ_DUENO_MM ?? 'jorge'

/** Lee una variable del archivo de entorno del servicio de comunicación. */
function delEntorno(clave) {
  if (process.env[clave]) return process.env[clave]
  try {
    const txt = readFileSync(join(homedir(), '.config/echegaray-orq/comunicacion.env'), 'utf8')
    return txt.match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? null
  } catch { return null }
}

async function mm(ruta, { metodo = 'GET', cuerpo = null } = {}) {
  const base = String(delEntorno('MM_BASE_URL') ?? '').replace(/\/+$/, '')
  const token = delEntorno('MM_BOT_TOKEN')
  if (!base || !token) throw new Error('sin MM_BASE_URL / MM_BOT_TOKEN: no hay por dónde avisar')
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    // El detalle puede traer el eco de la request: se recorta y NUNCA se incluye el token.
    throw new Error(`Mattermost ${res.status} en ${ruta}: ${t.slice(0, 160)}`)
  }
  return res.json()
}

export async function avisar(texto) {
  const cuerpo = String(texto ?? '').trim()
  if (!cuerpo) throw new Error('no hay nada que avisar')
  const bot = delEntorno('MM_BOT_USER_ID')
  if (!bot) throw new Error('sin MM_BOT_USER_ID')
  const dueno = await mm(`/api/v4/users/username/${USUARIO}`)
  // El canal directo se crea si no existe y se devuelve si ya existe: es idempotente del lado de
  // Mattermost, así que no hace falta buscarlo antes.
  const canal = await mm('/api/v4/channels/direct', { metodo: 'POST', cuerpo: [bot, dueno.id] })
  const post = await mm('/api/v4/posts', { metodo: 'POST', cuerpo: { channel_id: canal.id, message: cuerpo } })
  return { ok: true, postId: post.id, canal: canal.id, para: dueno.username }
}

async function main() {
  const arg = process.argv.slice(2).join(' ').trim()
  const texto = arg || readFileSync(0, 'utf8')
  const r = await avisar(texto)
  console.log(`avisado a @${r.para} · post ${r.postId}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
