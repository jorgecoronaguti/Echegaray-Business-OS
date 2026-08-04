#!/usr/bin/env node
// LAS FACTURAS DE VENTA DE UN MES, DESDE DRIVE AL CHAT, CON LOS PDF ADJUNTOS.
//
// ═══ LA FECHA SALE DEL PDF, NO DE DRIVE ═══
//
// La primera versión ordenaba por `modifiedTime`, que es cuándo se subió el archivo. El dueño lo
// corrigió: "la fecha de las facturas tenés que leer, es decir lo que dice adentro el PDF". Tenía
// razón y no era teórico: la nota de crédito 0001-00000008 se EMITIÓ el 16/07 y se SUBIÓ el 20/07.
// Ordenar por Drive la ponía en el día equivocado, y un mes de facturación armado con fechas de
// subida no es el mes de facturación.
//
// El texto se extrae LOCALMENTE (`readPdfText`, 0 costo de API): no se le manda un PDF al modelo
// para leer una fecha que está escrita en texto plano.
//
// ═══ SE ENTREGA LO QUE HAY Y SE DECLARA LO QUE NO CIERRA ═══
//
// Cada comprobante se cruza contra el libro de IVA de ARCA que el OS ya replica. Lo que está en un
// lado y no en el otro se dice; no se calla para que la lista quede prolija.
//
//   node orquestador/scripts/facturas-emitidas-al-chat.mjs 2026-07            → muestra, no manda
//   node orquestador/scripts/facturas-emitidas-al-chat.mjs 2026-07 --mandar   → sube y publica

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { MattermostCliente } from '../../../communication-service/src/channels/mattermost/mattermost-cliente.mjs'
import { leerNombre, leerPdf, cruzar, mensaje } from '../lib/facturas-emitidas-drive.mjs'

const CARPETA = process.env.ORQ_FACTURAS_CARPETA || '1tAY4RtcGVZ_S-_bpTOVMkIH8rql_y4_G'
const MES = process.argv.find((a) => /^\d{4}-\d{2}$/.test(a))
const MANDAR = process.argv.includes('--mandar')
const DESTINO = process.env.ORQ_FACTURAS_DESTINO || 'jorge'
const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

async function main() {
  if (!MES) throw new Error('falta el mes: node orquestador/scripts/facturas-emitidas-al-chat.mjs 2026-07')
  const google = makeGoogleClient({ config: loadConfig() })

  // ── 1. Candidatos por nombre. El nombre de ARCA dice tipo y número; la fecha no está ahí.
  const archivos = await google.listarCarpeta(CARPETA)
  const candidatos = archivos
    .filter((a) => !String(a.mimeType ?? '').includes('folder') && leerNombre(a.name))
    .map((a) => ({ ...a, ...leerNombre(a.name) }))
  console.log(`CARPETA ${CARPETA} · ${archivos.length} archivo(s) · ${candidatos.length} con nombre de comprobante`)

  // ── 2. La fecha, leída de adentro. Se acota por la de Drive sólo para no bajar 171 PDF:
  // un comprobante emitido en julio no puede haberse subido antes de julio.
  const posibles = candidatos.filter((a) => String(a.modifiedTime).slice(0, 7) >= MES)
  const delMes = []
  const sinFecha = []
  for (const a of posibles) {
    const t = await google.readPdfText(a.id, { maxChars: 6000 })
    if (t.scanned) { sinFecha.push({ ...a, motivo: 'el PDF es una imagen escaneada: no tiene texto que leer' }); continue }
    const d = leerPdf(t.text)
    if (!d.fecha) { sinFecha.push({ ...a, motivo: 'no pude determinar la fecha de emisión dentro del PDF' }); continue }
    if (String(d.fecha).slice(0, 7) !== MES) continue
    delMes.push({ ...a, ...d, importe: d.total })
  }
  delMes.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.numero.localeCompare(y.numero))

  // ── 3. El cruce contra ARCA. Un control no se valida con la fuente que produce el número.
  let enArca = []
  try {
    const { query } = await import('../lib/db.mjs')
    const { rows } = await query(
      `select comprobante, importe, fecha from arca.comprobantes_emitidos
       where to_char(fecha,'YYYY-MM') = $1`, [MES]).catch(() => ({ rows: [] }))
    enArca = rows ?? []
  } catch { enArca = [] }
  const cruce = cruzar(delMes.map((d) => ({ ...d, importe: d.total })), enArca)

  const neto = delMes.reduce((a, d) => a + (d.resta ? -d.total : d.total), 0)
  console.log('')
  for (const d of delMes) {
    console.log(`  ${d.fecha}  ${d.comprobante.padEnd(15)} ${d.tipoNombre.padEnd(28)}`
      + ` ${String(d.cliente ?? '?').slice(0, 30).padEnd(31)} ${(d.resta ? '−' : ' ') + plata(d.total)}`
      + (d.fecha !== String(d.modifiedTime).slice(0, 10) ? `   ⚠ Drive dice ${String(d.modifiedTime).slice(0, 10)}` : ''))
  }
  console.log(`  ${''.padEnd(19)}${'TOTAL NETO'.padEnd(60)} ${plata(neto)}`)
  for (const s of sinFecha) console.log(`  ⚠ ${s.name}: ${s.motivo}`)
  if (!MANDAR) { console.log('\n(sin --mandar: no se publicó nada)'); return }

  // ── 4. Al chat, con los PDF encima. Subir y postear son dos pasos en Mattermost.
  const mm = new MattermostCliente({ baseUrl: process.env.MM_BASE_URL, token: process.env.MM_BOT_TOKEN })
  const yo = await mm._req('GET', '/users/me')
  const destino = await mm._req('GET', `/users/username/${encodeURIComponent(DESTINO)}`)
  const canal = await mm._req('POST', '/channels/direct', [yo.id, destino.id])

  const fileIds = []
  for (const d of delMes) {
    const bytes = await google.descargarBytes(d.id)
    const info = await mm.subirArchivo({ channel_id: canal.id, nombre: d.name, datos: bytes, mime: 'application/pdf' })
    fileIds.push(info.id)
  }
  // Mattermost admite hasta 10 adjuntos por post: si algún mes se pasa, se parte en varios.
  const lotes = []
  for (let i = 0; i < fileIds.length; i += 10) lotes.push(fileIds.slice(i, i + 10))
  const texto = mensaje(MES, cruce)
  let raiz = null
  for (const [i, lote] of lotes.entries()) {
    const post = await mm.crearPost({
      channel_id: canal.id,
      message: i === 0 ? texto : `(continúa — adjuntos ${i * 10 + 1} a ${i * 10 + lote.length})`,
      root_id: raiz ?? undefined,
      file_ids: lote,
    })
    raiz = raiz ?? post.id
  }

  // ── LA EVIDENCIA: el post releído del servidor, con sus adjuntos.
  const publicado = await mm._req('GET', `/posts/${raiz}`)
  console.log(`\n✓ publicado en el privado con @${DESTINO} · post ${publicado.id}`
    + ` · ${(publicado.file_ids ?? []).length} adjunto(s) en el primer mensaje de ${fileIds.length} en total`)
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
