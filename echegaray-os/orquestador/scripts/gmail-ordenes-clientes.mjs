#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS ÓRDENES DEL CLIENTE, DE LA CASILLA A LA FICHA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
//   node orquestador/scripts/gmail-ordenes-clientes.mjs            # DRY: mira y no toca nada
//   node orquestador/scripts/gmail-ordenes-clientes.mjs --aplicar  # sube al bucket y escribe
//
// Pedido del dueño (09/09/2026): las órdenes de compra y de pago que mandan los clientes viven hoy
// como adjuntos en su casilla. Nadie más las ve, nadie puede contarlas y nadie sabe a qué obra
// pertenecen. Esto las baja y las deja colgadas de su obra en `/clientes`.
//
// ═══ SÓLO LECTURA DE GMAIL, SIEMPRE ═══
//
// Este script LEE. No manda, no responde, no etiqueta, no archiva y no borra un mail. Lo único que
// escribe está del lado del OS: un objeto en el bucket privado y una fila en `cliente_orden`.
//
// ═══ POR QUÉ ES IDEMPOTENTE POR (mensaje, nombre, tamaño) Y NO POR attachment_id ═══
//
// Gmail REGENERA el `attachmentId` entre lecturas del mismo mensaje. Una clave que lo usara haría
// que la segunda corrida viera todo como nuevo y duplicara cada orden sin violar ninguna
// restricción — el modo de falla más caro, porque el error se ve recién cuando alguien cuenta.
// La restricción vive en la BASE (`cliente_orden_gmail_unica_idx`), no en un `select` previo: dos
// corridas simultáneas se pisarían igual con el `select`.
//
// ═══ QUÉ HACE CUANDO NO SABE ═══
//
// · No sabe de qué cliente es → NO guarda nada y lo lista como «sin cliente». Un documento
//   archivado contra el cliente equivocado es peor que uno que no se archivó.
// · Sabe el cliente pero no la obra → lo guarda A NIVEL CLIENTE (`obra_id` null). La pantalla lo
//   muestra bajo el cliente y una persona lo asigna.
// · El PDF no dice el número, la fecha o el importe → esos campos quedan NULL. Nunca estimados.
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { APP_DIR } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'
import { leerPdf } from '../lib/ingesta/pdf.mjs'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'
import {
  clasificarAdjunto, clienteDelMail, extensionDe, extraerFecha, extraerImporte, extraerNumero,
  resolverObraDeTexto,
} from '../lib/ordenes-cliente.mjs'

// Igual que la sonda de proveedores: un worktree no tiene `.env.local` (no se versiona) y sin esto
// el script arranca con «supabaseUrl is required» sin decir por qué.
loadEnvLocalInto(process.env, process.env.ORDENES_ENV_FILE ?? path.join(APP_DIR, '.env.local'))

const BUCKET = 'obras-documentos'
const APLICAR = process.argv.includes('--aplicar')
const MAX_POR_CONSULTA = Number(process.env.ORDENES_MAX ?? 60)

// LAS CONSULTAS. Sin límite de fecha, como pidió el dueño. Se buscan por separado y se unen por
// id: una sola consulta con todos los OR se topa con el límite de Gmail y devuelve los más nuevos
// de todo junto, escondiendo lo viejo de un cliente callado.
const CONSULTAS = [
  'has:attachment ("orden de compra" OR "purchase order" OR "O/C")',
  'has:attachment ("orden de pago" OR "O/P" OR "notificación de pago")',
  'has:attachment (subject:OC OR subject:OP OR filename:OC OR filename:OP)',
  'has:attachment from:juanmessina.com.ar',
  'has:attachment (subject:"orden" OR subject:"pago" OR subject:"compra")',
]

/** Texto plano del PDF, o '' si no es PDF / no se pudo leer. NUNCA rasteriza: acá alcanza con la
 *  capa de texto (medido en este repo: el 100% de los PDF administrativos la tiene) y una corrida
 *  con OCR sobre toda la casilla costaría minutos para leer un número. */
async function textoDelPdf(bytes, mime, nombre) {
  const esPdf = /pdf/i.test(mime ?? '') || /\.pdf$/i.test(nombre ?? '')
  if (!esPdf) return ''
  try {
    const { leidas } = await leerPdf(bytes, { conGeometria: false, hasta: 3 })
    return leidas.map((p) => p.textos.map((t) => t.texto).join(' ')).join('\n')
  } catch {
    // Un PDF protegido o corrupto no puede tumbar la corrida: el documento se guarda igual y sus
    // campos quedan null, que es la verdad («no se pudo leer»), no un cero.
    return ''
  }
}

const fmt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').slice(0, n).padEnd(n)

async function main() {
  const email = await operadorEmail()
  if (!email) throw new Error('ninguna cuenta autorizó su Google (orq.google_tokens vacía)')
  const g = makeGoogleClient({ getToken: getTokenFor(email), soloUsuario: true })

  const { rows: clientes } = await query('select id, nombre_comercial from public.clientes')
  const { rows: obras } = await query('select id, nombre, cliente_id from public.obra_canonica where cliente_id is not null')
  const idPorNombre = new Map(clientes.map((c) => [String(c.nombre_comercial).toLowerCase(), c.id]))

  // ── 1. LOS MENSAJES, UNA VEZ CADA UNO ─────────────────────────────────────────────────────────
  const mensajes = new Map()
  for (const q of CONSULTAS) {
    for (const m of await g.gmailSearch(q, { max: MAX_POR_CONSULTA })) {
      if (!mensajes.has(m.id)) mensajes.set(m.id, m)
    }
  }

  const filas = []
  const descartes = []
  for (const m of mensajes.values()) {
    const adjuntos = await g.gmailAttachments(m.id)
    // Las partes `inline` son la firma con el logo, no un adjunto. Se descartan por tamaño y por
    // marca a la vez: un logo pesa poco y una orden de compra nunca pesa 4 kB.
    const reales = adjuntos.filter((a) => !(a.inline && (a.bytes ?? 0) < 40_000))
    if (!reales.length) continue

    const { text: cuerpo } = await g.gmailGet(m.id, { maxChars: 3000 })
    const cli = clienteDelMail({ from: m.from, asunto: m.subject, cuerpo })

    for (const a of reales) {
      let bytes = null; let textoPdf = ''
      // Los bytes se bajan SIEMPRE, también en dry: sin leer el PDF el ensayo no puede decir si es
      // una OC ni de qué obra, y entonces no sería un ensayo de nada. Bajar es leer, no escribir.
      try {
        bytes = await g.gmailAttachmentBytes(m.id, a.attachmentId)
        textoPdf = await textoDelPdf(bytes, a.mime, a.nombre)
      } catch (e) {
        descartes.push({ ...m, adjunto: a.nombre, motivo: `no se pudo bajar: ${e.message}` })
        continue
      }

      const { tipo } = clasificarAdjunto({ asunto: m.subject, nombreArchivo: a.nombre, cuerpo, textoPdf })
      if (tipo === 'otro') { descartes.push({ ...m, adjunto: a.nombre, motivo: 'no es orden de compra ni de pago' }); continue }
      if (!cli) { descartes.push({ ...m, adjunto: a.nombre, motivo: 'sin cliente identificable' }); continue }

      const clienteId = idPorNombre.get(cli.nombre.toLowerCase()) ?? null
      if (!clienteId) { descartes.push({ ...m, adjunto: a.nombre, motivo: `cliente «${cli.nombre}» no existe en public.clientes` }); continue }

      // La obra se busca SÓLO entre las del cliente resuelto, y sobre el asunto + el PDF. El cuerpo
      // de un reenvío arrastra la conversación entera y ahí aparece el nombre de cualquier obra.
      const obrasDelCliente = obras.filter((o) => o.cliente_id === clienteId)
      const obra = resolverObraDeTexto(obrasDelCliente, `${m.subject} ${textoPdf}`, { nombreCliente: cli.nombre })

      const { importe, moneda } = extraerImporte(textoPdf)
      filas.push({
        cliente_id: clienteId, cliente: cli.nombre, atribucion: cli.via,
        obra_id: obra?.id ?? null, obra: obra?.nombre ?? null,
        tipo,
        numero: extraerNumero(textoPdf), fecha: extraerFecha(textoPdf), importe, moneda,
        emisor: m.from, message_id: m.id, attachment_id: a.attachmentId,
        nombre_archivo: a.nombre, tamano_bytes: bytes.length, tipo_mime: a.mime || null,
        asunto: m.subject, recibido_en: new Date(m.date).toISOString(),
        bytes,
      })
    }
  }

  // ── 2. LA TABLA ───────────────────────────────────────────────────────────────────────────────
  console.log(`\nmensajes con adjunto revisados: ${mensajes.size} · candidatos: ${filas.length} · descartados: ${descartes.length}\n`)
  console.log(`${fmt('REMITENTE', 34)} ${fmt('ASUNTO', 40)} ${fmt('FECHA', 10)} ${fmt('ADJUNTO', 30)} ${fmt('TIPO', 13)} ${fmt('CLIENTE', 20)} OBRA`)
  for (const f of filas.sort((a, b) => (a.cliente + a.obra).localeCompare(b.cliente + b.obra))) {
    console.log(`${fmt(f.emisor, 34)} ${fmt(f.asunto, 40)} ${fmt(f.recibido_en.slice(0, 10), 10)} ${fmt(f.nombre_archivo, 30)} ${fmt(f.tipo, 13)} ${fmt(f.cliente, 20)} ${f.obra ?? '— (nivel cliente)'}`)
  }
  if (descartes.length) {
    console.log('\nDESCARTADOS (no se guardan):')
    for (const d of descartes) console.log(`  · ${fmt(d.from, 34)} ${fmt(d.adjunto, 28)} ${d.motivo}`)
  }

  if (!APLICAR) { console.log('\nENSAYO. Nada se subió ni se escribió. Con --aplicar.'); return }

  // ── 3. APLICAR ────────────────────────────────────────────────────────────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  let nuevas = 0; let repetidas = 0
  for (const f of filas) {
    const ruta = `${f.cliente_id}/${f.obra_id ?? 'sin-obra'}/${randomUUID()}.${extensionDe(f.nombre_archivo)}`
    // EL ORDEN ES OBJETO PRIMERO, FILA DESPUÉS, y no al revés: una fila que apunta a un objeto que
    // no llegó a subir es un documento roto en la pantalla. Un objeto sin fila es basura invisible
    // que no le miente a nadie.
    const sub = await sb.storage.from(BUCKET).upload(ruta, f.bytes, { contentType: f.tipo_mime || 'application/octet-stream', upsert: false })
    if (sub.error) { console.log(`  ✗ ${f.nombre_archivo}: no subió — ${sub.error.message}`); continue }

    const { bytes, cliente, obra, ...fila } = f
    const { error } = await sb.from('cliente_orden').insert({ ...fila, archivo_path: ruta, origen: 'gmail' })
    if (error) {
      // 23505 = la restricción de idempotencia hizo su trabajo: este documento ya estaba. Se borra
      // el objeto recién subido para no dejar un huérfano por cada corrida.
      if (error.code === '23505') { repetidas++; await sb.storage.from(BUCKET).remove([ruta]) }
      else console.log(`  ✗ ${f.nombre_archivo}: ${error.message}`)
      continue
    }
    nuevas++
  }
  console.log(`\nAPLICADO — nuevas: ${nuevas} · ya estaban: ${repetidas}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
