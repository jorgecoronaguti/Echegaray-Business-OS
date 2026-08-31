#!/usr/bin/env node
// MARCHA ATRÁS DEL SELLADO: devolver cada recibo a su versión SIN la firma del empleador.
//
//   node orquestador/scripts/desfirmar-recibos-legajo.mjs [--aplicar] [--paralelo N]
//
// El sellador escribe una REVISIÓN NUEVA del mismo archivo de Drive, así que la versión sin firmar
// sigue existiendo. Esto la vuelve a poner como contenido actual, también como revisión nueva: no se
// borra nada del historial, se le agrega el paso de vuelta.
//
// ═══ TRES CONDICIONES ANTES DE TOCAR UN ARCHIVO ═══
//
//   1. El contenido de HOY tiene que llevar la marca `ECSAS-FIRMA-EMPLEADOR-v1`. Un recibo que nunca
//      se firmó no se toca.
//   2. Tiene que existir una revisión ANTERIOR. Sin ella no hay a dónde volver: se informa.
//   3. Esa revisión anterior NO puede llevar la marca. Si la lleva, la firma es más vieja que este
//      sellado y volver ahí no devolvería el papel limpio — se informa y se deja como está.
//
// Las tres se verifican por CONTENIDO descargado, nunca por fecha ni por tamaño: una restauración a
// ciegas sobre un legajo es tan cara como la firma que se quiere deshacer.
import { PDFDocument } from 'pdf-lib'
import { getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'
import { yaFirmado, MARCA } from '../lib/firma-en-recibo.mjs'

const APLICAR = process.argv.includes('--aplicar')
const PARALELO = Number(process.argv[process.argv.indexOf('--paralelo') + 1]) || 8
const CUENTA = process.env.ORQ_LEGAJOS_CUENTA || 'rodrigo@ecsas.com.ar'

const getTok = getTokenFor(CUENTA)
let tok = await getTok()

async function api(u, opt = {}, binario = false) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { ...opt, headers: { Authorization: `Bearer ${tok}`, ...(opt.headers || {}) } })
    if (r.ok) return binario ? Buffer.from(await r.arrayBuffer()) : (r.status === 204 ? {} : r.json())
    if (r.status === 401) { tok = await getTok(); continue }
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    throw new Error(`${r.status} ${String(await r.text()).slice(0, 160)}`)
  }
  throw new Error('reintentos agotados')
}

const firmado = async (buf) => yaFirmado(
  `${(await PDFDocument.load(buf, { ignoreEncryption: true })).getSubject() ?? ''}`)

const { rows } = await query(
  `select d.drive_file_id, d.nombre, p.nombre_completo
     from public.documentacion_legajo d join public.personas p on p.id = d.persona_id
    where d.tipo_documento = 'recibo_sueldo' and d.drive_file_id is not null
      and coalesce(p.es_prueba, false) = false
    order by p.nombre_completo, d.nombre`)

console.log(`${rows.length} recibo(s) en legajo · marca buscada: ${MARCA}`)
console.log(APLICAR ? '── APLICANDO LA MARCHA ATRÁS ──\n' : '── EN SECO: no se escribe nada ──\n')

const cuenta = { revertidos: 0, sinFirma: 0, sinRevision: 0, fallaron: 0 }
let cursor = 0
const uno = async (r) => {
  const quien = String(r.nombre_completo).slice(0, 26).padEnd(27)
  try {
    const hoy = await api(`https://www.googleapis.com/drive/v3/files/${r.drive_file_id}?alt=media&supportsAllDrives=true`, {}, true)
    if (!(await firmado(hoy))) { cuenta.sinFirma++; return }

    const { revisions = [] } = await api(
      `https://www.googleapis.com/drive/v3/files/${r.drive_file_id}/revisions?fields=revisions(id,modifiedTime)&pageSize=200&supportsAllDrives=true`)
    if (revisions.length < 2) {
      cuenta.sinRevision++
      console.log(`  ⚠ ${quien} ${String(r.nombre).slice(0, 34)} — firmado pero SIN revisión anterior: queda como está`)
      return
    }
    const previa = revisions[revisions.length - 2]
    const antes = await api(
      `https://www.googleapis.com/drive/v3/files/${r.drive_file_id}/revisions/${previa.id}?alt=media&supportsAllDrives=true`, {}, true)
    if (await firmado(antes)) {
      cuenta.sinRevision++
      console.log(`  ⚠ ${quien} ${String(r.nombre).slice(0, 34)} — la revisión anterior TAMBIÉN está firmada: no se toca`)
      return
    }

    if (APLICAR) {
      await api(`https://www.googleapis.com/upload/drive/v3/files/${r.drive_file_id}?uploadType=media&supportsAllDrives=true`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/pdf' }, body: antes })
    }
    cuenta.revertidos++
    if (cuenta.revertidos <= 8 || cuenta.revertidos % 100 === 0) {
      console.log(`  ↩ ${quien} ${String(r.nombre).slice(0, 34)} — vuelto a ${previa.modifiedTime.slice(0, 16).replace('T', ' ')}`)
    }
  } catch (e) {
    cuenta.fallaron++
    console.log(`  ✗ ${quien} ${String(r.nombre).slice(0, 30)} — ${String(e.message).slice(0, 60)}`)
  }
}
await Promise.all(Array.from({ length: PARALELO }, async () => { while (cursor < rows.length) await uno(rows[cursor++]) }))

console.log(`\n${APLICAR ? 'REVERTIDOS' : 'SE REVERTIRÍAN'}: ${cuenta.revertidos} · nunca firmados: ${cuenta.sinFirma}`
  + ` · sin vuelta atrás: ${cuenta.sinRevision} · fallaron: ${cuenta.fallaron}`)
if (!APLICAR) console.log('\n(sin --aplicar no se escribió nada)')
if (cuenta.fallaron) process.exitCode = 1
await closePool()
