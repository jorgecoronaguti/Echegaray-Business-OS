#!/usr/bin/env node
// LA FIRMA DEL EMPLEADOR EN CADA RECIBO DEL LEGAJO.
//
//   node orquestador/scripts/firmar-recibos-legajo.mjs [--aplicar] [--limite N] [--persona <cuil>]
//
// ═══ ESTO FIRMA UN DOCUMENTO LABORAL ═══
//
// No es un cambio cosmético: estampa la firma del empleador en recibos de sueldo, que es lo que un
// inspector del IERIC o un juzgado va a mirar. Por eso:
//
//   · SIN `--aplicar` no escribe nada. La corrida en seco dice exactamente qué haría.
//   · La escritura es una REVISIÓN NUEVA del mismo archivo de Drive, no un archivo nuevo. El legajo
//     sigue apuntando al mismo `drive_file_id` y Drive conserva la versión anterior: se puede volver.
//   · Es IDEMPOTENTE. Un PDF ya sellado lleva la marca `ECSAS-FIRMA-EMPLEADOR-v1` en su metadato y no
//     se vuelve a firmar. Dos firmas encima quedan como un borrón y obligan a rehacer el PDF desde un
//     original que puede no existir.
//   · Un recibo sin el rótulo «FIRMA DEL EMPLEADOR» NO se firma: sale como FALTA_DATO. Poner la firma
//     en una coordenada estimada es firmar a ciegas.
//
// La ubicación la decide `lib/firma-en-recibo.mjs` (núcleo puro, con tests), anclada al rótulo que el
// propio recibo imprime. El día que el estudio mueva una fila, la firma se mueve con ella.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { PDFDocument } from 'pdf-lib'
import { getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'
import { rotuloDelEmpleador, ubicacionDeLaFirma, yaFirmado, MARCA } from '../lib/firma-en-recibo.mjs'

const pdfjs = await import(createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.mjs'))

const APLICAR = process.argv.includes('--aplicar')
const LIMITE = Number(process.argv[process.argv.indexOf('--limite') + 1]) || Infinity
const CUIL = process.argv.includes('--persona') ? process.argv[process.argv.indexOf('--persona') + 1] : null
const CUENTA = process.env.ORQ_LEGAJOS_CUENTA || 'rodrigo@ecsas.com.ar'
// ═══ LA FIRMA NO VIVE EN EL REPOSITORIO ═══
//
// Una firma escaneada es una CREDENCIAL: quien la tiene puede estampar el nombre del dueño en
// cualquier papel. Vive donde viven las credenciales de este OS —`~/.config/echegaray-orq/`— y no en
// git, donde quedaría en el historial para siempre y viajaría en cada clon del repositorio.
const FIRMA = process.env.ORQ_FIRMA_EMPLEADOR
  || `${process.env.HOME}/.config/echegaray-orq/firma-empleador.png`

const getTok = getTokenFor(CUENTA)
let tok = await getTok()

async function api(u, opt = {}, binario = false) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { ...opt, headers: { Authorization: `Bearer ${tok}`, ...(opt.headers || {}) } })
    if (r.ok) return binario ? Buffer.from(await r.arrayBuffer()) : (r.status === 204 ? {} : r.json())
    if (r.status === 401) { tok = await getTok(); continue }
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    throw new Error(`${r.status} ${String(await r.text()).slice(0, 180)}`)
  }
  throw new Error('reintentos agotados')
}

/** Sella un PDF en memoria. Devuelve el buffer nuevo, o el motivo por el que no se tocó. */
export async function sellar(buf, pngFirma) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  const out = await PDFDocument.load(buf, { ignoreEncryption: true })
  if (yaFirmado(`${out.getSubject() ?? ''} ${out.getKeywords() ?? ''}`)) return { que: 'ya_firmado' }
  const png = await out.embedPng(pngFirma)
  let puestas = 0; const sinRotulo = []
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    const rot = rotuloDelEmpleador(tc.items)
    if (!rot) { sinRotulo.push(i); continue }
    const u = ubicacionDeLaFirma(rot, { ancho: png.width, alto: png.height })
    out.getPage(i - 1).drawImage(png, { x: u.x, y: u.y, width: u.ancho, height: u.alto })
    puestas++
  }
  if (!puestas) return { que: 'falta_dato', sinRotulo }
  out.setSubject(`${out.getSubject() ?? ''} ${MARCA}`.trim())
  return { que: 'firmado', puestas, sinRotulo, bytes: Buffer.from(await out.save()) }
}

async function main() {
  const png = fs.readFileSync(FIRMA)
  const { rows } = await query(
    `select d.id, d.drive_file_id, d.nombre, p.nombre_completo, replace(replace(p.cuil,'-',''),' ','') cuil
       from public.documentacion_legajo d join public.personas p on p.id = d.persona_id
      where d.tipo_documento = 'recibo_sueldo' and d.drive_file_id is not null
        -- Los fixtures de E2E traen un drive_file_id inventado: pedirlo a Drive da 404 y ensucia
        -- el informe con fallas que no son de nadie.
        and coalesce(p.es_prueba, false) = false
        and ($1::text is null or replace(replace(p.cuil,'-',''),' ','') = $1)
      order by p.nombre_completo, d.nombre`, [CUIL ? CUIL.replace(/\D/g, '') : null])

  console.log(`${rows.length} recibo(s) en legajo${CUIL ? ` de ${CUIL}` : ''} · firma: ${FIRMA.split('/').pop()}`)
  console.log(APLICAR ? '── APLICANDO ──\n' : '── EN SECO: no se escribe nada ──\n')

  const cuenta = { firmados: 0, yaEstaban: 0, faltaDato: 0, fallaron: 0 }
  let n = 0
  for (const r of rows) {
    if (n++ >= LIMITE) break
    const quien = String(r.nombre_completo).slice(0, 28).padEnd(29)
    try {
      const buf = await api(`https://www.googleapis.com/drive/v3/files/${r.drive_file_id}?alt=media&supportsAllDrives=true`, {}, true)
      const s = await sellar(buf, png)
      if (s.que === 'ya_firmado') { cuenta.yaEstaban++; continue }
      if (s.que === 'falta_dato') {
        cuenta.faltaDato++
        console.log(`  ⊘ ${quien} ${String(r.nombre).slice(0, 40)} — FALTA_DATO: sin rótulo del empleador`)
        continue
      }
      if (APLICAR) {
        await api(`https://www.googleapis.com/upload/drive/v3/files/${r.drive_file_id}?uploadType=media&supportsAllDrives=true`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/pdf' }, body: s.bytes })
      }
      cuenta.firmados++
      if (cuenta.firmados <= 12 || cuenta.firmados % 50 === 0) {
        console.log(`  ✓ ${quien} ${String(r.nombre).slice(0, 40)} — ${s.puestas} pág`)
      }
    } catch (e) {
      cuenta.fallaron++
      console.log(`  ✗ ${quien} ${String(r.nombre).slice(0, 34)} — ${String(e.message).slice(0, 60)}`)
    }
  }
  console.log(`\n${APLICAR ? 'FIRMADOS' : 'SE FIRMARÍAN'}: ${cuenta.firmados} · ya estaban: ${cuenta.yaEstaban}`
    + ` · FALTA_DATO: ${cuenta.faltaDato} · fallaron: ${cuenta.fallaron}`)
  if (!APLICAR) console.log('\n(sin --aplicar no se escribió nada)')
  if (cuenta.fallaron) process.exitCode = 1
  await closePool()
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) await main()
