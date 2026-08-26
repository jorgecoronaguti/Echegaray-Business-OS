#!/usr/bin/env node
// LOS RECIBOS QUE ESTÁN EN DRIVE Y NADIE MIRA — barrer las carpetas de los CINCO clientes y dejar
// cada recibo registrado en `public.recibo_cliente`, para que el portal pueda mostrarlo.
//
//   node orquestador/scripts/recibos-drive-sembrar.mjs                 (en seco: dice qué haría)
//   node orquestador/scripts/recibos-drive-sembrar.mjs --aplicar
//   node orquestador/scripts/recibos-drive-sembrar.mjs --cliente la-estrella
//   node orquestador/scripts/recibos-drive-sembrar.mjs --sin-pdf       (no baja ningún archivo)
//
// Textual del dueño: «en la carpeta de drive hay todo un listado de recibos, tenes q agregarlos si
// no podes saber a q obra corresponde dejarlos ahi». Y: «los cambios q quiero es para toda la
// plataforma portal cliente etc, no solo para san francisco».
//
// ═══ LAS CINCO REGLAS ═══
//
//  1. NO ESCRIBE EN DRIVE NI EN NINGÚN SHEET. Lee Drive, escribe Postgres. Nada más.
//  2. NO INVENTA LA OBRA. El archivo se imputa a una obra sólo si apareció en la carpeta que ESA
//     obra declara como propia, y ninguna otra. Todo lo demás entra con `obra_id = NULL`, que es la
//     respuesta que el dueño pidió.
//  3. NO INVENTA UN IMPORTE NI UNA FECHA. Los 23 archivos de hoy son el estado de cuenta del
//     cliente exportado a PDF: tienen veinte números con signo peso y ninguno es «el importe del
//     recibo». Sin la frase que hace de un papel un recibo, `monto` queda en NULL.
//  4. NO PISA LO QUE TOCÓ UNA PERSONA. Si la fila ya existe, sólo se refrescan el nombre y el
//     enlace del archivo, y se COMPLETAN los huecos (`coalesce`). Un número corregido a mano gana.
//  5. LA EVIDENCIA ES EL DATO RELEÍDO DEL DESTINO. Al final vuelve a consultar la tabla y muestra
//     lo que HAY: por cliente, cuántos recibos, cuántos con obra, cuántos sin obra y el total.

import { createRequire } from 'node:module'
import { query, closePool } from '../lib/db.mjs'
import { loadConfig } from '../lib/config.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import {
  datosDelNombre, esCarpetaDeRecibos, esEstadoDeCuenta, esNombreDeRecibo, esReciboDeSueldo,
  importeDeclarado, obraDeLasCarpetas,
} from '../lib/recibos-drive.mjs'

const APLICAR = process.argv.includes('--aplicar')
const SIN_PDF = process.argv.includes('--sin-pdf')
// `--json` escupe lo barrido y NADA más, para que otro proceso lo consuma. Se usó para ensayar la
// carga entera dentro de una transacción que termina en ROLLBACK, sin la tabla creada todavía.
const JSON_SOLO = process.argv.includes('--json')
const SOLO = (process.argv.find((a) => a.startsWith('--cliente=')) ?? '').split('=')[1]
  ?? (process.argv.includes('--cliente') ? process.argv[process.argv.indexOf('--cliente') + 1] : null)
// Profundidad máxima del barrido. Alcanza para `<cliente>/RECIBOS/<archivo>` con margen, y evita
// que una carpeta con un ciclo de atajos deje el script dando vueltas.
const HONDO = 4
const MIME_ACEPTADOS = /^(application\/pdf|image\/)/

const enlaceDrive = (id) => `https://drive.google.com/file/d/${id}/view`
/** El informe para una persona. Calla en modo `--json`: ahí la salida es de otro programa. */
const di = (...partes) => { if (!JSON_SOLO) console.log(...partes) }

/** Las carpetas de Drive de un cliente: la suya y la de cada obra, agrupadas por carpeta.
 *  Messina declara la MISMA carpeta para dos obras: por eso `obraIds` es una lista. */
export function raicesDelCliente(cliente, obras) {
  const porCarpeta = new Map()
  const sumar = (carpetaId, obraId) => {
    if (!carpetaId) return
    const previo = porCarpeta.get(carpetaId) ?? { carpetaId, obraIds: [] }
    if (obraId) previo.obraIds.push(obraId)
    porCarpeta.set(carpetaId, previo)
  }
  sumar(cliente.drive_carpeta_id, null)
  for (const o of obras) sumar(o.drive_carpeta_id, o.id)
  return [...porCarpeta.values()]
}

/**
 * ¿ESTE ARCHIVO PUEDE SER EL RECIBO DE UN CLIENTE, POR DÓNDE ESTÁ?
 *
 * Sí en la raíz misma (un papel suelto en la carpeta del cliente) y sí en una carpeta de recibos o
 * certificados que cuelga DIRECTO de la raíz — que es donde están los 23 de hoy. No más adentro: en
 * `ARCOR/SECONDI/8. AGOSTO/` hay recibos de sueldo del personal de un subcontratista, y un cliente
 * no puede ver eso.
 *
 * @param ruta nombres de carpeta desde la raíz hasta el archivo.
 */
export function ubicacionAdmisible(ruta) {
  if (ruta.length === 0) return true
  return ruta.length === 1 && esCarpetaDeRecibos(ruta[0])
}

/**
 * Recorre la carpeta y sus subcarpetas, devolviendo cada archivo con la ruta por la que llegó.
 *
 * `otrasRaices` son las carpetas que OTRAS obras del mismo cliente declaran como propias. No se
 * entra en ellas —cada una se barre por su lado, con su obra— y encontrar una acá significa algo
 * más: que esta carpeta CONTIENE a las obras, o sea que es la del cliente y no la de una obra.
 */
async function barrer(g, carpetaId, otrasRaices, ruta = []) {
  const items = await g.listarCarpeta(carpetaId, { campos: 'id,name,mimeType,modifiedTime,size' })
  const archivos = []
  let contieneOtraRaiz = false
  for (const it of items) {
    if (it.mimeType !== 'application/vnd.google-apps.folder') {
      archivos.push({ id: it.id, name: it.name, mimeType: it.mimeType ?? '', ruta })
      continue
    }
    if (otrasRaices.has(it.id)) { contieneOtraRaiz = true; continue }
    if (ruta.length >= HONDO) continue
    const dentro = await barrer(g, it.id, otrasRaices, [...ruta, it.name])
    archivos.push(...dentro.archivos)
    contieneOtraRaiz = contieneOtraRaiz || dentro.contieneOtraRaiz
  }
  return { archivos, contieneOtraRaiz }
}

/** Por qué este archivo NO entra, o `null` si entra. Sólo se pregunta de los que se llaman «recibo». */
export function motivoDeDescarte(archivo) {
  if (esReciboDeSueldo(archivo.name)) return 'parece un recibo de sueldo, no el recibo de un cliente'
  if (!ubicacionAdmisible(archivo.ruta)) {
    return `está en «${archivo.ruta.join('/')}», que no es una carpeta de recibos del cliente`
  }
  if (!MIME_ACEPTADOS.test(archivo.mimeType)) return `no es un PDF ni una imagen (${archivo.mimeType})`
  return null
}

/** Lee el PDF sólo para preguntarle si declara un importe. Nunca para deducir uno. */
async function importeDelArchivo(g, requerir, archivo) {
  if (SIN_PDF || !/^application\/pdf/.test(archivo.mimeType)) return { monto: null, nota: null }
  try {
    const { PDFParse } = requerir('pdf-parse')
    const data = await g.descargarBytes(archivo.id)
    const { text } = await new PDFParse({ data }).getText()
    const monto = importeDeclarado(text)
    if (monto != null) return { monto, nota: null }
    if (esEstadoDeCuenta(text)) return { monto: null, nota: 'el PDF es un estado de cuenta, no declara un importe único' }
    return { monto: null, nota: 'el PDF no declara ningún importe (puede ser un escaneo sin texto)' }
  } catch (e) {
    return { monto: null, nota: `no se pudo leer el PDF: ${e.message}` }
  }
}

/** Todo lo que el barrido encontró para un cliente, ya clasificado y sin duplicados. */
async function recibosDelCliente(g, requerir, cliente, obras) {
  const aceptados = new Map()
  const descartes = []
  const raices = raicesDelCliente(cliente, obras)
  const ids = new Set(raices.map((r) => r.carpetaId))
  for (const raiz of raices) {
    const otras = new Set([...ids].filter((id) => id !== raiz.carpetaId))
    const { archivos, contieneOtraRaiz } = await barrer(g, raiz.carpetaId, otras)
    // UNA CARPETA QUE CONTIENE A LAS DEMÁS OBRAS ES LA DEL CLIENTE, DIGA LO QUE DIGA EL MAESTRO.
    // `obra_canonica.san-francisco` declara como suya la carpeta `JAVIER SANCHEZ`, que es la raíz de
    // las CUATRO obras de ese cliente. Creerle imputaría los 12 recibos del cliente a una sola de
    // sus obras — y su contenido cruza todas (nave industrial, adicionales, cloacas).
    const obraIds = contieneOtraRaiz ? [] : raiz.obraIds
    for (const archivo of archivos) {
      if (!esNombreDeRecibo(archivo.name)) continue
      const motivo = motivoDeDescarte(archivo)
      if (motivo) { descartes.push({ ...archivo, motivo }); continue }
      const previo = aceptados.get(archivo.id)
      // Un mismo archivo alcanzado desde dos raíces junta las obras de las dos: si son distintas,
      // `obraDeLasCarpetas` devuelve null y el recibo queda sin obra. No se elige una.
      aceptados.set(archivo.id, { ...archivo, obraIds: [...(previo?.obraIds ?? []), ...obraIds] })
    }
  }
  const filas = []
  for (const a of aceptados.values()) {
    const { numero, fecha, faltan } = datosDelNombre(a.name)
    const { monto, nota } = await importeDelArchivo(g, requerir, a)
    filas.push({
      cliente_id: cliente.id, obra_id: obraDeLasCarpetas(a.obraIds),
      numero, fecha, monto, drive_file_id: a.id, drive_url: enlaceDrive(a.id), nombre_archivo: a.name,
      faltan: [...faltan, ...(nota ? [nota] : [])],
    })
  }
  filas.sort((x, y) => (y.fecha ?? '').localeCompare(x.fecha ?? '') || x.nombre_archivo.localeCompare(y.nombre_archivo))
  return { filas, descartes }
}

/** INSERT que no pisa lo que corrigió una persona: sólo refresca el archivo y completa huecos. */
async function guardar(f) {
  await query(
    `insert into public.recibo_cliente
       (cliente_id, obra_id, numero, fecha, monto, drive_file_id, drive_url, nombre_archivo, origen)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'drive')
     on conflict (drive_file_id) do update set
       nombre_archivo = excluded.nombre_archivo,
       drive_url      = excluded.drive_url,
       obra_id        = coalesce(public.recibo_cliente.obra_id, excluded.obra_id),
       numero         = coalesce(public.recibo_cliente.numero,  excluded.numero),
       fecha          = coalesce(public.recibo_cliente.fecha,   excluded.fecha),
       monto          = coalesce(public.recibo_cliente.monto,   excluded.monto),
       actualizado_at = now()`,
    [f.cliente_id, f.obra_id, f.numero, f.fecha, f.monto, f.drive_file_id, f.drive_url, f.nombre_archivo],
  )
}

/** La tabla tiene que existir: la migración es una decisión del dueño, no de este script. */
async function tablaExiste() {
  const { rows } = await query("select to_regclass('public.recibo_cliente') is not null as hay")
  return rows[0]?.hay === true
}

/** LO QUE HAY EN LA BASE, releído. Que un INSERT no dé error no prueba que escribió. */
async function releer() {
  const { rows } = await query(
    `select c.slug, count(*) recibos,
            count(*) filter (where r.obra_id is not null) con_obra,
            count(*) filter (where r.obra_id is null)     sin_obra,
            count(*) filter (where r.numero is not null)  con_numero,
            count(*) filter (where r.fecha  is not null)  con_fecha,
            count(*) filter (where r.monto  is not null)  con_monto
       from public.recibo_cliente r join public.clientes c on c.id = r.cliente_id
      group by 1 order by 1`)
  di('\n═══ RELEÍDO DE public.recibo_cliente ═══')
  if (!rows.length) di('  (vacía)')
  for (const r of rows) {
    di(`  ${r.slug.padEnd(14)} ${String(r.recibos).padStart(3)} recibos · ${r.con_obra} con obra · `
      + `${r.sin_obra} sin obra · ${r.con_numero} con número · ${r.con_fecha} con fecha · ${r.con_monto} con importe`)
  }
  const total = rows.reduce((s, r) => s + Number(r.recibos), 0)
  di(`  TOTAL ${total}`)
}

async function main() {
  const hay = await tablaExiste()
  if (!hay) {
    di('⛔ `public.recibo_cliente` NO EXISTE en esta base.')
    di('   La migración `supabase/migrations/20260826T2200_los_recibos_del_cliente_tienen_donde_vivir.sql`')
    di('   está escrita y SIN APLICAR: aplicarla es una decisión del dueño.')
    if (APLICAR) di('   No se escribió nada. El barrido de abajo es sólo informativo.\n')
  }
  const requerir = createRequire(import.meta.url)
  const g = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES })
  const { rows: clientes } = await query(
    'select id, slug, nombre_comercial, drive_carpeta_id from public.clientes where activo order by slug')
  const { rows: obras } = await query('select id, cliente_id, drive_carpeta_id from public.obra_canonica')

  let escritas = 0
  const barridas = []
  for (const cliente of clientes) {
    if (SOLO && cliente.slug !== SOLO) continue
    const suyas = obras.filter((o) => o.cliente_id === cliente.id)
    const { filas, descartes } = await recibosDelCliente(g, requerir, cliente, suyas)
    di(`\n── ${cliente.slug} (${cliente.nombre_comercial ?? ''}) — ${filas.length} recibos`)
    if (!cliente.drive_carpeta_id) di('   · el cliente no tiene carpeta de Drive: sólo se miraron las de sus obras')
    for (const f of filas) {
      const obra = f.obra_id ?? 'sin obra'
      di(`   ${(f.numero ? `n° ${f.numero}` : 'sin número').padEnd(11)} ${(f.fecha ?? 'sin fecha').padEnd(11)}`
        + ` ${(f.monto == null ? 'sin importe' : `$${Math.round(f.monto).toLocaleString('es-AR')}`).padEnd(14)}`
        + ` ${obra.padEnd(22)} ${f.nombre_archivo}`)
      for (const m of f.faltan) di(`       ↳ ${m}`)
      barridas.push(f)
      if (hay && APLICAR) { await guardar(f); escritas++ }
    }
    for (const d of descartes) di(`   ✗ ${d.name} — ${d.motivo}`)
  }
  di(!hay ? '\nNO SE ESCRIBIÓ NADA: la tabla todavía no existe (ver arriba). El barrido es informativo.'
    : APLICAR ? `\n${escritas} filas escritas.`
    : '\nEN SECO: no se escribió nada. Agregá --aplicar.')
  if (JSON_SOLO) console.log(JSON.stringify(barridas))
  if (hay) await releer()
}

// Sólo como CLI: los tests importan `raicesDelCliente`, `ubicacionAdmisible` y `motivoDeDescarte`
// sin que el barrido salga a Drive.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(closePool).catch(async (e) => { console.error(e); await closePool(); process.exit(1) })
}
