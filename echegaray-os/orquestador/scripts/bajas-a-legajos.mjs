// LIQUIDACIONES FINALES Y ACUSES DE BAJA → el legajo de cada uno. One-off del 01/09/2026.
// Por CUIL, nunca por nombre; idempotente (mira lo que ya está); lo no identificable se informa.
import fs from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { PDFParse } from 'pdf-parse'
import { getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'
import { personaDelRecibo } from '../lib/recibo-sueldo.mjs'

const APLICAR = process.argv.includes('--aplicar')
const DIR = '/tmp/claude-1001/-home-jorge-echegaray-os-app-echegaray-os/9eaaac60-ef35-4c43-a165-7946e2dd905b/scratchpad/liq/'
const getTok = getTokenFor('rodrigo@ecsas.com.ar')
let tok = await getTok()
async function api(u, opt = {}, binario = false) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { ...opt, headers: { Authorization: `Bearer ${tok}`, ...(opt.headers || {}) } })
    if (r.ok) return binario ? Buffer.from(await r.arrayBuffer()) : r.json()
    if (r.status === 401) { tok = await getTok(); continue }
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`)
  }
  throw new Error('reintentos agotados')
}
const listar = async (q) => (await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200`)).files ?? []
async function subir(carpeta, nombre, bytes) {
  const linde = '=-=liq' + Math.abs(nombre.length * 7919).toString(36)
  const cuerpo = Buffer.concat([
    Buffer.from(`--${linde}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpeta] })}\r\n--${linde}\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${linde}--\r\n`),
  ])
  return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${linde}` }, body: cuerpo,
  })
}
const limpio = (c) => String(c || '').replace(/\D/g, '')

// 1 · ALTA DE LOS QUE FALTAN EN personas — con su carpeta REAL de Drive, verificada sin ambigüedad.
const FALTAN = [
  ['20-24526956-1', 'CASTRO JUAN MARCELO', '85'], ['20-30989275-6', 'MORENO JULIO MIGUEL', '86'],
  ['20-44991784-8', 'QUIROZ FACUNDO MIGUEL', '87'], ['20-27798701-6', 'CASTRO GALVAN GERSON ULISES', '88'],
  ['20-32351020-3', 'DIAZ RAMON ORLANDO', '89'], ['20-43763846-3', 'AVILA ALEJANDRO LUIS', '90'],
  ['20-43058215-2', 'FLORES ALEJANDRO NAZARENO', '93'], ['23-32939356-9', 'CASTRO GALVAN HEBER LUCAS', '94'],
  // Identificados por el propio acuse AFIP (Apellido y nombre + CUIL); carpeta única en Drive.
  ['20-44844291-9', 'POSSE OROSCO JEREMIAS GABRIEL', null], ['23-38076601-9', 'BUSTOS OROSCO JONATHAN ERICK', null],
]
for (const [cuil, nombre, legajo] of FALTAN) {
  const ya = await query(`select id from public.personas where regexp_replace(cuil,'[^0-9]','','g')=$1`, [limpio(cuil)])
  if (ya.rows.length) { console.log(`· ${nombre}: ya está en personas`); continue }
  const carpetas = await query(`select drive_file_id, path from public.drive_index where is_folder and upper(name)=upper($1) and path like 'administracion/PERSONAL%'`, [nombre])
  if (carpetas.rows.length !== 1) { console.log(`✗ ${nombre}: ${carpetas.rows.length} carpetas candidatas — NO se da de alta a ciegas`); continue }
  console.log(`${APLICAR ? '＋' : '(dry) ＋'} alta ${nombre} (${cuil}) ← carpeta ${carpetas.rows[0].path.split('/')[2]}`)
  if (APLICAR) {
    await query(
      `insert into public.personas (nombre_completo, cuil, legajo, drive_folder_id, en_la_empresa, notas)
       values ($1,$2,$3,$4,false,$5) on conflict do nothing`,
      [nombre, cuil, legajo, carpetas.rows[0].drive_file_id,
       'Alta desde liquidación final del estudio (mail 08/2026). Baja liquidada; legajo ya existía en Drive.'])
  }
}

// 2 · COLGAR: liquidaciones finales (por página) y acuses AFIP (archivo entero), tipo "baja".
const plantel = (await query(`select id, cuil, nombre_completo, drive_folder_id from public.personas where cuil is not null and drive_folder_id is not null`)).rows
const buscar = (cuil) => plantel.find((p) => limpio(p.cuil) === limpio(cuil))
const enCarpeta = new Map()
async function colgar(persona, nombre, bytes) {
  if (!enCarpeta.has(persona.id)) enCarpeta.set(persona.id, new Map((await listar(`'${persona.drive_folder_id}' in parents and trashed=false`)).map((x) => [x.name, x.id])))
  const previos = enCarpeta.get(persona.id)
  if (previos.has(nombre)) { console.log(`  = ya estaba: ${nombre} (${persona.nombre_completo})`); return previos.get(nombre) }
  if (!APLICAR) { console.log(`  (dry) → ${persona.nombre_completo}: ${nombre}`); return null }
  const s = await subir(persona.drive_folder_id, nombre, bytes)
  previos.set(nombre, s.id)
  await query(
    `insert into public.documentacion_legajo (persona_id, tipo_documento, presente, drive_file_id, fecha_documento, nombre)
     values ($1,'baja',true,$2,$3,$4) on conflict (persona_id, drive_file_id) where drive_file_id is not null do nothing`,
    [persona.id, s.id, '2026-08-01', nombre])
  console.log(`  ✓ ${persona.nombre_completo}: ${nombre}`)
  return s.id
}

for (const f of fs.readdirSync(DIR)) {
  if (!/\.pdf$/i.test(f) || !/LIQUIDACION|Acuse/i.test(f)) continue
  const bytes = fs.readFileSync(DIR + f)
  const p = new PDFParse({ data: new Uint8Array(bytes) }); const texto = await p.getText(); await p.destroy()
  const paginas = texto.pages ?? []
  if (/LIQUIDACION/i.test(f)) {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    for (let i = 0; i < doc.getPageCount(); i++) {
      const d = personaDelRecibo(paginas[i]?.text ?? '')
      const persona = d && buscar(d.cuil)
      if (!persona) { console.log(`  ✗ ${f} p${i + 1}: sin persona (${d?.cuil ?? 'sin CUIL'})`); continue }
      const hoja = await PDFDocument.create(); const [pg] = await hoja.copyPages(doc, [i]); hoja.addPage(pg)
      await colgar(persona, `Liquidación final 2026-08 · ${persona.nombre_completo}.pdf`, Buffer.from(await hoja.save()))
    }
  } else if (/Acuse/i.test(f)) {
    const cuilM = (paginas[0]?.text ?? '').match(/\b(2[037]-\d{8}-\d)\b/)
    const persona = cuilM && buscar(cuilM[1])
    if (!persona) { console.log(`  ✗ ${f}: sin persona (${cuilM?.[1] ?? 'sin CUIL'})`); continue }
    await colgar(persona, `Acuse baja AFIP 2026-08 · ${persona.nombre_completo}.pdf`, bytes)
  }
}
await closePool()
