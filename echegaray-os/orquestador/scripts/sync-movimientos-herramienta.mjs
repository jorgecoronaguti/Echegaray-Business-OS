#!/usr/bin/env node
// PLAN 2 — Sincroniza MOVIMIENTOS del AppSheet (GESTION DE MATERIALES) a
// public.movimientos_herramienta. Idempotente por id_movimiento. Resuelve códigos OB→obra
// vía la tabla OBRAS del mismo Sheet. No pisa lo registrado en el OS (origen='os').
//   node orquestador/scripts/sync-movimientos-herramienta.mjs
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'

const SHEET_ID = process.env.ORQ_APPSHEET_PEDIDOS_SHEET_ID || '1yKoO0gUZysWfamTLR38TWn_sfOMZDMeyqHSNSFCWCec'

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
  const rows = await fetchTab('MOVIMIENTOS!A1:E2000')
  const obrasApp = await fetchTab('OBRAS!A2:B50')
  const cod = new Map()
  for (const r of obrasApp) {
    const c = String(r[0] ?? '').trim().toUpperCase()
    const n = String(r[1] ?? '').trim()
    if (c && n) cod.set(c, n)
  }
  const resolver = (t) => cod.get(String(t ?? '').trim().toUpperCase()) || (t ?? null)

  let n = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const id = String(row[0] ?? '').trim()
    if (!id) continue
    await query(
      `insert into public.movimientos_herramienta (id_movimiento, id_herramienta, destino, responsable, fecha, origen, sincronizado_en)
       values ($1,$2,$3,$4,$5,'appsheet_sheet', now())
       on conflict (id_movimiento) do update set
         id_herramienta=excluded.id_herramienta, destino=excluded.destino,
         responsable=excluded.responsable, fecha=excluded.fecha, sincronizado_en=now()
       where public.movimientos_herramienta.origen = 'appsheet_sheet'`,
      [id, String(row[1] ?? '').trim() || null, resolver(row[2]), row[4] ?? null, fechaISO(row[3])],
    )
    n++
  }
  console.log(`sincronizados ${n} movimientos`)
  await closePool()
}
main().catch((e) => { console.error('sync movimientos falló:', e.message); process.exit(1) })
