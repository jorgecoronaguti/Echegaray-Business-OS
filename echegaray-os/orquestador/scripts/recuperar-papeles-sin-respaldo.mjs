#!/usr/bin/env node
// EL GASTO QUE EL BOT CARGÓ Y NO MUESTRA SU PAPEL — MEDIRLO, Y REPONER SÓLO LO QUE ES UN HUECO.
//
// Regla del dueño: ningún gasto de Compras sin su comprobante visible en app.ecsas.com.ar → Compras.
//
// Qué hace, en orden y por costo:
//   1. VINCULAR (gratis, no toca la red): el archivo ya está en el bucket y su `compra_clave` está
//      en blanco. Se le escribe la fila que le corresponde. Nunca pisa una clave existente.
//   2. BAJAR (cuesta red, no créditos): el archivo no está en el bucket. Se baja de Mattermost, se
//      sube y se anota con la clave que el REGISTRO ya sabe — no hace falta leerlo con visión,
//      porque de qué comprobante es ya está escrito en `comprobante_fajos`.
//
// NO ESCRIBE EL SHEET. NO LEE CON EL MODELO. NO PISA VÍNCULOS. `--dry` es el default: sin
// `--aplicar` mide y no escribe nada. Idempotente: lo repuesto queda `visible` y no se vuelve a tocar.
//
//   node orquestador/scripts/recuperar-papeles-sin-respaldo.mjs [--dry] [--aplicar] [--detalle]

import { query, closePool } from '../lib/db.mjs'
import { mattermostDelOs } from '../lib/mattermost-os.mjs'
import { subirAStorage } from '../lib/storage-supabase.mjs'
import { bajarAdjunto } from '../comunicacion/comprobantes/flujo.mjs'
import { rutaDe } from '../lib/comprobantes/respaldo-adjunto.mjs'
import { archivosPorClave, papelDeCadaGasto, todosConPapel, ESTADO, ORDEN } from '../lib/comprobantes/papel-por-clave.mjs'

const APLICAR = process.argv.includes('--aplicar')
const DETALLE = process.argv.includes('--detalle')

/** Las cuatro fuentes, leídas una sola vez. Todo lo que decide es puro y vive en el lib. */
async function fuentes() {
  const [{ rows: cargados }, { rows: fajos }, { rows: adj }, { rows: espejo }, { rows: edad }] = await Promise.all([
    query(`select clave, proveedor, fila, creado_at from comunicacion.comprobantes_cargados
            where hoja = 'Compras' order by creado_at`),
    query('select post_ids, items from comunicacion.comprobante_fajos'),
    query(`select id, origen_file_id, compra_clave, fila_compras, vinculado_por
             from public.compra_adjunto where origen_file_id is not null`),
    query('select fila, clave, proveedor from public.compra_sheet where clave is not null'),
    query('select max(sincronizado_en) sync, count(*) n from public.compra_sheet'),
  ])
  return {
    cargados,
    fuentes: archivosPorClave(fajos),
    adjuntos: new Map(adj.map((a) => [String(a.origen_file_id), a])),
    espejo,
    edad: edad[0],
  }
}

const medir = async () => { const f = await fuentes(); return papelDeCadaGasto(f) }

function imprimir(titulo, { filas, resumen, total }) {
  console.log(`\n${titulo}: ${total} gastos cargados por el bot en Compras`)
  for (const e of ORDEN) console.log(`  ${e.padEnd(14)}${String(resumen[e]).padStart(4)}`)
  console.log(`  ¿todos con papel a la vista? ${todosConPapel(resumen) ? 'SÍ' : 'NO'}`)
  if (!DETALLE) return
  for (const e of ORDEN.filter((x) => x !== ESTADO.VISIBLE)) {
    const suyos = filas.filter((f) => f.estado === e)
    if (!suyos.length) continue
    console.log(`\n── ${e} (${suyos.length}) ──`)
    for (const f of suyos) {
      console.log(`  ${f.clave} · ${f.proveedor ?? '-'} · fila ${f.fila ?? '?'} · ${f.motivo ?? f.accion?.tipo ?? ''}`)
    }
  }
}

/** El hueco se repone; el vínculo ajeno no se toca. `compra_clave is null` también en el WHERE. */
async function vincular(a) {
  const { rowCount } = await query(
    `update public.compra_adjunto
        set compra_clave = $2, fila_compras = $3, vinculado_por = 'registro', confianza = 1, vinculado_at = now()
      where id = $1 and compra_clave is null`, [a.id, a.clave, a.fila])
  return rowCount === 1
}

/** Baja de Mattermost y sube al bucket. La clave sale del registro: no se lee el papel. */
async function bajar(mm, a, gasto) {
  const b = await bajarAdjunto(mm, a.fileId)
  if (!b.ok) return { ok: false, motivo: b.error }
  const path = rutaDe(a.postId, a.fileId, a.nombre ?? a.fileId)
  const s = await subirAStorage({ bucket: 'comprobantes', path, data: b.data, mediaType: b.mediaType })
  if (!s.ok) return { ok: false, motivo: s.error }
  await query(
    `insert into public.compra_adjunto
       (compra_clave, fila_compras, storage_path, nombre, media_type, bytes, origen,
        origen_post_id, origen_file_id, vinculado_por, confianza, vinculado_at)
     values ($1,$2,$3,$4,$5,$6,'mattermost',$7,$8,'registro',1,now())
     on conflict (origen_file_id) where origen_file_id is not null do nothing`,
    [a.clave, a.fila, path, a.nombre ?? a.fileId, b.mediaType, b.data.length, a.postId, a.fileId])
  return { ok: true, gasto: gasto.clave }
}

async function main() {
  const antes = await medir()
  imprimir(APLICAR ? 'ANTES' : '[dry]', antes)

  const aVincular = antes.filas.filter((f) => f.estado === ESTADO.A_VINCULAR)
  const aBajar = antes.filas.filter((f) => f.estado === ESTADO.SIN_RESPALDO)
  console.log(`\nvincularía ${aVincular.length} (gratis) · bajaría ${aBajar.length} de Mattermost`)

  if (!APLICAR) {
    console.log('\n[dry] no escribí nada. Con --aplicar se reponen los huecos.')
    await closePool(); return
  }

  let vinculados = 0
  for (const f of aVincular) if (await vincular(f.accion)) vinculados++
  const fallados = []
  if (aBajar.length) {
    const mm = mattermostDelOs()
    if (!mm) throw new Error('sin MM_BASE_URL/MM_BOT_TOKEN — no puedo bajar los archivos')
    for (const f of aBajar) {
      const r = await bajar(mm, f.accion, f)
      if (!r.ok) fallados.push(`${f.clave} · ${f.accion.nombre ?? f.accion.fileId}: ${r.motivo}`)
    }
  }
  console.log(`\nvinculados ${vinculados} · bajados ${aBajar.length - fallados.length} · no se pudieron bajar ${fallados.length}`)
  for (const x of fallados) console.log(`  ✗ ${x}`)

  imprimir('DESPUÉS', await medir())
  await closePool()
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => {
    console.error('recuperar-papeles-sin-respaldo falló:', e.message)
    await closePool().catch(() => {}); process.exit(1)
  })
}
