#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ESPEJO DE LOS PAPELES DEL CLIENTE — Drive ➜ Supabase Storage
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ POR QUÉ EXISTE (26/08/2026) ═══
//
// `/portal/documentos` leía Drive EN VIVO. La credencial de la cuenta de servicio es un archivo en
// el disco de esta VM, y el portal corre en Vercel, donde NO HAY DISCO: los cinco clientes veían
// «No pudimos leer la carpeta ahora» y cero enlaces de descarga. Verificado en producción.
//
// Este script corre DONDE LA CREDENCIAL EXISTE. Baja los papeles, los deja en un bucket privado y
// escribe la fila. El portal deja de necesitar Google para mostrar y para descargar — y de paso deja
// de depender de que Drive conteste en cada carga.
//
// ═══ LO QUE ESTE SCRIPT NO HACE ═══
//
// No escribe una sola celda en Google Sheets. No borra nada de Drive. No borra filas: una corrida
// que no encuentra la carpeta deja constancia del error y NO vacía lo que ya estaba publicado —
// borrar los papeles del cliente porque Drive no contestó es exactamente la falla que ya costó una
// pestaña entera en este repo.
//
//   node orquestador/scripts/documentos-espejo.mjs              # informa, no escribe
//   node orquestador/scripts/documentos-espejo.mjs --aplicar    # baja, sube y escribe
//   node orquestador/scripts/documentos-espejo.mjs --cliente quattropani

import { createClient } from '@supabase/supabase-js'
import { query } from '../lib/db.mjs'
import { loadConfig } from '../lib/config.mjs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { veredicto, esCarpetaDelCliente, rutaEnBucket } from '../../src/app/portal/papeles.ts'

const BUCKET = 'documentos-cliente'
const CAMPOS = 'id,name,mimeType,modifiedTime,size'

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const filtroCliente = args.includes('--cliente') ? (args[args.indexOf('--cliente') + 1] || null) : null

function almacen() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  // Falla cerrado y nombra lo que falta: sin clave no se sube nada, y un espejo a medias que no
  // avisa es peor que no correr.
  if (!url || !key) throw new Error('falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para subir al bucket')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Los ámbitos a recorrer: la carpeta de cada obra y la del cliente. En ese orden. */
async function ambitos() {
  const { rows: clientes } = await query(
    `select id::text, coalesce(nombre_comercial, razon_social, 'Cliente') nombre, drive_carpeta_id
       from clientes order by 2`)
  const { rows: obras } = await query(
    `select id, nombre, cliente_id::text, drive_carpeta_id
       from obra_canonica where cliente_id is not null order by id`)

  // Las carpetas que ALGUNA obra declara como suya. La carpeta del cliente no se recorre si es una
  // de éstas: en Quattropani la carpeta del cliente y la de la obra son EL MISMO id, y recorrer las
  // dos publicaría cada papel dos veces —una en la obra y otra suelto.
  const deObras = new Set(obras.map((o) => o.drive_carpeta_id).filter(Boolean))

  const lista = []
  for (const o of obras) {
    if (!o.drive_carpeta_id) continue
    lista.push({ clave: `obra:${o.id}`, clienteId: o.cliente_id, obraId: o.id, rotulo: o.nombre, carpeta: o.drive_carpeta_id })
  }
  for (const c of clientes) {
    if (!c.drive_carpeta_id || deObras.has(c.drive_carpeta_id)) continue
    lista.push({ clave: `cliente:${c.id}`, clienteId: c.id, obraId: null, rotulo: `${c.nombre} (carpeta del cliente)`, carpeta: c.drive_carpeta_id })
  }
  const nombres = new Map(clientes.map((c) => [c.id, c.nombre]))
  const filtrada = filtroCliente
    ? lista.filter((a) => a.clienteId === filtroCliente || (nombres.get(a.clienteId) || '').toLowerCase().includes(filtroCliente.toLowerCase()))
    : lista
  return { lista: filtrada, nombres, carpetasDeObras: deObras }
}

/**
 * LOS ARCHIVOS DE UN ÁMBITO. Un nivel de profundidad y sólo a las subcarpetas del cliente.
 *
 * Bajar a ciegas mezclaría obras: la carpeta de «Galpones, Mampostería, Cancha de Padel» CONTIENE
 * las carpetas declaradas de «Entrepiso», «Pisos Industriales» e «Instalación Eléctrica», que son
 * otras obras con su propio acceso. Aunque el nombre pase el filtro, no se entra a la carpeta que
 * otra obra declaró como suya.
 */
async function archivosDe(g, carpetaId, carpetasDeObras) {
  const raiz = await g.listarCarpeta(carpetaId, { campos: CAMPOS })
  const salida = raiz
    .filter((a) => a.mimeType !== 'application/vnd.google-apps.folder')
    .map((a) => ({ ...a, carpeta: '' }))

  for (const sub of raiz.filter((a) => a.mimeType === 'application/vnd.google-apps.folder')) {
    if (!esCarpetaDelCliente(sub.name) || carpetasDeObras.has(sub.id)) continue
    const hijos = await g.listarCarpeta(sub.id, { campos: CAMPOS })
    for (const h of hijos) {
      if (h.mimeType === 'application/vnd.google-apps.folder') continue
      salida.push({ ...h, carpeta: sub.name })
    }
  }
  return salida
}

/** Lo que ya está espejado de este ámbito, por id de Drive. */
async function yaEspejado(clienteId, obraId) {
  const { rows } = await query(
    `select drive_file_id, bytes, storage_path from documento_cliente
      where cliente_id = $1 and coalesce(obra_id,'_cliente') = $2`,
    [clienteId, obraId ?? '_cliente'])
  return new Map(rows.map((r) => [r.drive_file_id, r]))
}

async function espejarAmbito(g, sb, ambito, carpetasDeObras) {
  const res = { ...ambito, archivos: 0, publicados: 0, ocultos: 0, saltados: 0, bajados: 0, reusados: 0, bytes: 0, error: null, detalle: [] }
  let archivos
  try {
    archivos = await archivosDe(g, ambito.carpeta, carpetasDeObras)
  } catch (e) {
    res.error = `no se pudo leer la carpeta: ${e.message}`
    return res
  }

  const previos = APLICAR ? await yaEspejado(ambito.clienteId, ambito.obraId) : new Map()

  for (const a of archivos) {
    const v = veredicto({ nombre: a.name, mimeType: a.mimeType, carpeta: a.carpeta })
    res.archivos += 1
    if (v.destino === 'saltar') { res.saltados += 1; continue }
    if (v.destino === 'oculto') res.ocultos += 1
    else res.publicados += 1
    const bytes = a.size == null ? null : Number(a.size)
    res.detalle.push({ nombre: a.name, destino: v.destino, categoria: v.categoria, motivo: v.motivo, bytes })
    if (!APLICAR) continue

    const ruta = rutaEnBucket(ambito.clienteId, ambito.obraId, a.id, a.name)
    const previo = previos.get(a.id)
    // IDEMPOTENCIA: mismo archivo, mismo tamaño y mismo destino ⇒ no se vuelve a bajar. Lo que sí se
    // reescribe es la FILA, porque el veredicto puede haber cambiado con una regla nueva.
    const hayQueBajar = !previo || previo.storage_path !== ruta || Number(previo.bytes) !== bytes
    if (hayQueBajar) {
      const buf = await g.descargarBytes(a.id)
      const up = await sb.storage.from(BUCKET).upload(ruta, buf, { contentType: a.mimeType, upsert: true })
      if (up.error) throw new Error(`no se pudo subir ${a.name}: ${up.error.message}`)
      res.bajados += 1
      res.bytes += buf.length
    } else {
      res.reusados += 1
    }

    await query(
      `insert into documento_cliente
         (cliente_id, obra_id, titulo, categoria, disciplina, revision, fecha,
          drive_file_id, storage_path, mime, bytes, visible_portal, origen, sincronizado_en)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'espejo_drive', now())
       on conflict (coalesce(obra_id,'_cliente'), drive_file_id) do update set
         titulo = excluded.titulo, categoria = excluded.categoria, disciplina = excluded.disciplina,
         revision = excluded.revision, fecha = excluded.fecha, storage_path = excluded.storage_path,
         mime = excluded.mime, bytes = excluded.bytes, sincronizado_en = now(), actualizado_at = now()`,
      [
        ambito.clienteId, ambito.obraId, a.name, v.categoria, v.disciplina, v.revision,
        a.modifiedTime ? a.modifiedTime.slice(0, 10) : null,
        a.id, ruta, a.mimeType, bytes, v.destino === 'publicar',
      ])
  }

  if (APLICAR) {
    await query(
      `insert into documento_espejo_corrida (ambito, carpeta_drive, corrida_at, documentos, publicados, error)
       values ($1,$2, now(), $3, $4, $5)
       on conflict (ambito) do update set carpeta_drive = excluded.carpeta_drive,
         corrida_at = now(), documentos = excluded.documentos, publicados = excluded.publicados,
         error = excluded.error`,
      [ambito.clave, ambito.carpeta, res.publicados + res.ocultos, res.publicados, res.error])
  }
  return res
}

// ── LO QUE `visible_portal = false` NO PISA ──────────────────────────────────────────────────
//
// El `do update` de arriba NO toca `visible_portal`: si administración escondió un papel a mano, la
// corrida siguiente no lo vuelve a publicar. Es la misma regla que el resto del OS — lo editado por
// una persona le gana al generador.

async function main() {
  const cfg = loadConfig()
  const g = makeGoogleClient({ config: cfg, scopes: WRITE_SCOPES })
  const sb = APLICAR ? almacen() : null
  const { lista, nombres, carpetasDeObras } = await ambitos()

  console.log(APLICAR ? '── ESPEJO DE DOCUMENTOS · APLICANDO ──' : '── ESPEJO DE DOCUMENTOS · sólo informa (agregá --aplicar) ──')
  const porCliente = new Map()

  for (const ambito of lista) {
    let r
    try {
      r = await espejarAmbito(g, sb, ambito, carpetasDeObras)
    } catch (e) {
      r = { ...ambito, archivos: 0, publicados: 0, ocultos: 0, saltados: 0, bajados: 0, reusados: 0, bytes: 0, error: e.message, detalle: [] }
      if (APLICAR) {
        await query(
          `insert into documento_espejo_corrida (ambito, carpeta_drive, corrida_at, documentos, publicados, error)
           values ($1,$2, now(), 0, 0, $3)
           on conflict (ambito) do update set corrida_at = now(), error = excluded.error`,
          [ambito.clave, ambito.carpeta, e.message])
      }
    }
    const nom = nombres.get(r.clienteId) || r.clienteId
    const acc = porCliente.get(nom) || { publicados: 0, ocultos: 0, saltados: 0, bajados: 0, bytes: 0, errores: 0 }
    acc.publicados += r.publicados; acc.ocultos += r.ocultos; acc.saltados += r.saltados
    acc.bajados += r.bajados; acc.bytes += r.bytes; acc.errores += r.error ? 1 : 0
    porCliente.set(nom, acc)

    const marca = r.error ? '✖' : '·'
    console.log(`${marca} ${nom} / ${r.rotulo}: ${r.publicados} publicados, ${r.ocultos} ocultos, ${r.saltados} saltados`
      + (APLICAR ? ` — ${r.bajados} bajados, ${r.reusados} ya estaban` : '')
      + (r.error ? ` — ${r.error}` : ''))
    for (const d of r.detalle) console.log(`    ${d.destino === 'publicar' ? '✓' : '·'} ${d.nombre} [${d.categoria}] ${d.motivo}`)
  }

  console.log('\n── POR CLIENTE ──')
  for (const [nom, a] of [...porCliente].sort()) {
    console.log(`${nom}: ${a.publicados} publicados · ${a.ocultos} ocultos · ${a.saltados} saltados`
      + (APLICAR ? ` · ${a.bajados} bajados (${(a.bytes / 1048576).toFixed(1)} MB)` : '')
      + (a.errores ? ` · ${a.errores} carpetas con error` : ''))
  }
  if (!APLICAR) console.log('\nNada se escribió. Con --aplicar baja los archivos, los sube al bucket y escribe las filas.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
