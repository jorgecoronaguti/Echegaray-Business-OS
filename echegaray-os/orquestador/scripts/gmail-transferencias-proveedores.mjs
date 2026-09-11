#!/usr/bin/env node
// LOS COMPROBANTES DE TRANSFERENCIA DEL MAIL, EN LA FICHA DE CADA PROVEEDOR
//
//   node orquestador/scripts/gmail-transferencias-proveedores.mjs            # ensayo (no escribe)
//   node orquestador/scripts/gmail-transferencias-proveedores.mjs --aplicar  # sube y registra
//
// Pedido del dueño, 09/09/2026, textual: «quiero que ingreses a mi mail de ecsas y descargues todos
// los comprobantes de transferencias y los coloques en las carpetas correspondientes de cada
// proveedor».
//
// ═══ QUÉ HACE Y QUÉ NO ═══
//
// LEE el buzón (scope readonly del OAuth del dueño): nunca manda, nunca borra, nunca etiqueta.
// Baja los adjuntos PDF, decide cuáles son comprobantes de transferencia ORDENADA POR ECSAS
// —`orquestador/lib/transferencias-proveedores.mjs`, puro y con tests—, resuelve el proveedor por
// CUIT, sube el archivo al bucket privado `proveedores-documentos` y crea la fila de
// `public.proveedor_documento` con categoría `transferencia` y `origen = 'gmail'`.
//
// NO TOCA EL SHEET. No llama a ningún modelo: la lectura del PDF es local (pdfjs).
//
// ═══ LO QUE NO SE PUEDE ATRIBUIR NO SE ADIVINA ═══
//
// `proveedor_documento.proveedor_id` es NOT NULL a propósito (un papel sin ficha no es un papel de
// nadie: es un papel perdido), así que un comprobante cuyo CUIT no está en el padrón NO puede
// tener fila. Sus bytes se guardan igual en la carpeta `sin-proveedor/` del bucket —perderlos sería
// peor— y salen listados al final para que alguien cargue el CUIT que falta y vuelva a correr.
// Colgarlo del proveedor de nombre más parecido está prohibido.
//
// ═══ IDEMPOTENTE POR (message_id, attachment_id) ═══
//
// Es la llave única de la base, no una comparación del script. Correr esto diez veces deja el mismo
// resultado que correrlo una.
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { APP_DIR } from '../lib/config.mjs'
import { getPool } from '../lib/db.mjs'
import { accessTokenFor } from '../lib/google-oauth.mjs'
import { leerPdf } from '../lib/ingesta/pdf.mjs'
import { clasificarTexto, normalizarCuit, resolverProveedor, rutaObjeto } from '../lib/transferencias-proveedores.mjs'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'

// Un WORKTREE no tiene `.env.local` (no se versiona) y `APP_DIR` apunta al checkout donde corre el
// archivo. Sin esto el script arranca con «supabaseUrl is required» sin decir por qué. Mismo
// remedio que la sonda de documentos de proveedor (`TRANSF_ENV_FILE`, propio: `ORQ_ENV_FILE` ya es
// el slot del worker.env de systemd, donde vive DATABASE_URL, y pisarlo deja el script sin base).
loadEnvLocalInto(process.env, process.env.TRANSF_ENV_FILE ?? path.join(APP_DIR, '.env.local'))

const APLICAR = process.argv.includes('--aplicar')
// Un control que no puede explicar qué RECHAZÓ no es un control: con `--descartes` la corrida
// imprime los 150+ adjuntos que descartó y por qué, y así se puede auditar que no dejó afuera un
// comprobante real.
const VER_DESCARTES = process.argv.includes('--descartes')
const CUENTA = process.env.ORQ_GMAIL_CUENTA ?? 'jorge@ecsas.com.ar'
const BUCKET = 'proveedores-documentos'
const TOPE_BYTES = 20 * 1024 * 1024
// El buzón entero se recorre por adjunto: el nombre del archivo no dice si es un comprobante, así
// que el filtro es el CUERPO. `has:attachment` es el superset honesto; la segunda consulta trae los
// mails que traen el comprobante en el cuerpo y no como archivo.
const CONSULTA_ADJUNTOS = 'has:attachment'
const CONSULTA_CUERPO = '-has:attachment (transferencia OR comprobante OR "comprobante de pago")'

// EL TOKEN SE RENUEVA SOLO. Un access token de Google vive una hora y la casilla de Rodrigo tiene
// más de una hora de lectura: el 11/09/2026 la corrida murió con `Gmail 401` a los 70 minutos, con
// todo lo descargado y nada escrito. Ante un 401 se pide un token nuevo con el refresh_token y se
// reintenta UNA vez; si el segundo también es 401, el refresh_token está revocado y ahí sí se corta.
let token = await accessTokenFor(CUENTA)
const api = async (url, intento = 0, renovado = false) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (r.status === 401 && !renovado) {
    token = await accessTokenFor(CUENTA)
    if (!token) throw new Error(`Gmail 401 y no pude renovar el token de ${CUENTA}: hay que volver a autorizar la casilla`)
    return api(url, intento, true)
  }
  // Gmail contesta 429/403 por ritmo, no por permiso, cuando se le piden cientos de adjuntos
  // seguidos. Reintentar con espera es la diferencia entre «no había comprobantes» y «me cortaron».
  if ((r.status === 429 || r.status === 403 || r.status >= 500) && intento < 4) {
    await new Promise((s) => setTimeout(s, [800, 2000, 5000, 12000][intento]))
    return api(url, intento + 1, renovado)
  }
  if (!r.ok) throw new Error(`Gmail ${r.status} en ${url.slice(0, 90)}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}
const G = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'

async function buscar(q) {
  const ids = []
  let pageToken = ''
  do {
    const j = await api(`${G}?q=${encodeURIComponent(q)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`)
    ids.push(...(j.messages || []).map((m) => m.id))
    pageToken = j.nextPageToken || ''
  } while (pageToken)
  return ids
}

const cabeceras = (msg) => Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]))
const b64 = (d) => Buffer.from(String(d).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

function partes(payload) {
  const adj = []
  const cuerpos = []
  const walk = (p) => {
    if (!p) return
    if (p.body?.attachmentId && p.filename) adj.push({ id: p.body.attachmentId, nombre: p.filename, mime: p.mimeType || '', bytes: p.body.size ?? 0 })
    else if (p.body?.data && /^text\/(plain|html)/.test(p.mimeType || '')) cuerpos.push({ mime: p.mimeType, texto: b64(p.body.data).toString('utf8') })
    for (const c of p.parts || []) walk(c)
  }
  walk(payload)
  return { adj, cuerpos }
}

/** El texto de un PDF, en el orden en que pdfjs lo emite. Alcanza: el comprobante del banco es una
 *  sola columna. Si el PDF está escaneado no hay texto y el clasificador lo dice — no se le inventa
 *  OCR (medido: el 100% de los comprobantes reales del buzón trae capa de texto). */
async function textoPdf(bytes) {
  try {
    const r = await leerPdf(bytes, { conGeometria: false, hasta: 2 })
    return r.leidas.map((p) => p.textos.map((t) => t.texto).join(' ')).join('\n')
  } catch (e) {
    return `((no se pudo abrir el PDF: ${e.message}))`
  }
}

const htmlATexto = (h) => String(h).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

// ── EL PADRÓN Y LOS PAGOS CONOCIDOS ────────────────────────────────────────────────────────────
const pool = getPool()
const padron = (await pool.query('select id, cuit, nombre from public.proveedores where cuit is not null and coalesce(es_prueba, false) = false'))
  .rows.map((r) => ({ id: r.id, cuit: normalizarCuit(r.cuit), nombre: r.nombre })).filter((p) => p.cuit)
const nombrePorId = new Map(padron.map((p) => [p.id, p.nombre]))
// El cruce de último recurso: un pago por banco ya registrado con importe y fecha exactos. Sólo
// resuelve si hay UN candidato (lo impone `resolverProveedor`, que está probado).
const pagos = (await pool.query(`
  select p.id as "proveedorId", cs.monto_pagado as importe,
         to_char(coalesce(cs.fecha_caja, cs.fecha), 'YYYY-MM-DD') as fecha
    from public.compra_sheet cs
    join public.proveedores p on regexp_replace(coalesce(cs.cuit, ''), '\\D', '', 'g') = p.cuit
   where cs.monto_pagado is not null and coalesce(cs.fecha_caja, cs.fecha) is not null`)).rows

const uid = (await pool.query('select id from auth.users where email = $1', [CUENTA])).rows[0]?.id
if (!uid) { console.error(`No encontré el usuario ${CUENTA} en auth.users: sin él la fila no tiene quién la subió.`); process.exit(1) }

const yaEstan = new Set((await pool.query(
  "select gmail_message_id || '|' || gmail_attachment_id as k from public.proveedor_documento where origen = 'gmail'",
)).rows.map((r) => r.k))
// EL NÚMERO IDENTIFICA EL COMPROBANTE, Y EL MISMO PDF LLEGA MÁS DE UNA VEZ. Medido en el buzón
// real: `Comprobante_16625885.pdf` aparece en DOS mails (el enviado y su copia en el hilo), con
// message_id distinto. La llave (mail, adjunto) no los ve iguales; el número del comprobante sí.
// Sin esto, la misma transferencia quedaría dos veces en la ficha del proveedor.
const yaPorNumero = new Set((await pool.query(
  `select proveedor_id || '|' || comprobante_numero as k from public.proveedor_documento
    where categoria = 'transferencia' and comprobante_numero is not null`,
)).rows.map((r) => r.k))

// ── RECORRIDA ──────────────────────────────────────────────────────────────────────────────────
const ids = [...new Set([...(await buscar(CONSULTA_ADJUNTOS)), ...(await buscar(CONSULTA_CUERPO))])]
const filas = []
const descartes = []
let mailsLeidos = 0
let adjuntosVistos = 0

for (const id of ids) {
  const msg = await api(`${G}/${id}?format=full`)
  mailsLeidos++
  const h = cabeceras(msg)
  const meta = { fecha: (h.date || '').slice(0, 22), de: (h.from || '').replace(/.*</, '').replace('>', ''), asunto: (h.subject || '(sin asunto)').slice(0, 60) }
  const { adj, cuerpos } = partes(msg.payload)
  let algunoEnEsteMail = false

  for (const a of adj) {
    adjuntosVistos++
    const esPdf = /pdf/i.test(a.mime) || /\.pdf$/i.test(a.nombre)
    if (!esPdf) continue
    if (a.bytes > TOPE_BYTES) { descartes.push({ ...meta, adjunto: a.nombre, motivo: `pesa ${(a.bytes / 1e6).toFixed(1)} MB` }); continue }
    const at = await api(`${G}/${id}/attachments/${a.id}`)
    const bytes = b64(at.data)
    const cls = clasificarTexto(await textoPdf(bytes))
    if (!cls.es) { descartes.push({ ...meta, adjunto: a.nombre, motivo: cls.motivo }); continue }
    algunoEnEsteMail = true
    const res = resolverProveedor(cls.datos, { padron, pagos })
    filas.push({ ...meta, adjunto: a.nombre, mime: 'application/pdf', bytes, datos: cls.datos, res, messageId: id, attachmentId: a.id, ext: 'pdf' })
  }

  // EL COMPROBANTE EN EL CUERPO. Se guarda como `.html` y se declara: este repo no rasteriza HTML a
  // PDF en ningún lado (se buscó), y meter un chromium para esto sería una dependencia nueva por un
  // caso que en el buzón real no apareció ni una vez. Si algún día aparece, el archivo está.
  if (!algunoEnEsteMail && cuerpos.length) {
    const texto = cuerpos.map((c) => (c.mime === 'text/html' ? htmlATexto(c.texto) : c.texto)).join('\n')
    const cls = clasificarTexto(texto)
    if (cls.es) {
      const cuerpo = cuerpos.find((c) => c.mime === 'text/html') ?? cuerpos[0]
      const res = resolverProveedor(cls.datos, { padron, pagos })
      filas.push({
        ...meta, adjunto: '(cuerpo del mail)', mime: cuerpo.mime === 'text/html' ? 'text/html' : 'text/plain',
        bytes: Buffer.from(cuerpo.texto, 'utf8'), datos: cls.datos, res, messageId: id,
        attachmentId: 'cuerpo', ext: cuerpo.mime === 'text/html' ? 'html' : 'txt',
      })
    }
  }
}

// ── LA TABLA DEL ENSAYO ────────────────────────────────────────────────────────────────────────
const $ = (n) => (n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 2 }))
console.log(`\nBuzón ${CUENTA}: ${ids.length} mails candidatos, ${mailsLeidos} leídos, ${adjuntosVistos} adjuntos.`)
console.log(`Comprobantes de transferencia detectados: ${filas.length}\n`)
console.log(['FECHA', 'DE', 'ASUNTO', 'ADJUNTO', 'CUIT / NOMBRE DETECTADO', 'PROVEEDOR RESUELTO', 'IMPORTE'].join(' · '))
for (const f of filas) {
  console.log([
    f.datos.fecha ?? f.fecha.slice(0, 16), f.de.slice(0, 24), f.asunto.slice(0, 34), f.adjunto.slice(0, 34),
    `${f.datos.cuitDestino ?? 'sin CUIT'} ${f.datos.nombreDestino ?? ''}`.slice(0, 40),
    f.res.proveedorId ? nombrePorId.get(f.res.proveedorId) ?? f.res.proveedorId : `SIN PROVEEDOR (${f.res.motivo})`,
    `$ ${$(f.datos.importe)}`,
  ].join(' · '))
}

if (VER_DESCARTES) {
  console.log('\nDESCARTADOS (adjunto · por qué):')
  for (const d of descartes) console.log(`  ${d.adjunto.slice(0, 46).padEnd(46)} · ${d.motivo}`)
}

if (!APLICAR) {
  const sin = filas.filter((f) => !f.res.proveedorId).length
  console.log(`\nENSAYO. No se escribió nada. ${filas.length - sin} con proveedor, ${sin} sin atribuir.`)
  console.log(`Descartados: ${descartes.length} adjuntos que no son comprobante de transferencia.`)
  console.log('Para escribir: --aplicar')
  await pool.end()
  process.exit(0)
}

// ── ESCRITURA ──────────────────────────────────────────────────────────────────────────────────
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!URL_SB || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (desde un worktree: TRANSF_ENV_FILE=<.env.local del checkout principal>).')
  process.exit(1)
}
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let subidos = 0
let repetidos = 0
let sinProveedor = 0
const problemas = []
for (const f of filas) {
  const clave = `${f.messageId}|${f.attachmentId}`
  if (yaEstan.has(clave)) { repetidos++; continue }
  const porNumero = `${f.res.proveedorId}|${f.datos.numero}`
  if (f.res.proveedorId && f.datos.numero && yaPorNumero.has(porNumero)) { repetidos++; continue }
  yaPorNumero.add(porNumero)
  // El identificador estable es el NÚMERO del comprobante, no el `attachmentId` (Gmail lo cambia
  // entre lecturas: se midió, y dejó 8 objetos para 4 comprobantes).
  const ruta = rutaObjeto({ uid, proveedorId: f.res.proveedorId, messageId: f.messageId, identificador: f.datos.numero, extension: f.ext })
  const up = await admin.storage.from(BUCKET).upload(ruta, f.bytes, { contentType: f.mime, upsert: true })
  if (up.error) { problemas.push(`${f.adjunto}: subida ${up.error.message}`); continue }
  if (!f.res.proveedorId) { sinProveedor++; continue } // el objeto queda en sin-proveedor/, sin fila
  const ins = await pool.query(
    `insert into public.proveedor_documento
       (proveedor_id, storage_path, nombre_archivo, tipo_mime, tamano_bytes, categoria, descripcion,
        subido_por, origen, gmail_message_id, gmail_attachment_id,
        comprobante_numero, comprobante_fecha, comprobante_importe)
     values ($1,$2,$3,$4,$5,'transferencia',$6,$7,'gmail',$8,$9,$10,$11,$12)
     on conflict do nothing returning id`,
    [f.res.proveedorId, ruta, f.adjunto === '(cuerpo del mail)' ? `mail-${f.messageId}.${f.ext}` : f.adjunto,
      f.mime, f.bytes.length, `Transferencia ${f.datos.numero ?? ''} — ${f.datos.nombreDestino ?? ''} (del mail «${f.asunto}»)`.slice(0, 400),
      uid, f.messageId, f.attachmentId, f.datos.numero, f.datos.fecha, f.datos.importe],
  )
  if (ins.rowCount) subidos++
  else repetidos++
}

console.log(`\nAPLICADO: ${subidos} comprobantes nuevos en fichas, ${repetidos} ya estaban, ${sinProveedor} en sin-proveedor/ (sin fila).`)
for (const p of problemas) console.log('  ⚠ ' + p)

const porProveedor = await pool.query(`
  select p.nombre, count(*) n, min(d.comprobante_fecha) desde, max(d.comprobante_fecha) hasta,
         sum(d.comprobante_importe) total
    from public.proveedor_documento d join public.proveedores p on p.id = d.proveedor_id
   where d.categoria = 'transferencia' and d.eliminado_en is null
   group by p.nombre order by n desc, p.nombre`)
console.log('\nEN LA BASE (categoría transferencia, vigentes):')
for (const r of porProveedor.rows) console.log(`  ${String(r.n).padStart(3)} · ${r.nombre} · ${r.desde ?? '—'}…${r.hasta ?? '—'} · $ ${$(Number(r.total))}`)
await pool.end()
