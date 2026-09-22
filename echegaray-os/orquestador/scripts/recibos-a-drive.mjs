#!/usr/bin/env node
// LOS RECIBOS DE PAGO ARCHIVADOS, AL LEGAJO EN DRIVE — `Legajos / <persona> / Recibos / <AAAA-MM-Q>`.
//
// La app (Vercel) no habla con Google ni escribe Drive: archivar en D13 deja el recibo en `archivado`
// con `drive_file_id` vacío, y esta corrida de la VM lo sube. Arma UN PDF por recibo con lo que el
// recibo congeló al emitirse (la foto de la liquidación sellada) y la firma que tenga: el trazo del
// teléfono dibujado en su lugar, la foto del papel firmado en la hoja siguiente, o las dos (conviven).
//
// ═══ TRES REGLAS ═══
//
// 1. SIN `--aplicar` NO ESCRIBE NADA: dice qué subiría, a qué carpeta y con qué nombre. `--dry` es el
//    default y también se acepta explícito.
// 2. IDEMPOTENTE. La carpeta de destino se lee antes: si ya hay un archivo con ese nombre (una corrida
//    anterior que subió y no llegó a escribir la base), se toma su id y no se duplica.
// 3. LA EVIDENCIA ES EL DESTINO. Después de subir se relee el archivo en Drive (id, nombre, carpeta)
//    y la fila en la base; si alguna no dice lo esperado, se informa como fallo.
//
// La carpeta del legajo es `personas.drive_folder_id` (la misma que usan `recibos-a-legajos.mjs` y
// `constancias-afip-a-legajos.mjs`). Quien no la tiene queda informado, no se le inventa una.
//
//   node orquestador/scripts/recibos-a-drive.mjs            → qué subiría (no escribe)
//   node orquestador/scripts/recibos-a-drive.mjs --aplicar  → sube y registra drive_file_id

import { createClient } from '@supabase/supabase-js'
import { getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'
import { diaDe, pdfDelRecibo } from '../lib/recibo-pago-pdf.mjs'
import {
  SUBCARPETA_RECIBOS, carpetaDelLegajo, nombreDelArchivo, periodoDeCarpeta,
} from '../../src/features/recibos/logica.ts'

const APLICAR = process.argv.includes('--aplicar')
const CUENTA = process.env.CUENTA_DRIVE_LEGAJOS || 'rodrigo@ecsas.com.ar'
const CARPETA = 'application/vnd.google-apps.folder'

// ── GOOGLE (perezoso: una corrida sin pendientes no pide token) ─────────────────────────────────────
let getTok = null
let tok = null
async function api(u, opt = {}, binario = false) {
  getTok ??= getTokenFor(CUENTA)
  tok ??= await getTok()
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { ...opt, headers: { Authorization: `Bearer ${tok}`, ...(opt.headers || {}) } })
    if (r.ok) return binario ? Buffer.from(await r.arrayBuffer()) : r.json()
    if (r.status === 401) { tok = await getTok(); continue }
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  }
  throw new Error('reintentos agotados')
}
const comillas = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const listar = (q) => api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`)
  .then((r) => r.files ?? [])

/** La subcarpeta `nombre` dentro de `padre`. Sin `--aplicar` no se crea: devuelve `null` y se informa. */
async function carpetaDe(padre, nombre) {
  const ya = await listar(`'${padre}' in parents and name='${comillas(nombre)}' and mimeType='${CARPETA}' and trashed=false`)
  if (ya[0]) return ya[0].id
  if (!APLICAR) return null
  const c = await api('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }),
  })
  return c.id
}

async function subir(carpeta, nombre, bytes) {
  const linde = '=-=recibo' + Date.now().toString(36)
  const cuerpo = Buffer.concat([
    Buffer.from(`--${linde}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpeta] })}\r\n--${linde}\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from(bytes), Buffer.from(`\r\n--${linde}--\r\n`),
  ])
  return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,parents&supportsAllDrives=true', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${linde}` }, body: cuerpo,
  })
}

// ── EL PAPEL FIRMADO, DEL BUCKET PRIVADO ────────────────────────────────────────────────────────────
function storage() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para leer el bucket `recibos`')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from('recibos')
}
async function bajarPapel(path) {
  const { data, error } = await storage().download(path)
  if (error) throw new Error(`no pude bajar el papel ${path}: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}

// ── LA CORRIDA ──────────────────────────────────────────────────────────────────────────────────────
const { rows } = await query(
  `select r.*, p.drive_folder_id
     from public.recibo_pago r join public.personas p on p.id = r.persona_id
    where r.estado = 'archivado' and r.drive_file_id is null and r.reemplazado_por is null
    order by r.numero`,
).catch((e) => {
  if (/recibo_pago/.test(e.message) && /does not exist/.test(e.message)) {
    console.log('recibo_pago no existe: falta aplicar la migración 20260922T1600. Nada que subir.')
    return closePool().then(() => process.exit(0))
  }
  throw e
})

console.log(`${APLICAR ? 'APLICAR' : 'ENSAYO (sin --aplicar no escribe)'} · ${rows.length} recibo(s) archivado(s) sin archivo en Drive`)
const informe = { subidos: 0, yaEstaban: 0, sinCarpeta: [], fallidos: [] }
for (const r of rows) {
  const desde = diaDe(r.desde)
  const nombre = nombreDelArchivo(r.codigo, r.persona_nombre, r.papel_path ? 'papel' : 'telefono')
  const camino = carpetaDelLegajo(r.persona_nombre, desde).join(' / ')
  if (!r.drive_folder_id) { informe.sinCarpeta.push(`${r.codigo} · ${r.persona_nombre}`); continue }
  try {
    const recibos = await carpetaDe(r.drive_folder_id, SUBCARPETA_RECIBOS)
    const destino = recibos ? await carpetaDe(recibos, periodoDeCarpeta(desde)) : null
    const ya = destino ? (await listar(`'${destino}' in parents and name='${comillas(nombre)}' and trashed=false`))[0] : null
    if (!APLICAR) { console.log(`  → ${camino} / ${nombre}${ya ? ' (ya está: sólo se registraría)' : destino ? '' : ' (crearía la carpeta)'}`); continue }
    const archivo = ya ?? await subir(destino, nombre, await pdfDelRecibo(r, r.papel_path ? await bajarPapel(r.papel_path) : null))
    // EVIDENCIA DEL EFECTO: el archivo en su carpeta, y la fila con su id.
    const leido = await api(`https://www.googleapis.com/drive/v3/files/${archivo.id}?fields=id,name,parents,trashed&supportsAllDrives=true`)
    if (leido.trashed || !(leido.parents ?? []).includes(destino)) throw new Error(`Drive no muestra ${nombre} en su carpeta`)
    const { rows: [fila] } = await query(
      `update public.recibo_pago set drive_file_id = $2, drive_subido_en = now()
        where id = $1 and drive_file_id is null returning drive_file_id`, [r.id, leido.id])
    if (fila?.drive_file_id !== leido.id) throw new Error('la base no guardó el drive_file_id')
    if (ya) informe.yaEstaban++; else informe.subidos++
    console.log(`  ✓ ${camino} / ${nombre} · ${leido.id}`)
  } catch (e) {
    informe.fallidos.push(`${r.codigo}: ${e.message}`)
    console.log(`  ✗ ${r.codigo}: ${e.message}`)
  }
}
console.log(`subidos ${informe.subidos} · ya estaban ${informe.yaEstaban} · sin carpeta de legajo ${informe.sinCarpeta.length} · fallidos ${informe.fallidos.length}`)
for (const s of informe.sinCarpeta) console.log(`  ⚠ sin personas.drive_folder_id: ${s}`)
await closePool()
if (informe.fallidos.length) process.exit(1)
