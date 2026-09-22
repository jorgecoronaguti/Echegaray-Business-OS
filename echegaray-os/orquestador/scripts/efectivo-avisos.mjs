#!/usr/bin/env node
// EL AVISO DE UNA ENTREGA DE EFECTIVO — «le llega el aviso con el enlace para dar conformidad y firmar».
//
// Diseño (D02 · M01 · componente de canal 5): cuando Administración entrega efectivo, la persona recibe
// el enlace directo a la pantalla de firma, sin buscarla. El dueño eligió el 22/09/2026 un CANAL propio
// para las rendiciones (no mensaje directo), así que el aviso sale ahí, mencionando a la persona.
//
// SIN MONTO. El canal lo ve todo el grupo que rinde; cuánta plata recibió cada uno es de esa persona y
// de Administración, y está en la pantalla a la que lleva el enlace.
//
// UNA VEZ. `efectivo_entrega.avisada_en` se marca con el id del post, releído de Mattermost: un aviso
// que la API dijo publicar pero no se puede leer no cuenta como avisado y se reintenta.
//
//   node orquestador/scripts/efectivo-avisos.mjs [--dry]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const URL_APP = process.env.ORQ_APP_URL || 'https://app.ecsas.com.ar'

/** NÚCLEO PURO: el texto del aviso. */
export function textoDelAviso({ username, codigo, destino, entregaId }) {
  const quien = username ? `@${username}` : 'Hay'
  return [`${quien} ${username ? 'te entregaron' : 'una entrega de'} efectivo a rendir: **${codigo}** · ${destino}.`,
    `Confirmá que lo recibiste y firmá: ${URL_APP}/mi-informacion/efectivo/firmar/${entregaId}`,
    'Los tickets de lo que gastes, mandalos a este canal.'].join('\n')
}

function delEntorno(clave) {
  if (process.env[clave]) return process.env[clave]
  try {
    const txt = readFileSync(join(homedir(), '.config/echegaray-orq/comunicacion.env'), 'utf8')
    return txt.match(new RegExp(`^${clave}=(.*)$`, 'm'))?.[1]?.trim() ?? null
  } catch { return null }
}

/** Publica y RELEE el post. Devuelve el id sólo si se pudo leer de vuelta. */
async function publicarYReleer(channelId, message) {
  const base = String(delEntorno('MM_BASE_URL') ?? '').replace(/\/+$/, '')
  const token = delEntorno('MM_BOT_TOKEN')
  if (!base || !token) throw new Error('sin MM_BASE_URL / MM_BOT_TOKEN')
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const r = await fetch(`${base}/api/v4/posts`, { method: 'POST', headers: h, body: JSON.stringify({ channel_id: channelId, message }) })
  if (!r.ok) throw new Error(`Mattermost ${r.status} al publicar`)
  const { id } = await r.json()
  const v = await fetch(`${base}/api/v4/posts/${id}`, { headers: h })
  return v.ok && (await v.json())?.message === message ? id : null
}

/**
 * NÚCLEO: las entregas abiertas sin aviso, con la persona resuelta a su usuario de Mattermost.
 * Sin migración aplicada devuelve null (no hay nada que avisar y no es una falla).
 */
export async function pendientesDeAviso(port) {
  try {
    const { rows } = await port.query(
      `select e.id, e.codigo, coalesce(o.nombre, 'Estructura') as destino, i.plataforma_username as username
         from public.efectivo_entrega e
         left join public.obra_canonica o on o.id = e.obra_id
         left join public.perfiles pf on pf.persona_id = e.persona_id
         left join auth.users u on u.id = pf.id
         left join comunicacion.identidades i on lower(i.email) = lower(u.email) and i.plataforma = 'mattermost' and i.activo
        where e.avisada_en is null and e.anulada_en is null and e.cerrada_en is null
        order by e.creada_en`)
    return rows
  } catch (e) {
    if (e?.code === '42P01' || e?.code === '42703') return null
    throw e
  }
}

export async function avisarEntregas(port, { dry = false, publicar = publicarYReleer, log = console } = {}) {
  const pend = await pendientesDeAviso(port)
  if (!pend) return { avisadas: 0, sinMigracion: true }
  if (!pend.length) return { avisadas: 0 }
  const canal = (await port.query(
    `select channel_id from comunicacion.canales_area where plataforma = 'mattermost' and area_clave = 'rendicion' and activo limit 1`)).rows[0]?.channel_id
  // Sin canal no se inventa otro lugar: se dice, y las entregas quedan sin avisar hasta que exista.
  if (!canal) { log.warn?.(`efectivo: ${pend.length} entrega(s) sin avisar — falta el canal de Rendiciones`); return { avisadas: 0, sinCanal: pend.length } }
  let avisadas = 0
  for (const e of pend) {
    const texto = textoDelAviso({ username: e.username, codigo: e.codigo, destino: e.destino, entregaId: e.id })
    if (dry) { log.info?.(`[dry] ${e.codigo}: ${texto.split('\n')[0]}`); continue }
    const post = await publicar(canal, texto).catch((err) => { log.warn?.(`efectivo: no pude avisar ${e.codigo}: ${err.message}`); return null })
    if (!post) continue
    await port.query(`update public.efectivo_entrega set avisada_en = now(), aviso_post_id = $2 where id = $1 and avisada_en is null`, [e.id, post])
    avisadas++
  }
  return { avisadas, pendientes: pend.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await import('../lib/db.mjs')
  avisarEntregas({ query: (...a) => db.query(...a) }, { dry: process.argv.includes('--dry') })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(() => db.closePool?.())
}
