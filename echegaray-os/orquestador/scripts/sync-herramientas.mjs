#!/usr/bin/env node
// PLAN 2 — Sincroniza HERRAMIENTAS del AppSheet (GESTION DE MATERIALES) a public.herramientas.
// Idempotente por id_herramienta. No pisa lo editado en el OS (origen='os'). La imagen_url
// (foto en Storage) es propia del OS: el sync nunca la toca.
//   node orquestador/scripts/sync-herramientas.mjs
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'

const SHEET_ID = process.env.ORQ_APPSHEET_PEDIDOS_SHEET_ID || '1yKoO0gUZysWfamTLR38TWn_sfOMZDMeyqHSNSFCWCec'
const TAB = 'HERRAMIENTAS'

// "23/04/2026 22:00:07" -> ISO (o null).
function fechaISO(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || '').trim())
  if (!m) return null
  const [, d, mo, y, h = '0', mi = '0', se = '0'] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${se.padStart(2, '0')}`
}

async function main() {
  const op = await operadorEmail()
  if (!op) throw new Error('no hay cuenta operadora OAuth conectada')
  const token = await getTokenFor(op)()
  const fetchTab = async (rng) => {
    const u = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rng)}`
    const r = await (await fetch(u, { headers: { Authorization: `Bearer ${token}` } })).json()
    if (r.error) throw new Error('no pude leer el Sheet: ' + JSON.stringify(r.error).slice(0, 160))
    return r.values || []
  }
  const rows = await fetchTab(`${TAB}!A1:D2000`)
  // Mapa OBRAS: OB1→ESTRELLA, etc. para que la ubicación actual sea consistente con el
  // historial de movimientos (que ya resuelve códigos).
  const obrasApp = await fetchTab('OBRAS!A2:B50')
  const cod = new Map()
  for (const r of obrasApp) {
    const c = String(r[0] ?? '').trim().toUpperCase()
    const nom = String(r[1] ?? '').trim()
    if (c && nom) cod.set(c, nom)
  }
  const resolver = (t) => cod.get(String(t ?? '').trim().toUpperCase()) || (t ?? null)

  let n = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const id = String(row[0] ?? '').trim()
    if (!id) continue
    await query(
      `insert into public.herramientas (id_herramienta, nombre, ubicacion_actual, fecha, origen, sincronizado_en)
       values ($1,$2,$3,$4,'appsheet_sheet', now())
       on conflict (id_herramienta) do update set
         nombre=excluded.nombre, ubicacion_actual=excluded.ubicacion_actual, fecha=excluded.fecha,
         sincronizado_en=now()
       where public.herramientas.origen = 'appsheet_sheet'`,
      [id, row[1] ?? null, resolver(row[2]), fechaISO(row[3])],
    )
    n++
  }
  console.log(`sincronizadas ${n} herramientas`)
  await closePool()
}
main().catch((e) => { console.error('sync herramientas falló:', e.message); process.exit(1) })
