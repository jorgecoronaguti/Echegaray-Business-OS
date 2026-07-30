#!/usr/bin/env node
// CANALES OPERATIVOS DEL OS — crea (o reutiliza) los canales privados por área y los ATA
// al área canónica. Idempotente: correrlo dos veces no duplica nada.
//
// Es la única pieza que "instala" la interfaz conversacional. No crea bots, ni servicios,
// ni WebSockets: usa el bot `@os` que ya existe y la misma infraestructura de siempre.
//
// Uso:  node orquestador/comunicacion/scripts-canales.mjs [--dry-run]

import { query, closePool } from '../lib/db.mjs'

const MM = process.env.MM_BASE_URL
const TOKEN = process.env.MM_BOT_TOKEN
const BOT = process.env.MM_BOT_USER_ID
const DRY = process.argv.includes('--dry-run')

/** Canal → área canónica (public.area_canonica). Es la ÚNICA lista, y es de instalación:
 *  el runtime la lee de la base, no de acá. */
/** Canales operativos a instalar. HOY hay uno solo: el de asistencia, que es la única
 *  capacidad con especialista operativo. Agregar Compras el día que exista su especialista
 *  es sumar una entrada acá — no tocar el Director ni el handler. */
const CANALES = [
  {
    nombre: 'Asistencia',
    slug: 'asistencia',
    area: 'personas',
    proposito: 'Registro, corrección y consulta de la asistencia diaria de obreros (JORNALES).',
    fijado: [
      'Canal operativo de asistencia de Echegaray Construcciones.',
      '',
      'Usá @os para registrar, corregir o consultar JORNALES.',
      '',
      'Ejemplos:',
      '@os asistencia',
      '@os registrar asistencia de hoy',
      '@os editar asistencia de ayer',
      '@os quién faltó ayer',
      '@os horas extra del 17/01',
    ].join('\n'),
  },
]

const api = async (ruta, opt = {}) => {
  const r = await fetch(`${MM}/api/v4${ruta}`, {
    ...opt, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opt.headers || {}) },
  })
  if (!r.ok) { const t = await r.text(); const e = new Error(`${ruta} → ${r.status} ${t.slice(0, 160)}`); e.status = r.status; throw e }
  return r.json()
}

async function main() {
  if (!MM || !TOKEN || !BOT) throw new Error('faltan MM_BASE_URL / MM_BOT_TOKEN / MM_BOT_USER_ID')
  const equipos = await api('/users/me/teams')
  const equipo = equipos[0]
  if (!equipo) throw new Error('el bot no pertenece a ningún equipo de Mattermost')
  console.log(`equipo: ${equipo.display_name} (${equipo.name})\n`)

  for (const c of CANALES) {
    let canal = null
    try { canal = await api(`/teams/${equipo.id}/channels/name/${c.slug}`) } catch (e) { if (e.status !== 404) throw e }
    const existia = Boolean(canal)
    if (!canal) {
      if (DRY) { console.log(`  [dry] crearía #${c.slug}`); continue }
      canal = await api('/channels', {
        method: 'POST',
        body: JSON.stringify({ team_id: equipo.id, name: c.slug, display_name: c.nombre, type: 'P', purpose: c.proposito }),
      })
    }
    // El bot tiene que estar adentro para poder leer y responder.
    let miembro = true
    try { await api(`/channels/${canal.id}/members/${BOT}`) } catch { miembro = false }
    if (!miembro && !DRY) await api(`/channels/${canal.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: BOT }) })

    // El BINDING es lo que hace que el canal signifique algo para el Director.
    if (!DRY) {
      await query(
        `insert into comunicacion.canales_area (plataforma, channel_id, canal_nombre, area_clave, activo)
           values ('mattermost', $1, $2, $3, true)
         on conflict (plataforma, channel_id)
           do update set canal_nombre = excluded.canal_nombre, area_clave = excluded.area_clave,
                         activo = true, actualizado_at = now()`,
        [canal.id, c.nombre, c.area])
    }
    // MENSAJE FIJADO, idempotente: si ya hay uno fijado del bot con el mismo texto, no se
    // publica otro. Correr el instalador dos veces no llena el canal de mensajes iguales.
    let fijado = 'sin mensaje'
    if (c.fijado && !DRY) {
      const pins = await api(`/channels/${canal.id}/pinned`)
      const ya = Object.values(pins.posts ?? {}).find((p) => p.user_id === BOT && p.message.trim() === c.fijado.trim())
      if (ya) fijado = `ya fijado (${ya.id})`
      else {
        const post = await api('/posts', { method: 'POST', body: JSON.stringify({ channel_id: canal.id, message: c.fijado }) })
        await api(`/posts/${post.id}/pin`, { method: 'POST' })
        fijado = `fijado ahora (${post.id})`
      }
    }
    console.log(`  ${existia ? 'reutilizado' : 'creado    '} #${c.slug.padEnd(20)} → área ${c.area.padEnd(12)} · tipo ${canal.type} · ${miembro ? '@os ya estaba' : '@os agregado'} · ${fijado}`)
    console.log(`     channel_id ${canal.id} · team ${canal.team_id}`)
  }

  const { rows } = await query(
    `select c.canal_nombre, c.area_clave, a.nombre from comunicacion.canales_area c
       join public.area_canonica a on a.clave = c.area_clave
      where c.activo order by a.orden, c.canal_nombre`)
  console.log(`\nbindings activos: ${rows.length}`)
  for (const r of rows) console.log(`  ${String(r.canal_nombre).padEnd(28)} → ${r.nombre}`)
}

main().then(() => closePool()).catch(async (e) => { console.error(e.message); await closePool(); process.exit(1) })
