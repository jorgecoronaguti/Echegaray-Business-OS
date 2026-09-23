#!/usr/bin/env node
// EL AVISO DE UNA ENTREGA DE EFECTIVO — «le llega el aviso con el enlace para dar conformidad y firmar».
//
// Diseño (D02 · M01 · componente de canal 5): cuando Administración entrega efectivo, la persona recibe
// el enlace directo a la pantalla de firma, sin buscarla.
//
// ═══ POR MENSAJE DIRECTO, NO POR EL CANAL (dueño, 23/09/2026) ═══
//
// «Para la firma de registro de plata, XSAS tiene que mandar mensaje directo a cada persona que se le dio
// la plata para que firme, no vía canal Efectivo; así se hace el registro nada más». El canal es donde se
// REGISTRA la entrega; el pedido de firma es entre el bot y esa persona. Si la persona no tiene usuario de
// Mattermost atado, el aviso cae al canal mencionándola, como antes: peor un aviso público que ninguno.
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
export function textoDelAviso({ username, codigo, destino, entregaId, directo = false }) {
  const quien = directo ? 'Te entregaron' : username ? `@${username} te entregaron` : 'Hay una entrega de'
  return [`${quien} efectivo a rendir: **${codigo}** · ${destino}.`,
    `Confirmá que lo recibiste y firmá: ${URL_APP}/mi-informacion/efectivo/firmar?entrega=${entregaId}`,
    'Los tickets de lo que gastes, mandalos al canal Efectivo.'].join('\n')
}

/** El canal directo bot ↔ persona. Mattermost lo crea si no existe; devuelve su id. */
async function canalDirectoCon(mmUserId) {
  const base = String(delEntorno('MM_BASE_URL') ?? '').replace(/\/+$/, '')
  const token = delEntorno('MM_BOT_TOKEN')
  if (!base || !token || !mmUserId) return null
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const yo = await fetch(`${base}/api/v4/users/me`, { headers: h })
  if (!yo.ok) return null
  const { id: botId } = await yo.json()
  const r = await fetch(`${base}/api/v4/channels/direct`, { method: 'POST', headers: h, body: JSON.stringify([botId, String(mmUserId)]) })
  if (!r.ok) return null
  return (await r.json())?.id ?? null
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
      `select e.id, e.codigo, coalesce(o.nombre, 'Estructura') as destino, i.plataforma_username as username,
              i.plataforma_user_id as mm_user_id
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

export async function avisarEntregas(port, { dry = false, publicar = publicarYReleer, directo = canalDirectoCon, log = console } = {}) {
  const pend = await pendientesDeAviso(port)
  if (!pend) return { avisadas: 0, sinMigracion: true }
  if (!pend.length) return { avisadas: 0 }
  // EL CANAL, POR ORDEN (22/09/2026): el de rendiciones si existiera, y si no el de comprobantes —
  // Comprobantes-gastos, que es donde el dueño decidió que viva todo el efectivo. El canal propio se archivó;
  // sin este orden, los avisos para firmar dejaban de salir y nadie se enteraba.
  const canal = (await port.query(
    `select channel_id from comunicacion.canales_area
      where plataforma = 'mattermost' and area_clave in ('rendicion', 'compras') and activo
      order by case area_clave when 'rendicion' then 0 else 1 end limit 1`)).rows[0]?.channel_id
  // Sin canal no se inventa otro lugar: se dice, y las entregas quedan sin avisar hasta que exista.
  if (!canal) { log.warn?.(`efectivo: ${pend.length} entrega(s) sin avisar — no hay canal atado a rendicion ni a compras`); return { avisadas: 0, sinCanal: pend.length } }
  let avisadas = 0
  for (const e of pend) {
    // DIRECTO si la persona tiene usuario; si no, al canal con la mención. En el directo no hace falta el @.
    const dm = e.mm_user_id ? await directo(e.mm_user_id).catch(() => null) : null
    const texto = textoDelAviso({ username: dm ? null : e.username, codigo: e.codigo, destino: e.destino, entregaId: e.id, directo: !!dm })
    if (dry) { log.info?.(`[dry] ${e.codigo} (${dm ? 'directo' : 'canal'}): ${texto.split('\n')[0]}`); continue }
    const post = await publicar(dm ?? canal, texto).catch((err) => { log.warn?.(`efectivo: no pude avisar ${e.codigo}: ${err.message}`); return null })
    if (!post) continue
    await port.query(`update public.efectivo_entrega set avisada_en = now(), aviso_post_id = $2 where id = $1 and avisada_en is null`, [e.id, post])
    avisadas++
  }
  return { avisadas, pendientes: pend.length }
}

// ── LO QUE LA APP PIDE POR EL CANAL: RECLAMAR UNA RENDICIÓN (D03) Y PEDIR EL DATO DE UN TICKET (D05) ──
//
// La web corre en Vercel y no tiene el token del bot: encola el aviso en `public.efectivo_aviso`
// (migración 20260922T2800) y esto lo vacía. Mismo canal y mismo releído que el aviso de entrega: un
// post que la API dice haber publicado pero no se puede leer NO se marca enviado y se reintenta.
//
// El texto viene armado de la base —la app no elige qué se dice en el chat de la empresa— y no lleva
// un solo peso: el canal lo ve todo el grupo que rinde.

/** El canal oficial donde salen los avisos del efectivo. `null` si no hay ninguno atado. */
export async function canalDeEfectivo(port) {
  const { rows } = await port.query(
    `select channel_id from comunicacion.canales_area
      where plataforma = 'mattermost' and area_clave in ('rendicion', 'compras') and activo
      order by case area_clave when 'rendicion' then 0 else 1 end limit 1`)
  return rows[0]?.channel_id ?? null
}

/** NÚCLEO PURO: el mensaje final. La mención va adelante para que le suene el teléfono a quien debe. */
export function textoDelPedido({ username, texto }) {
  return username ? `@${username} ${texto}` : texto
}

export async function drenarAvisos(port, { dry = false, publicar = publicarYReleer, log = console, tope = 20 } = {}) {
  let pend
  try {
    const { rows } = await port.query(
      `select a.id, a.tipo, a.texto, i.plataforma_username as username
         from public.efectivo_aviso a
         join public.efectivo_entrega e on e.id = a.entrega_id
         left join public.perfiles pf on pf.persona_id = e.persona_id
         left join auth.users u on u.id = pf.id
         left join comunicacion.identidades i
                on lower(i.email) = lower(u.email) and i.plataforma = 'mattermost' and i.activo
        where a.enviado_en is null and a.intentos < 5
        order by a.pedido_en limit $1`, [tope])
    pend = rows
  } catch (e) {
    // Sin la 2800 aplicada no hay cola: no es una falla, es una base más vieja que el código.
    if (e?.code === '42P01' || e?.code === '42703') return { enviados: 0, sinMigracion: true }
    throw e
  }
  if (!pend.length) return { enviados: 0 }
  const canal = await canalDeEfectivo(port)
  if (!canal) {
    log.warn?.(`efectivo: ${pend.length} pedido(s) sin salir — no hay canal atado a rendicion ni a compras`)
    return { enviados: 0, sinCanal: pend.length }
  }
  let enviados = 0
  for (const a of pend) {
    const texto = textoDelPedido(a)
    if (dry) { log.info?.(`[dry] ${a.tipo}: ${texto.split('\n')[0]}`); continue }
    let post = null
    try {
      post = await publicar(canal, texto)
    } catch (err) {
      await port.query('select public.efectivo_aviso_fallo($1, $2)', [a.id, String(err?.message ?? err)])
      log.warn?.(`efectivo: no pude mandar el ${a.tipo}: ${err?.message ?? err}`)
      continue
    }
    if (!post) {
      await port.query('select public.efectivo_aviso_fallo($1, $2)', [a.id, 'publicado pero no se pudo releer'])
      continue
    }
    await port.query('select public.efectivo_aviso_enviado($1, $2)', [a.id, post])
    enviados++
  }
  return { enviados, pendientes: pend.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = await import('../lib/db.mjs')
  const port = { query: (...a) => db.query(...a) }
  const dry = process.argv.includes('--dry')
  Promise.all([avisarEntregas(port, { dry }), drenarAvisos(port, { dry })])
    .then(([e, a]) => console.log(JSON.stringify({ entregas: e, pedidos: a })))
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(() => db.closePool?.())
}
