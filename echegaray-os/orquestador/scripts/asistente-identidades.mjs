#!/usr/bin/env node
// SIEMBRA DE IDENTIDADES — trae de Mattermost quién es quién y lo deja en
// `comunicacion.identidades`, que es lo que le permite al asistente resolver "avisale a
// Rodrigo" a una persona real en vez de a un texto.
//
// POR QUÉ UN SCRIPT Y NO UN ALTA AUTOMÁTICA AL VUELO: el equipo cambia pocas veces por año.
// Una sincronización explícita, idempotente y revisable es más barata y más segura que
// escribir en la tabla cada vez que alguien escribe en el chat.
//
// NO PISA EL TRABAJO DE UNA PERSONA: los `alias` cargados a mano (los apodos con que el
// equipo se nombra de verdad) se PRESERVAN y se les suman los que trae Mattermost. Es la
// regla de la casa — lo editado a mano manda.
//
// Uso:
//   node orquestador/scripts/asistente-identidades.mjs --dry-run
//   node orquestador/scripts/asistente-identidades.mjs
//
// Requiere MM_BASE_URL y MM_BOT_TOKEN en el entorno. El token NUNCA se imprime.

import { query, withTx } from '../lib/db.mjs'
import { registrarIdentidad, listarIdentidades } from '../comunicacion/asistente/identidades.mjs'
import { TZ_EMPRESA } from '../comunicacion/asistente/contratos.mjs'

const PAGINA = 200

/** Usuarios activos y humanos de Mattermost. Los bots no se registran: no se les recuerda nada. */
export async function traerUsuarios({ baseUrl, token, fetchImpl = globalThis.fetch, maxPaginas = 25 } = {}) {
  if (!baseUrl || !token) throw new Error('faltan MM_BASE_URL o MM_BOT_TOKEN en el entorno')
  const out = []
  for (let page = 0; page < maxPaginas; page++) {
    const url = `${String(baseUrl).replace(/\/+$/, '')}/api/v4/users?per_page=${PAGINA}&page=${page}&active=true`
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } })
    // El cuerpo del error puede traer el token reflejado: se informa el código, nada más.
    if (!res.ok) throw new Error(`Mattermost respondió ${res.status} al listar usuarios`)
    const lote = await res.json()
    if (!Array.isArray(lote) || !lote.length) break
    out.push(...lote)
    if (lote.length < PAGINA) break
  }
  return out.filter((u) => u && u.delete_at === 0 && u.is_bot !== true)
}

/** Usuario de Mattermost → identidad del OS. El nombre visible es el que la gente reconoce. */
export function aIdentidad(u, { aliasPrevios = [] } = {}) {
  const nombre = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
  const alias = new Set(aliasPrevios.map((a) => String(a).trim()).filter(Boolean))
  for (const a of [u.nickname, u.first_name, u.username]) if (a && String(a).trim()) alias.add(String(a).trim())
  return {
    plataforma: 'mattermost',
    plataformaUserId: String(u.id),
    plataformaUsername: u.username ?? null,
    nombreVisible: nombre || u.nickname || u.username || String(u.id),
    alias: [...alias],
    email: u.email ?? null,
    zonaHoraria: TZ_EMPRESA,
    activo: true,
  }
}

/**
 * Sincroniza. Con `dryRun` no escribe una sola fila: informa exactamente qué haría.
 * @returns {Promise<{nuevas:number, actualizadas:number, sinCambio:number, detalle:Array}>}
 */
export async function sincronizar({ port, usuarios, dryRun = false, log = console }) {
  const previas = new Map((await listarIdentidades(port)).map((i) => [i.plataformaUserId, i]))
  const resumen = { nuevas: 0, actualizadas: 0, sinCambio: 0, detalle: [] }

  for (const u of usuarios) {
    const previa = previas.get(String(u.id)) ?? null
    const nueva = aIdentidad(u, { aliasPrevios: previa?.alias ?? [] })
    const accion = !previa ? 'alta' : (cambio(previa, nueva) ? 'actualiza' : 'sin cambio')
    resumen.detalle.push({ usuario: nueva.plataformaUsername, nombre: nueva.nombreVisible, accion })
    if (accion === 'alta') resumen.nuevas++
    else if (accion === 'actualiza') resumen.actualizadas++
    else { resumen.sinCambio++; continue }
    if (!dryRun) await registrarIdentidad(port, nueva)
  }
  log?.info?.('identidades: sincronización terminada', {
    dryRun, nuevas: resumen.nuevas, actualizadas: resumen.actualizadas, sinCambio: resumen.sinCambio,
  })
  return resumen
}

/** ¿Cambió algo que valga la pena escribir? Evita un UPDATE por persona en cada corrida. */
function cambio(previa, nueva) {
  return previa.plataformaUsername !== nueva.plataformaUsername
    || previa.nombreVisible !== nueva.nombreVisible
    || (previa.email ?? null) !== (nueva.email ?? null)
    || previa.alias.join('|') !== nueva.alias.join('|')
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry')
  const usuarios = await traerUsuarios({ baseUrl: process.env.MM_BASE_URL, token: process.env.MM_BOT_TOKEN })
  const port = { query, withTx }
  const r = await sincronizar({ port, usuarios, dryRun })
  const linea = (d) => `  ${d.accion.padEnd(10)} @${d.usuario ?? '?'} — ${d.nombre}`
  console.log(`${dryRun ? 'SIMULACIÓN (no se escribió nada)' : 'SINCRONIZADO'} · ${usuarios.length} usuarios de Mattermost`)
  for (const d of r.detalle) console.log(linea(d))
  console.log(`\naltas: ${r.nuevas} · actualizadas: ${r.actualizadas} · sin cambio: ${r.sinCambio}`)
  process.exit(0)
}

const esCLI = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (esCLI) main().catch((e) => { console.error('identidades:', e.message); process.exit(1) })
