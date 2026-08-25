#!/usr/bin/env node
// EL HISTÓRICO DEL CANAL DE COMPROBANTES → EL BUCKET, Y CADA ARCHIVO COLGADO DE SU FILA DE COMPRAS.
//
// Pedido del dueño (25/08/2026): «debés analizar en canal carga de comprobantes del chat cuáles
// fueron las fotos o comprobantes que han sido enviados históricamente para que la sección Compras
// de app.ecsas quede actualizada con todo, incluida foto o lo que sea que se haya enviado».
//
// ═══ EL ORDEN IMPORTA, Y ES POR PLATA ═══
//
// Vincular por el REGISTRO es gratis y es un hecho: `comunicacion.comprobante_fajos.items` guarda,
// por cada archivo que el bot procesó, su `fileId` junto a la `clave` que terminó en la pestaña.
// Leer el papel con el modelo de visión cuesta créditos y produce una INFERENCIA. Entonces: primero
// se agota el registro, y sólo lo que quede se lee — y sólo si se pide con `--con-vision`.
//
// `--dry` NO BAJA, NO SUBE Y NO LEE NADA. Cuenta. Es lo que se corre antes de decidir el gasto.
//
// ═══ IDEMPOTENTE ═══
//
// `compra_adjunto.origen_file_id` es único: un archivo que ya está no se vuelve a bajar ni a subir.
// El backfill se puede correr las veces que haga falta sin pagar dos veces los 429 MB.
//
//   node orquestador/scripts/backfill-comprobantes-mattermost.mjs --dry
//   node orquestador/scripts/backfill-comprobantes-mattermost.mjs [--con-vision] [--tope N]

import { query, closePool } from '../lib/db.mjs'
import { mattermostDelOs } from '../lib/mattermost-os.mjs'
import { subirAStorage } from '../lib/storage-supabase.mjs'
import { bajarAdjunto } from '../comunicacion/comprobantes/flujo.mjs'
import { normalizar_lectura } from '../lib/comprobantes/lectura.mjs'
import { leerAdjunto } from '../lib/comprobantes/vision.mjs'
import { registroPorArchivo, vincularLectura, vincularPorRegistro } from '../lib/comprobantes/vinculo.mjs'

const DRY = process.argv.includes('--dry')
const CON_VISION = process.argv.includes('--con-vision')
const TOPE = Number(process.argv[process.argv.indexOf('--tope') + 1]) || Infinity

export const BUCKET = 'comprobantes'
/** El techo del bucket (`20260825T1000`). Un archivo más grande no entra: se declara, no se trunca. */
export const MAX_BYTES = 5 * 1024 * 1024
/** Los tipos que el bucket acepta. Lo que no está acá no es un comprobante mirable. */
export const MEDIA_OK = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'image/heic', 'image/heif',
])

/** La ruta del histórico. El post agrupa: cinco fotos de un fajo quedan juntas y se ve por qué. */
export const rutaDe = (postId, fileId, nombre) => {
  const ext = String(nombre ?? '').split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  return `historico/${postId}/${fileId}.${ext}`
}

/** El canal de comprobantes, leído de la tabla — no cableado en el código. */
async function canalDeComprobantes() {
  const { rows } = await query(
    `select channel_id, canal_nombre from comunicacion.canales_area
     where plataforma='mattermost' and area_clave='compras' and activo order by id limit 1`)
  if (!rows.length) throw new Error('no hay canal de compras en comunicacion.canales_area — no sé dónde mirar')
  return rows[0]
}

/** TODO el histórico del canal, post por post. Sin techo de páginas: si hay 4.000 posts, son 4.000. */
async function archivosDelCanal(mm, channelId) {
  const archivos = []
  for (let page = 0; ; page++) {
    const d = await mm.postsDelCanal({ channel_id: channelId, page, per_page: 200 })
    const orden = d?.order ?? []
    if (!orden.length) break
    for (const id of orden) {
      const p = d.posts[id]
      // UN POST BORRADO NO APORTA RESPALDO: sus archivos ya no existen para nadie.
      if (p?.delete_at) continue
      for (const f of (p?.metadata?.files ?? [])) {
        archivos.push({
          post_id: id, file_id: f.id, nombre: f.name ?? f.id,
          media_type: String(f.mime_type ?? '').split(';')[0].trim().toLowerCase(),
          bytes: Number(f.size ?? 0), create_at: p.create_at,
        })
      }
    }
  }
  return archivos
}

/**
 * LO QUE YA ESTÁ GUARDADO — y `[]` si la tabla todavía no existe.
 *
 * Esa tolerancia es a propósito y sólo sirve para el `--dry`: el conteo que decide si se gasta en
 * visión tiene que poder correrse ANTES de que se apliquen las migraciones, que las aplica otro. Una
 * corrida real contra una tabla inexistente falla igual en el `insert`, así que la guarda no puede
 * hacer pasar por bueno un backfill que no escribió nada.
 */
async function guardadosHastaAhora() {
  try {
    const { rows } = await query(
      'select origen_file_id from public.compra_adjunto where origen_file_id is not null')
    return rows.map((r) => r.origen_file_id)
  } catch (e) {
    if (!/compra_adjunto/.test(String(e?.message))) throw e
    console.log('AVISO: public.compra_adjunto todavía no existe — cuento como si no hubiera nada guardado.\n')
    return []
  }
}

/**
 * El vínculo que el bot ya dejó escrito. El `left join` con `comprobantes_cargados` trae el RENGLÓN
 * donde escribió y el número que escribió: con eso `vincularPorRegistro` puede comprobar que ese
 * renglón siga siendo el mismo comprobante, en vez de creerle a una posición.
 */
async function registro() {
  const { rows } = await query(
    `select it->'origen'->>'fileId' file_id, it->>'clave' clave, f.estado, cc.fila, cc.numero
     from comunicacion.comprobante_fajos f,
          lateral jsonb_array_elements(coalesce(f.items,'[]'::jsonb)) it
     left join comunicacion.comprobantes_cargados cc
       on cc.clave = it->>'clave' and cc.hoja = 'Compras'`)
  return registroPorArchivo(rows)
}

/** Las filas de la pestaña contra las que se matchea lo que no está en el registro. */
async function comprasDelEspejo() {
  const { rows } = await query(
    'select fila, clave, comprobante, total::float8 total from public.compra_sheet')
  return rows
}

/** Qué pasa con este archivo antes de tocar nada: ¿entra al bucket? Puro y exportado para el test. */
export function admisible(a) {
  if (!MEDIA_OK.includes(a.media_type)) return { ok: false, motivo: `tipo ${a.media_type || 'desconocido'}` }
  if (a.bytes > MAX_BYTES) return { ok: false, motivo: `pesa ${(a.bytes / 1048576).toFixed(1)} MB` }
  if (!a.bytes) return { ok: false, motivo: 'tamaño cero' }
  return { ok: true }
}

/** El conteo que se reporta ANTES de gastar un peso. */
function informe(archivos, yaEstan, reg) {
  const nuevos = archivos.filter((a) => !yaEstan.has(a.file_id))
  const conRegistro = nuevos.filter((a) => reg.has(a.file_id))
  const rechazados = nuevos.map((a) => ({ a, v: admisible(a) })).filter((x) => !x.v.ok)
  const subibles = nuevos.filter((a) => admisible(a).ok)
  const aLeer = subibles.filter((a) => !reg.has(a.file_id))
  const mb = (n) => (n / 1048576).toFixed(1)
  console.log(`archivos en el canal            ${archivos.length}`)
  console.log(`  ya guardados (no se re-bajan) ${archivos.length - nuevos.length}`)
  console.log(`  nuevos                        ${nuevos.length}  (${mb(nuevos.reduce((s, a) => s + a.bytes, 0))} MB)`)
  console.log(`  · no entran al bucket         ${rechazados.length}`)
  for (const { a, v } of rechazados) console.log(`      ${a.nombre} — ${v.motivo}`)
  console.log(`  · vinculan por REGISTRO       ${conRegistro.filter((a) => admisible(a).ok).length}  (gratis, es un hecho)`)
  console.log(`  · habría que LEER con visión  ${aLeer.length}  ← esto cuesta créditos`)
  return { nuevos, subibles, aLeer }
}

/** Baja de Mattermost, guarda en el bucket y devuelve el adjunto listo para leer (o el motivo). */
async function guardar(mm, a) {
  const bajado = await bajarAdjunto(mm, a.file_id)
  if (!bajado.ok) return { ok: false, motivo: bajado.error }
  const path = rutaDe(a.post_id, a.file_id, a.nombre)
  const subido = await subirAStorage({
    bucket: BUCKET, path, data: bajado.data, mediaType: bajado.mediaType,
  })
  if (!subido.ok) return { ok: false, motivo: subido.error }
  return { ok: true, path, bajado, yaEstaba: subido.yaEstaba }
}

/** Lee el papel y busca su fila. SÓLO se llama para lo que el registro no cubrió. */
async function deducir(bajado, compras) {
  const leido = await leerAdjunto({ data: bajado.data, mediaType: bajado.mediaType, nombre: bajado.nombre })
  if (!leido.ok) return { vinculo: { vinculado_por: 'sin_vincular', motivo: leido.error }, lectura: null }
  const c = normalizar_lectura(leido.crudo).comprobante
  return { vinculo: vincularLectura(c, compras), lectura: c }
}

/** Una fila de `compra_adjunto`. El vínculo decide qué se afirma y con qué confianza. */
async function anotar(a, path, bajado, vinculo, lectura) {
  await query(
    `insert into public.compra_adjunto
       (compra_clave, fila_compras, storage_path, nombre, media_type, bytes, origen,
        origen_post_id, origen_file_id, subido_at, vinculado_por, confianza, vinculado_at, lectura)
     values ($1,$2,$3,$4,$5,$6,'mattermost',$7,$8,$9,$10,$11,$12,$13)
     on conflict (origen_file_id) where origen_file_id is not null do nothing`,
    [vinculo.clave ?? null, vinculo.fila ?? null, path, a.nombre, bajado.mediaType, a.bytes,
      a.post_id, a.file_id, new Date(a.create_at).toISOString(),
      vinculo.vinculado_por, vinculo.confianza ?? null,
      vinculo.clave ? new Date().toISOString() : null,
      lectura ? JSON.stringify(lectura) : null],
  )
}

async function main() {
  const canal = await canalDeComprobantes()
  const mm = mattermostDelOs()
  if (!mm) throw new Error('sin MM_BASE_URL/MM_BOT_TOKEN — no puedo leer el canal')

  const archivos = await archivosDelCanal(mm, canal.channel_id)
  const yaEstan = new Set(await guardadosHastaAhora())
  const reg = await registro()

  console.log(`canal «${canal.canal_nombre}» (${canal.channel_id})\n`)
  const { subibles, aLeer } = informe(archivos, yaEstan, reg)

  if (DRY) {
    console.log('\n[dry] no bajé, no subí y no leí nada.')
    if (aLeer.length) {
      console.log(`Para vincular esos ${aLeer.length} hay que correr con --con-vision, y eso gasta créditos.`)
    }
    await closePool(); return
  }
  if (aLeer.length && !CON_VISION) {
    console.log(`\nAVISO: ${aLeer.length} archivos van a quedar SIN VINCULAR (falta --con-vision).`)
  }

  const compras = await comprasDelEspejo()
  const cuenta = { guardados: 0, registro: 0, deducidos: 0, sueltos: 0, fallados: 0 }
  for (const a of subibles.slice(0, TOPE)) {
    const g = await guardar(mm, a)
    if (!g.ok) { cuenta.fallados++; console.error(`  ✗ ${a.nombre}: ${g.motivo}`); continue }
    cuenta.guardados++

    const delRegistro = reg.get(a.file_id)
    let vinculo = delRegistro
      ? vincularPorRegistro(delRegistro, compras)
      : { vinculado_por: 'sin_vincular' }
    let lectura = null
    // SÓLO SE LEE LO QUE EL REGISTRO NO PUDO RESOLVER. Un archivo cuyo registro existe pero cuya
    // fila ya no está tampoco se lee: el papel no va a decir nada que la pestaña no diga, y leerlo
    // gastaría créditos para llegar al mismo «no hay fila».
    if (!delRegistro && CON_VISION) ({ vinculo, lectura } = await deducir(g.bajado, compras))

    await anotar(a, g.path, g.bajado, vinculo, lectura)
    if (vinculo.vinculado_por === 'registro') cuenta.registro++
    else if (vinculo.clave) cuenta.deducidos++
    else cuenta.sueltos++
  }

  console.log(`\nguardados ${cuenta.guardados} · por registro ${cuenta.registro} · deducidos `
    + `${cuenta.deducidos} · sin vincular ${cuenta.sueltos} · no se pudieron bajar ${cuenta.fallados}`)
  await closePool()
}
// SÓLO CORRE CUANDO SE LO INVOCA, no cuando alguien lo importa. Sin esta guarda, el test que mira
// `admisible` y `rutaDe` arrancaba el backfill entero contra el Mattermost de producción.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    console.error('backfill falló:', e.message)
    await closePool().catch(() => {}); process.exit(1)
  })
}
