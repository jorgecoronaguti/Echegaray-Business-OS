#!/usr/bin/env node
// PLAN 2 — Sincroniza el AppSheet "Pedidos de Materiales" (Sheet de respaldo GESTION DE
// MATERIALES) a public.pedidos_materiales. El OS pasa a poseer el dato: idempotente por
// ID_PEDIDO, resuelve obra_id contra public.obras por nombre aproximado. El Sheet sigue
// siendo la fuente de carga (AppSheet en campo); esto es el espejo gobernado por el OS.
//   node orquestador/scripts/sync-pedidos-materiales.mjs
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'

const SHEET_ID = process.env.ORQ_APPSHEET_PEDIDOS_SHEET_ID || '1yKoO0gUZysWfamTLR38TWn_sfOMZDMeyqHSNSFCWCec'
const TAB = 'PEDIDOS'

// "23/04/2026" -> "2026-04-23"; vacío/otro -> null.
function fechaISO(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '').trim())
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
const numOrNull = (s) => {
  const n = Number(String(s ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function main() {
  const op = await operadorEmail()
  if (!op) throw new Error('no hay cuenta operadora OAuth conectada — no puedo leer el Sheet')
  const token = await getTokenFor(op)()
  const fetchTab = async (rng) => {
    const u = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rng)}`
    const r = await (await fetch(u, { headers: { Authorization: `Bearer ${token}` } })).json()
    if (r.error) throw new Error('no pude leer el Sheet: ' + JSON.stringify(r.error).slice(0, 160))
    return r.values || []
  }
  const rows = await fetchTab(`${TAB}!A1:F2000`)
  // Mapa de la tabla OBRAS de la app: ID_OBRA (OB1, Ob4…) -> NOMBRE, para resolver los
  // pedidos que referencian la obra por código en vez de por nombre.
  const obrasApp = await fetchTab('OBRAS!A2:B50')
  const codigoAObra = new Map()
  for (const r of obrasApp) {
    const cod = String(r[0] ?? '').trim().toUpperCase()
    const nom = String(r[1] ?? '').trim()
    if (cod && nom) codigoAObra.set(cod, nom)
  }
  const resolverObra = (txt) => {
    const t = String(txt ?? '').trim()
    return codigoAObra.get(t.toUpperCase()) || t
  }
  const header = rows[0] || []
  const idx = (name) => header.findIndex((h) => norm(h) === norm(name))
  const iId = idx('ID_PEDIDO'), iObra = idx('OBRA'), iFecha = idx('FECHA'), iMat = idx('MATERIAL'), iCant = idx('CANTIDAD'), iEst = idx('ESTADO')

  // Obras del OS para el match por nombre.
  const { rows: obras } = await query('select id, nombre from public.obras')
  const obraNorms = obras.map((o) => ({ id: o.id, n: norm(o.nombre) }))
  const matchObra = (txt) => {
    const t = norm(txt)
    if (!t) return null
    const hit = obraNorms.find((o) => o.n && (o.n === t || o.n.includes(t) || t.includes(o.n) || o.n.split(' ')[0] === t.split(' ')[0]))
    return hit ? hit.id : null
  }

  let n = 0, conObra = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const idPedido = String(row[iId] ?? '').trim()
    if (!idPedido) continue
    const obraTexto = resolverObra(row[iObra]) || null // resuelve OB1 -> ESTRELLA
    const obraId = matchObra(obraTexto)
    if (obraId) conObra++
    await query(
      `insert into public.pedidos_materiales (id_pedido, obra_texto, obra_id, fecha, material, cantidad, estado, origen, sincronizado_en)
       values ($1,$2,$3,$4,$5,$6,$7,'appsheet_sheet', now())
       on conflict (id_pedido) do update set
         obra_texto=excluded.obra_texto, obra_id=excluded.obra_id, fecha=excluded.fecha,
         material=excluded.material, cantidad=excluded.cantidad, estado=excluded.estado,
         sincronizado_en=now()
       where public.pedidos_materiales.origen = 'appsheet_sheet'`,
      [idPedido, obraTexto, obraId, fechaISO(row[iFecha]), row[iMat] ?? null, numOrNull(row[iCant]), (row[iEst] ?? null)],
    )
    n++
  }
  await query(
    `update public.integraciones set estado='en_curso', salud='ok', ultimo_sync=now(),
       notas='Sheet de respaldo GESTION DE MATERIALES ('||$2||') accesible y sincronizado. Tablas: PEDIDOS, HERRAMIENTAS, MOVIMIENTOS, OBRAS, Prestamo/Alquiler. El OS espeja PEDIDOS en public.pedidos_materiales.'
     where slug='appsheet_pedidos'`,
    [null, SHEET_ID],
  ).catch(() => {})
  console.log(`sincronizados ${n} pedidos (${conObra} con obra resuelta en el OS)`)
  await closePool()
}
main().catch((e) => { console.error('sync falló:', e.message); process.exit(1) })
