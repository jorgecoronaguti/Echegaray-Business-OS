#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS ÓRDENES DEL CLIENTE, DE LAS CASILLAS A LA FICHA
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
// ═══ DOS CASILLAS, NO UNA ═══
//
// Hasta el 10/09/2026 esto leía la cuenta de `ORQ_GOOGLE_IMPERSONATE` —jorge@ecsas.com.ar, que
// arranca en 07/2026— y ahí no está el histórico: las OC y OP de Messina, ARCOR, Saint-Gobain y
// Orica llegan a rodrigo@ecsas.com.ar, 8.186 mensajes desde 2021. Las dos autorizaron su Google
// (`orq.google_tokens`), así que se recorren las dos y la fila guarda de cuál vino.
//
// Leer dos casillas trae el problema que una sola no tenía: el MISMO adjunto entra dos veces
// —rodrigo lo recibe y lo reenvía a jorge— con dos `message_id`. La clave de idempotencia de la
// base no puede verlo. Por eso además se deduplica por SHA-256 de los bytes y por (cliente, tipo,
// número canónico); `deduplicar()` es puro y está probado en `lib/ordenes-atribucion.test.mjs`.
//
// ═══ QUÉ HACE CUANDO NO SABE ═══
//
// · No sabe de qué cliente es → NO guarda nada y lo lista como «sin cliente». Un documento
//   archivado contra el cliente equivocado es peor que uno que no se archivó.
// · Reconoce al cliente pero NO está en `public.clientes` (Saint-Gobain, Orica) → tampoco guarda, y
//   lo lista aparte con su nombre. Dar de alta un cliente es una decisión del dueño, no de un parser.
// · Sabe el cliente pero no la obra → lo guarda A NIVEL CLIENTE (`obra_id` null). La pantalla lo
//   muestra bajo el cliente y una persona lo asigna.
// · El PDF no dice el número, la fecha o el importe → esos campos quedan NULL. Nunca estimados.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { APP_DIR } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { getTokenFor, tieneToken } from '../lib/google-oauth.mjs'
import { leerPdf } from '../lib/ingesta/pdf.mjs'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'
import { clasificarAdjunto, extensionDe } from '../lib/ordenes-cliente.mjs'
import {
  consultasDeGmail, deduplicar, documentoDeAdjunto, fecharOrdenesDePagoPorSuRetencion,
  hashDocumento, heredarObras,
} from '../lib/ordenes-atribucion.mjs'

// Igual que la sonda de proveedores: un worktree no tiene `.env.local` (no se versiona) y sin esto
// el script arranca con «supabaseUrl is required» sin decir por qué.
loadEnvLocalInto(process.env, process.env.ORDENES_ENV_FILE ?? path.join(APP_DIR, '.env.local'))

const BUCKET = 'obras-documentos'
const APLICAR = process.argv.includes('--aplicar')

// LAS CASILLAS SE CONFIGURAN, Y EL DEFAULT SON LAS DOS QUE RECIBEN ÓRDENES. No sale de
// ORQ_GOOGLE_IMPERSONATE: esa variable dice con qué cuenta OPERA el OS, no dónde llegan las órdenes
// del cliente, y confundirlas fue exactamente lo que dejó afuera cinco años de correo.
const CASILLAS = String(process.env.ORQ_GMAIL_ORDENES_CASILLAS ?? 'jorge@ecsas.com.ar,rodrigo@ecsas.com.ar')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

// El tope por consulta existe para que una casilla de 8.186 mensajes no se recorra por accidente,
// pero AHORA es alto y, cuando corta, `gmailSearch` avisa y el aviso se imprime. Un recorte que
// nadie ve es peor que un error.
const MAX_POR_CONSULTA = Number(process.env.ORDENES_MAX ?? 2000)

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
const avisar = (m) => console.log(m)

// ── LA CUOTA DE GMAIL SE RESPETA POR LAS DOS PUNTAS: MÁS DESPACIO Y UNA SOLA VEZ ────────────────
//
// MEDIDO el 10/09/2026: Gmail corta con «Quota exceeded … Units per minute per user» a las ~77
// llamadas en 28 segundos sobre rodrigo@. El reintento con backoff ya evita que eso se lea como un
// error de permisos, pero esperar 89 segundos cada dos minutos convierte un recorrido de 1.300
// mensajes en algo que no termina. Las dos medidas que sí lo resuelven:
//
//   · una PAUSA entre llamadas, para no llegar al techo;
//   · una CACHÉ por mensaje, para no volver a bajar lo que ya se leyó. Guarda lo DERIVADO —texto
//     del PDF, hash, tamaño—, nunca los bytes: los bytes sólo hacen falta para subir al bucket, y
//     eso pasa una vez, con `--aplicar`, y sólo con los documentos nuevos.
//
// Vive fuera del repo y con permisos 0700: son precios y condiciones de compra de clientes reales.
const PAUSA_MS = Number(process.env.ORQ_GMAIL_PAUSA_MS ?? 300)
const pausa = () => new Promise((r) => setTimeout(r, PAUSA_MS))

const CACHE_DIR = process.env.ORQ_ORDENES_CACHE
  ?? path.join(os.homedir(), '.cache', 'echegaray-orq', 'ordenes-gmail')
const SIN_CACHE = process.argv.includes('--sin-cache')
const VERSION_CACHE = 1

const rutaCache = (casilla, id) => path.join(CACHE_DIR, casilla.replace(/[^a-z0-9@.-]/gi, '_'), `${id}.json`)

/** Lo leído de un mensaje, si ya se leyó con ESTA versión del formato. null si no. */
function leerCache(casilla, id) {
  if (SIN_CACHE) return null
  try {
    const j = JSON.parse(fs.readFileSync(rutaCache(casilla, id), 'utf8'))
    return j?.v === VERSION_CACHE ? j.leido : null
  } catch { return null }
}

/** Guarda lo leído. Un fallo de escritura NO puede tumbar la corrida: la caché es una optimización,
 *  no una fuente de verdad — sin ella el resultado es el mismo, sólo más lento. */
function escribirCache(casilla, id, leido) {
  if (SIN_CACHE) return
  try {
    const ruta = rutaCache(casilla, id)
    fs.mkdirSync(path.dirname(ruta), { recursive: true, mode: 0o700 })
    fs.writeFileSync(ruta, JSON.stringify({ v: VERSION_CACHE, leido }), { mode: 0o600 })
  } catch { /* la caché es opcional */ }
}

// LO QUE NO SE PUDO MIRAR SE DECLARA. Una consulta que falló y devolvió 0 se ve igual que una
// casilla sin órdenes, y ésa es la diferencia entre «no hay» y «no pude». Se junta acá y se imprime
// al final, al lado del resumen, para que nadie lea el conteo como si fuera completo.
const consultasRotas = []

/**
 * Los IDS de los mensajes con adjunto de UNA casilla, sin repetir, con el cliente que los lee.
 *
 * SÓLO IDS. Las nueve consultas se superponen —un mail de Messina cae en «from:», en «orden de
 * compra» y en «subject:OC»— y pedir los encabezados de cada mensaje EN CADA consulta eran ~2.000
 * llamadas para 1.300 mensajes, contra una cuota que Gmail mide por minuto. El remitente, el asunto
 * y la fecha llegan después con `gmailFull`, que hay que pedir igual para ver los adjuntos.
 */
async function mensajesDe(casilla) {
  if (!await tieneToken(casilla)) {
    avisar(`  ⚠ ${casilla}: no autorizó su Google (orq.google_tokens) — esa casilla NO se leyó`)
    return []
  }
  const g = makeGoogleClient({ getToken: getTokenFor(casilla), soloUsuario: true })
  const ids = new Set()
  for (const q of consultasDeGmail()) {
    let hallados = 0
    try {
      const r = await g.gmailSearch(q, {
        max: MAX_POR_CONSULTA,
        soloIds: true,
        onAviso: ({ traidos, tope }) => avisar(`  ⚠ ${casilla}: «${q}» se cortó en ${traidos} (tope ${tope}) y Gmail tenía más`),
      })
      hallados = r.length
      for (const m of r) ids.add(m.id)
    } catch (e) {
      consultasRotas.push({ casilla, q, motivo: String(e.message).replace(/\s+/g, ' ').slice(0, 120) })
      avisar(`  ✗ ${casilla}: «${q}» falló — ${String(e.message).replace(/\s+/g, ' ').slice(0, 120)}`)
    }
    avisar(`  · ${casilla} · ${fmt(q, 62)} ${String(hallados).padStart(5)}`)
  }
  avisar(`  = ${casilla}: ${ids.size} mensajes distintos`)
  return [...ids].map((id) => ({ id, casilla, cliente: g }))
}

async function main() {
  const { rows: clientes } = await query('select id, nombre_comercial, cuit from public.clientes')
  // UNA OBRA FUSIONADA YA NO EXISTE COMO DESTINO. `bsa-planta` se fusionó en `ME - BSA` y
  // `pisos-120m2` en `ME - PISOS 120 M² Y RAMPA` (decisión del dueño, 10/09/2026): siguen en la
  // tabla para que sus alias resuelvan, pero colgar una orden nueva de ellas la esconde de la obra
  // viva. Se buscan sólo las canónicas, y `aDondeFueron` traduce una obra vieja a su destino.
  const { rows: obras } = await query(
    'select id, nombre, cliente_id from public.obra_canonica where cliente_id is not null and fusionada_en is null')
  const { rows: fusionadas } = await query(
    'select id, fusionada_en from public.obra_canonica where fusionada_en is not null')
  const aDondeFue = new Map(fusionadas.map((f) => [f.id, f.fusionada_en]))
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre_comercial]))
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]))
  const sinCuit = clientes.filter((c) => !String(c.cuit ?? '').replace(/\D/g, ''))
  if (sinCuit.length) {
    avisar(`NOTA — sin CUIT en public.clientes (la vía más fuerte no se puede usar con ellos): ${sinCuit.map((c) => c.nombre_comercial).join(', ')}`)
  }

  // ── 1. LOS MENSAJES DE TODAS LAS CASILLAS ─────────────────────────────────────────────────────
  avisar(`\nCASILLAS: ${CASILLAS.join(' · ')}`)
  // Un id de mensaje es de SU casilla: el mismo mail en dos buzones tiene dos ids distintos, así
  // que no se pueden unir por id. El reenvío real lo deduplica el hash de los bytes, más abajo.
  const mensajes = []
  for (const casilla of CASILLAS) mensajes.push(...await mensajesDe(casilla))
  avisar(`\nmensajes con adjunto: ${mensajes.length}`)

  // ── 2. LOS ADJUNTOS, UNO POR UNO ──────────────────────────────────────────────────────────────
  const filas = []
  const descartes = []
  const sinAlta = []
  let leidos = 0; let deCache = 0
  for (const m of mensajes) {
    const g = m.cliente
    let leido = leerCache(m.casilla, m.id)
    if (leido) deCache++
    else {
      // UNA sola lectura del mensaje para el cuerpo Y los adjuntos: pedir `format=full` dos veces
      // seguidas del mismo mail duplicaba la cuota, y Gmail la corta con un 403 que parece un
      // problema de permisos.
      await pausa()
      let adjuntos = []; let cuerpo = ''; let enc = {}
      try {
        const full = await g.gmailFull(m.id, { maxChars: 3000 })
        adjuntos = full.adjuntos; cuerpo = full.text
        enc = { from: full.from, subject: full.subject, date: full.date }
      } catch (e) { descartes.push({ ...m, adjunto: '(mensaje)', motivo: `no se pudo leer el mensaje: ${e.message}` }); continue }
      // Las partes `inline` son la firma con el logo, no un adjunto. Se descartan por tamaño y por
      // marca a la vez: un logo pesa poco y una orden de compra nunca pesa 4 kB.
      const reales = adjuntos.filter((a) => !(a.inline && (a.bytes ?? 0) < 40_000))
      leido = { ...enc, cuerpo, adjuntos: [] }
      for (const a of reales) {
        // NO SE BAJA LO QUE NO PUEDE SER UNA ORDEN. Un PDF hay que abrirlo —el nombre puede ser
        // neutro y la orden estar adentro—, pero una imagen o una planilla que además no clasifica
        // por nombre ni por asunto no justifica traer megas de una casilla de cinco años.
        const esPdf = /pdf/i.test(a.mime ?? '') || /\.pdf$/i.test(a.nombre ?? '')
        const previo = clasificarAdjunto({ asunto: m.subject, nombreArchivo: a.nombre, cuerpo })
        if (!esPdf && previo.tipo === 'otro') {
          leido.adjuntos.push({ ...a, saltado: `no es PDF y no clasifica por nombre/asunto (${a.mime || '?'})` })
          continue
        }
        await pausa()
        try {
          const bytes = await g.gmailAttachmentBytes(m.id, a.attachmentId)
          leido.adjuntos.push({ ...a, tamano: bytes.length, sha256: hashDocumento(bytes), textoPdf: await textoDelPdf(bytes, a.mime, a.nombre) })
        } catch (e) {
          leido.adjuntos.push({ ...a, saltado: `no se pudo bajar: ${e.message}` })
        }
      }
      escribirCache(m.casilla, m.id, leido)
    }

    // Los encabezados salen del mensaje leído (o de la caché), no de la búsqueda: la búsqueda ya no
    // los trae, y traerlos costaba una llamada por mensaje y por consulta.
    Object.assign(m, { from: leido.from ?? '', subject: leido.subject ?? '', date: leido.date ?? '' })

    for (const a of leido.adjuntos) {
      if (a.saltado) { descartes.push({ ...m, adjunto: a.nombre, motivo: a.saltado }); continue }
      leidos++
      if (leidos % 100 === 0) avisar(`  … ${leidos} adjuntos leídos (${deCache} mensajes desde la caché)`)

      const d = documentoDeAdjunto({
        from: m.from, asunto: m.subject, cuerpo: leido.cuerpo, nombreArchivo: a.nombre, textoPdf: a.textoPdf, clientes, obras,
      })
      if (!d.ok) {
        const destino = d.cliente ? sinAlta : descartes
        destino.push({ ...m, adjunto: a.nombre, motivo: d.motivo, clienteReconocido: d.cliente?.nombre ?? null })
        continue
      }

      filas.push({
        cliente_id: d.cliente.id, cliente: d.cliente.nombre, atribucion: d.cliente.via,
        obra_id: d.obra?.id ?? null,
        tipo: d.tipo, cita: d.cita, numero: d.numero, numero_canonico: d.numeroCanonico,
        fecha: d.fecha, importe: d.importe, moneda: d.moneda,
        emisor: m.from, message_id: m.id, attachment_id: a.attachmentId, casilla: m.casilla,
        nombre_archivo: a.nombre, tamano_bytes: a.tamano, tipo_mime: a.mime || null,
        hash_sha256: a.sha256,
        // Un `Date` inválido no puede tirar la corrida ni inventar «hoy»: si el mail no trae fecha
        // legible, la fila no la afirma.
        asunto: m.subject, recibido_en: Number.isFinite(Date.parse(m.date)) ? new Date(m.date).toISOString() : null,
        // Sólo para la herencia y la tabla; no van a la fila.
        cliente_google: g, texto: a.textoPdf, citadas: d.citadas, comprobante: d.comprobante,
        opCitada: d.opCitada, porque: d.obra ? 'el PDF nombra la obra' : null,
      })
    }
  }

  // LA FECHA QUE UN PAPEL PERDIÓ Y OTRO CONSERVA. Va antes de la herencia y de la tabla: una orden
  // de pago sin fecha no se puede ordenar ni cruzar con la cobranza.
  const { rellenadas } = fecharOrdenesDePagoPorSuRetencion(filas)
  if (rellenadas) avisar(`\nórdenes de pago fechadas desde su certificado de retención: ${rellenadas}`)

  // ── 3. LO QUE YA ESTÁ, Y LA HERENCIA DE OBRA ──────────────────────────────────────────────────
  // EL ENSAYO CORRE AUNQUE LA MIGRACIÓN NO ESTÉ APLICADA, Y LO DICE.
  //
  // `hash_sha256`, `numero_canonico` y `casilla` los crea `20260910T2010`, que se aplica desde la
  // sesión principal y no desde acá. Pedirlas a ciegas tumbaba la corrida entera con «column
  // numero_canonico does not exist» DESPUÉS de bajar 1.350 adjuntos — cuarenta minutos de lectura
  // tirados por una columna. Se mira qué existe y se pregunta sólo por eso.
  const { rows: cols } = await query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'cliente_orden'`)
  const hay = new Set(cols.map((c) => c.column_name))
  const NUEVAS = ['hash_sha256', 'numero_canonico', 'casilla']
  const faltan = NUEVAS.filter((c) => !hay.has(c))
  if (faltan.length) {
    avisar(`\n⚠ LA MIGRACIÓN NO ESTÁ APLICADA — faltan ${faltan.join(', ')} en public.cliente_orden.`)
    avisar('  supabase/migrations/20260910T2010_la_retencion_no_es_una_orden_y_el_reenvio_no_es_otra.sql')
    avisar('  El ensayo sigue: lo único que pierde es poder comparar el hash contra lo ya guardado.')
  }
  const columnas = ['id', 'cliente_id', 'obra_id', 'tipo', 'numero', 'nombre_archivo', 'cita',
    'message_id', 'tamano_bytes',
    ...NUEVAS.filter((c) => hay.has(c))]
  const { rows: yaEnBase } = await query(
    `select ${columnas.join(', ')} from public.cliente_orden where eliminado_en is null`)
  const { nuevos, repetidos } = deduplicar(filas, { yaEnBase })

  // La herencia mira las filas nuevas Y las que ya están: la OC que le da la obra a una orden de
  // pago puede haberse bajado la semana pasada. `heredarObras` es la MISMA función que usa
  // `reatribuir-ordenes-clientes.mjs` — una definición de «esta OP es de esta obra».
  // Las filas ya guardadas entran SIN releer su PDF (eso es trabajo de `reatribuir`), pero sí con
  // su comprobante: el número de una factura ES su comprobante («A-1-225»), y es la clave con la que
  // una orden de pago recién bajada encuentra la obra de la factura que paga.
  const previas = yaEnBase.map((r) => ({
    ...r, citadas: [], texto: '', comprobante: r.tipo === 'factura' ? r.numero : null,
    // Una fila vieja que apunta a una obra fusionada aporta el DESTINO, no el nombre retirado: si
    // no, la orden nueva heredaría `bsa-planta` y quedaría colgada de una obra que ya no se usa.
    obra_id: aDondeFue.get(r.obra_id) ?? r.obra_id,
  }))
  heredarObras([...previas, ...nuevos], { obras, nombreClientePorId: nombreCliente })

  // ── 4. LA TABLA ───────────────────────────────────────────────────────────────────────────────
  console.log(`\nadjuntos leídos: ${leidos} · candidatos: ${filas.length} · nuevos: ${nuevos.length} · ya estaban: ${repetidos.length} · descartados: ${descartes.length} · sin alta: ${sinAlta.length}\n`)
  console.log(`${fmt('CASILLA', 8)} ${fmt('REMITENTE', 30)} ${fmt('FECHA', 10)} ${fmt('ADJUNTO', 32)} ${fmt('TIPO', 13)} ${fmt('NÚMERO', 16)} ${fmt('VÍA', 9)} ${fmt('CLIENTE', 16)} OBRA`)
  for (const f of nuevos.sort((a, b) => String(a.cliente + a.fecha).localeCompare(String(b.cliente + b.fecha)))) {
    console.log(`${fmt(f.casilla.split('@')[0], 8)} ${fmt(f.emisor, 30)} ${fmt(f.fecha ?? f.recibido_en?.slice(0, 10) ?? '—', 10)} ${fmt(f.nombre_archivo, 32)} ${fmt(f.tipo, 13)} ${fmt(f.numero, 16)} ${fmt(f.atribucion, 9)} ${fmt(f.cliente, 16)} ${nombreObra.get(f.obra_id) ?? '— (nivel cliente)'}`)
  }

  // ── 5. LOS RESÚMENES QUE CONTESTAN LA PREGUNTA DEL DUEÑO ──────────────────────────────────────
  const cuenta = (llave) => {
    const m = new Map()
    for (const f of nuevos) { const k = llave(f); m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  }
  console.log('\nPOR CLIENTE / TIPO / AÑO:')
  for (const [k, n] of cuenta((f) => `${f.cliente} · ${f.tipo} · ${(f.fecha ?? f.recibido_en ?? 'sin fecha').slice(0, 4)}`)) console.log(`  ${fmt(k, 60)} ${String(n).padStart(4)}`)
  console.log('\nPOR CASILLA:')
  for (const [k, n] of cuenta((f) => f.casilla)) console.log(`  ${fmt(k, 30)} ${String(n).padStart(4)}`)
  console.log('\nPOR VÍA DE ATRIBUCIÓN:')
  for (const [k, n] of cuenta((f) => f.atribucion)) console.log(`  ${fmt(k, 30)} ${String(n).padStart(4)}`)

  if (consultasRotas.length) {
    console.log(`\n⚠ ESTE CONTEO ESTÁ INCOMPLETO: ${consultasRotas.length} consultas fallaron y devolvieron 0 sin haber podido mirar.`)
    for (const r of consultasRotas) console.log(`  · ${fmt(r.casilla, 22)} ${fmt(r.q, 62)} ${r.motivo}`)
  }
  if (sinAlta.length) {
    console.log('\nRECONOCIDOS PERO SIN ALTA EN public.clientes (no se guardan; darlos de alta es del dueño):')
    const porCliente = new Map()
    for (const s of sinAlta) porCliente.set(s.clienteReconocido, (porCliente.get(s.clienteReconocido) ?? 0) + 1)
    for (const [c, n] of porCliente) console.log(`  ${fmt(c, 30)} ${String(n).padStart(4)} documentos`)
  }
  if (repetidos.length) {
    console.log('\nYA ESTABAN (no se vuelven a guardar):')
    for (const r of repetidos.slice(0, 40)) console.log(`  · ${fmt(r.fila.nombre_archivo, 34)} ${r.porque}`)
    if (repetidos.length > 40) console.log(`  … y ${repetidos.length - 40} más`)
  }
  if (descartes.length) {
    console.log('\nDESCARTADOS (no se guardan):')
    const porMotivo = new Map()
    for (const d of descartes) {
      const k = d.motivo.replace(/[«»].*?[«»]/g, '…').slice(0, 70)
      porMotivo.set(k, [...(porMotivo.get(k) ?? []), d])
    }
    for (const [motivo, ds] of [...porMotivo.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(ds.length).padStart(5)} × ${motivo}`)
      for (const d of ds.slice(0, 3)) console.log(`          ej: ${fmt(d.from, 32)} ${fmt(d.adjunto, 34)} ${fmt(d.subject, 40)}`)
    }
  }

  if (!APLICAR) { console.log('\nENSAYO. Nada se subió ni se escribió. Con --aplicar.'); return }

  // APLICAR SIN LA MIGRACIÓN NO ES «APLICAR A MEDIAS»: es escribir filas sin las tres columnas que
  // impiden el duplicado. Se corta antes de tocar el bucket.
  if (faltan.length) {
    throw new Error(`falta aplicar supabase/migrations/20260910T2010_...sql (sin ${faltan.join(', ')} `
      + 'la base no puede impedir que la misma orden entre dos veces)')
  }

  // ── 6. APLICAR ────────────────────────────────────────────────────────────────────────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  let escritas = 0; let rechazadas = 0
  for (const f of nuevos) {
    // LOS BYTES SE BAJAN ACÁ Y NO ANTES. El ensayo necesita el TEXTO del PDF (para clasificar), y
    // eso la caché lo guarda; los bytes sólo hacen falta para subir al bucket, que pasa una vez y
    // sólo con lo nuevo. Bajarlos en cada ensayo era traer gigas de una casilla de cinco años.
    //
    // OJO: Gmail REGENERA el `attachmentId` entre lecturas, así que el de la caché puede estar
    // vencido. Si falla, se relee el mensaje para conseguir el id de hoy — y si el hash no coincide
    // con el que se clasificó, NO se guarda: sería subir un archivo distinto del que se leyó.
    let bytes = null
    try { bytes = await f.cliente_google.gmailAttachmentBytes(f.message_id, f.attachment_id) }
    catch {
      try {
        const { adjuntos } = await f.cliente_google.gmailFull(f.message_id, { maxChars: 1 })
        const otra = adjuntos.find((a) => a.nombre === f.nombre_archivo)
        if (otra) bytes = await f.cliente_google.gmailAttachmentBytes(f.message_id, otra.attachmentId)
      } catch { /* se informa abajo */ }
    }
    if (!bytes) { console.log(`  ✗ ${f.nombre_archivo}: no se pudieron bajar los bytes`); continue }
    if (hashDocumento(bytes) !== f.hash_sha256) {
      console.log(`  ✗ ${f.nombre_archivo}: los bytes de hoy no son los que se leyeron (hash distinto) — no se guarda`)
      continue
    }
    const ruta = `${f.cliente_id}/${f.obra_id ?? 'sin-obra'}/${randomUUID()}.${extensionDe(f.nombre_archivo)}`
    // EL ORDEN ES OBJETO PRIMERO, FILA DESPUÉS, y no al revés: una fila que apunta a un objeto que
    // no llegó a subir es un documento roto en la pantalla. Un objeto sin fila es basura invisible
    // que no le miente a nadie.
    const sub = await sb.storage.from(BUCKET).upload(ruta, bytes, { contentType: f.tipo_mime || 'application/octet-stream', upsert: false })
    if (sub.error) { console.log(`  ✗ ${f.nombre_archivo}: no subió — ${sub.error.message}`); continue }

    // Se sacan las claves que son de la CORRIDA y no de la fila: el cliente de Google, el texto y
    // el andamiaje de la herencia. `porqueFecha` tampoco va: la fila guarda la fecha, no el relato.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { cliente, cliente_google: _g, texto, citadas, comprobante, opCitada, porque, porqueFecha, ...fila } = f
    const { error } = await sb.from('cliente_orden').insert({ ...fila, archivo_path: ruta, origen: 'gmail' })
    if (error) {
      // 23505 = una restricción de idempotencia hizo su trabajo: este documento ya estaba. Se borra
      // el objeto recién subido para no dejar un huérfano por cada corrida.
      if (error.code === '23505') { rechazadas++; await sb.storage.from(BUCKET).remove([ruta]) }
      else console.log(`  ✗ ${f.nombre_archivo}: ${error.message}`)
      continue
    }
    escritas++
  }
  console.log(`\nAPLICADO — nuevas: ${escritas} · rechazadas por la base: ${rechazadas}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
