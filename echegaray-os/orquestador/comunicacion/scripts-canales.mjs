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
const CANALES = [
  { nombre: 'Asistencia', slug: 'asistencia', area: 'personas', proposito: 'Carga y consulta de asistencia diaria de obreros.' },
  { nombre: 'Personal', slug: 'personal', area: 'personas', proposito: 'Legajos, jornales, altas y bajas.' },
  { nombre: 'Compras', slug: 'compras', area: 'compras', proposito: 'Pedidos, órdenes de compra y proveedores.' },
  { nombre: 'Administración y Finanzas', slug: 'administracion-finanzas', area: 'administracion_finanzas', proposito: 'Caja, cobranzas, pagos y posición financiera.' },
  { nombre: 'Obras', slug: 'obras', area: 'obras', proposito: 'Avance, producción, certificaciones y adicionales.' },
  { nombre: 'Calidad', slug: 'calidad', area: 'calidad', proposito: 'No conformidades, controles y ensayos.' },
  { nombre: 'Comercial', slug: 'comercial', area: 'comercial', proposito: 'Cotizaciones, licitaciones y clientes.' },
  { nombre: 'Gestión General', slug: 'gestion-general', area: 'gestion_general', proposito: 'Estado del OS, tablero y decisiones de dirección.' },
  { nombre: 'Contabilidad y Legales', slug: 'contabilidad-legales', area: 'contabilidad_legales', proposito: 'Impuestos, contratos y obligaciones.' },
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
    console.log(`  ${existia ? 'reutilizado' : 'creado    '} #${c.slug.padEnd(24)} → área ${c.area.padEnd(24)} ${miembro ? '· @os ya estaba' : '· @os agregado'}`)
  }

  const { rows } = await query(
    `select c.canal_nombre, c.area_clave, a.nombre from comunicacion.canales_area c
       join public.area_canonica a on a.clave = c.area_clave
      where c.activo order by a.orden, c.canal_nombre`)
  console.log(`\nbindings activos: ${rows.length}`)
  for (const r of rows) console.log(`  ${String(r.canal_nombre).padEnd(28)} → ${r.nombre}`)
}

main().then(() => closePool()).catch(async (e) => { console.error(e.message); await closePool(); process.exit(1) })
