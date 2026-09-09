#!/usr/bin/env node
// LOS 196 ARCHIVOS DEL CANAL «Comprobantes-gastos», ESLABÓN POR ESLABÓN. SÓLO LECTURA.
//
// Pedido del dueño (09/09/2026): «no dejes ninguno afuera». Esto contesta cuántos quedaron afuera,
// cuáles, y en qué eslabón se cortó cada uno — sin bajar, sin subir, sin leer con el modelo y sin
// tocar el Sheet. Se puede correr las veces que haga falta y antes de decidir cualquier gasto.
//
//   node orquestador/scripts/auditar-adjuntos-canal-compras.mjs [--detalle]
//
// La cadena que audita, y de dónde sale cada eslabón:
//   CANAL     Mattermost, posts del canal de `comunicacion.canales_area` (area_clave='compras')
//   RESPALDO  `public.compra_adjunto` (bucket `comprobantes`) por `origen_file_id`
//   LECTURA   `comunicacion.comprobante_fajos.items` — el fileId junto a la clave que leyó el bot
//   FILA      `public.compra_sheet` — el espejo de la pestaña Compras
//
// EL ESPEJO PUEDE ESTAR ATRASADO Y ESO CAMBIA EL RESULTADO: el 09/09 cinco fotos salieron «sin fila»
// en una corrida y «en Compras» en la siguiente, dos minutos después, porque entre las dos corrió el
// sync de `compra_sheet`. Por eso se imprime cuándo se sincronizó por última vez: un auditor que no
// declara la edad de su fuente puede reportar un faltante que no existe.

import { query, closePool } from '../lib/db.mjs'
import { mattermostDelOs } from '../lib/mattermost-os.mjs'
import { conciliarCanal, ningunoAfuera, CAMINO, ORDEN, ESLABON } from '../lib/comprobantes/auditoria-canal.mjs'
import { lecturaPorArchivo } from './vincular-adjuntos-huerfanos.mjs'

const DETALLE = process.argv.includes('--detalle')

async function canal() {
  const { rows } = await query(
    `select channel_id, canal_nombre from comunicacion.canales_area
      where plataforma='mattermost' and area_clave='compras' and activo order by id limit 1`)
  if (!rows.length) throw new Error('no hay canal de compras en comunicacion.canales_area')
  return rows[0]
}

/** Todo el histórico del canal. Un post borrado no aporta respaldo: sus archivos ya no existen. */
async function archivosDelCanal(mm, channelId) {
  const out = []
  for (let page = 0; ; page++) {
    const d = await mm.postsDelCanal({ channel_id: channelId, page, per_page: 200 })
    const orden = d?.order ?? []
    if (!orden.length) break
    for (const id of orden) {
      const p = d.posts[id]
      if (p?.delete_at) continue
      for (const f of (p?.metadata?.files ?? [])) {
        out.push({
          post_id: id, file_id: f.id, nombre: f.name ?? f.id,
          media_type: String(f.mime_type ?? '').split(';')[0].trim().toLowerCase(),
          bytes: Number(f.size ?? 0), create_at: p.create_at,
        })
      }
    }
  }
  return out
}

const fecha = (ms) => new Date(ms).toISOString().slice(0, 10)

async function main() {
  const c = await canal()
  const mm = mattermostDelOs()
  if (!mm) throw new Error('sin MM_BASE_URL/MM_BOT_TOKEN — no puedo leer el canal')

  const archivos = await archivosDelCanal(mm, c.channel_id)
  const [{ rows: resp }, { rows: fajos }, { rows: compras }, { rows: edad }] = await Promise.all([
    query(`select origen_file_id, compra_clave, fila_compras, vinculado_por
             from public.compra_adjunto where origen_file_id is not null`),
    query('select items, filas from comunicacion.comprobante_fajos'),
    query('select fila, clave, proveedor, comprobante, total from public.compra_sheet where clave is not null'),
    query('select max(sincronizado_en) sync, count(*) n from public.compra_sheet'),
  ])

  const respaldos = new Map(resp.map((r) => [String(r.origen_file_id), r]))
  const { filas, resumen, total } = conciliarCanal({
    archivos, respaldos, lecturas: lecturaPorArchivo(fajos), compras,
  })

  console.log(`canal «${c.canal_nombre}» (${c.channel_id})`)
  console.log(`espejo compra_sheet: ${edad[0].n} filas, sincronizado ${edad[0].sync?.toISOString?.() ?? edad[0].sync}\n`)
  console.log(`archivos en el canal          ${total}`)
  for (const e of ORDEN) console.log(`  ${e.padEnd(28)}${String(resumen[e]).padStart(3)}   ${CAMINO[e]}`)

  for (const e of [ESLABON.SIN_RESPALDO, ESLABON.SIN_LECTURA, ESLABON.SIN_FILA, ESLABON.DESCARTADO]) {
    const suyos = filas.filter((f) => f.eslabon === e)
    if (!suyos.length) continue
    console.log(`\n── ${e} (${suyos.length}) ──`)
    for (const f of suyos) console.log(`  ${fecha(f.create_at)} ${f.nombre} · post ${f.post_id} · ${f.motivo}`)
  }

  if (DETALLE) {
    console.log('\n── en_compras ──')
    for (const f of filas.filter((x) => x.eslabon === ESLABON.EN_COMPRAS)) {
      console.log(`  ${fecha(f.create_at)} ${f.nombre} → fila ${f.fila ?? '?'} · ${f.clave}`)
    }
  }

  console.log(`\n¿ninguno afuera? ${ningunoAfuera(resumen) ? 'SÍ' : 'NO'}`)
  await closePool()
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
