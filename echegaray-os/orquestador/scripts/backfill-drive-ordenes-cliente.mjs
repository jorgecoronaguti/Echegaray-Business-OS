#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL VÍNCULO CON DRIVE SALE DE LA PROSA Y PASA A SER UNA COLUMNA
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
//   node orquestador/scripts/backfill-drive-ordenes-cliente.mjs            # ENSAYO
//   node orquestador/scripts/backfill-drive-ordenes-cliente.mjs --aplicar  # escribe cliente_orden
//
// El 10/09/2026 se subieron a Drive las 40 órdenes de compra de ARCOR y se encontraron las 4 de
// Messina que ya estaban. El id del archivo quedó escrito adentro de `notas`, en una frase:
//
//   «Drive: COCHERAS / OC 53077545 - 12-02-2025.pdf (id 1wpt1Z6-…) — archivada por el OS»
//
// Esto lo pasa a `drive_file_id` / `drive_carpeta_id` (migración `20260910T2300`). No borra la
// nota: la nota dice CÓMO llegó el archivo ahí, que sigue siendo lo que se audita.
//
// ES IDEMPOTENTE: sólo escribe cuando el valor calculado difiere del guardado, así que correrlo
// diez veces deja la misma tabla y la segunda corrida informa 0 cambios.
//
// ═══ LA CARPETA NO SE ADIVINA ═══
//
// El id del archivo lo dice la nota. El de la CARPETA no: la nota escribe su nombre («COCHERAS»),
// y un nombre no es un id. Se resuelve contra `public.drive_index` de dos maneras verificables —el
// padre del archivo cuando el archivo está indexado, o la carpeta cuya RUTA COMPLETA es la del
// cliente más ese nombre— y cuando ninguna resuelve queda NULL. Una carpeta parecida no es la
// carpeta: mandar a alguien a la carpeta equivocada es peor que no ofrecerle ninguna.
import path from 'node:path'
import { APP_DIR } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { loadEnvLocalInto } from '../../scripts/lib/env-file.mjs'

loadEnvLocalInto(process.env, process.env.ORDENES_ENV_FILE ?? path.join(APP_DIR, '.env.local'))

const APLICAR = process.argv.includes('--aplicar')

/**
 * El id del PDF en Drive y el NOMBRE de la carpeta que la nota declara. `null` cuando no los dice.
 *
 * Las notas se escribieron con dos plantillas distintas —una por cliente— y las dos terminan el
 * vínculo igual: `(id <fileId>)`. El nombre de la carpeta sólo lo trae la de ARCOR («Drive: X / y»);
 * la de Messina escribe una ruta de Drive entera, y ésa se resuelve por el índice, no por el texto.
 */
export function driveDeNotas(notas) {
  const t = String(notas ?? '')
  const id = t.match(/\(id ([A-Za-z0-9_-]{10,})\)/)
  const carpeta = t.match(/Drive:\s*([^/(]+?)\s*\/\s*[^/(]+\s*\(id [A-Za-z0-9_-]{10,}\)/)
  return { fileId: id ? id[1] : null, carpeta: carpeta ? carpeta[1].trim() : null }
}

async function main() {
  const { rows: cols } = await query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'cliente_orden' and column_name = 'drive_file_id'`)
  if (!cols.length) {
    // Una migración en el repo no es una migración aplicada, y un backfill contra una columna que
    // no existe falla con un mensaje que no dice qué hacer.
    throw new Error('falta la columna cliente_orden.drive_file_id: aplicar supabase/migrations/20260910T2300_el_pdf_de_la_orden_tiene_donde_decir_donde_esta.sql')
  }

  const { rows } = await query(`
    select o.id, o.notas, o.nombre_archivo, o.drive_file_id, o.drive_carpeta_id,
           c.nombre_comercial cliente, c.drive_carpeta_id carpeta_cliente
    from public.cliente_orden o
    join public.clientes c on c.id = o.cliente_id
    where o.eliminado_en is null and o.notas is not null
    order by c.nombre_comercial, o.nombre_archivo`)

  const { rows: indice } = await query(
    'select drive_file_id, parent_id, path, is_folder from public.drive_index where not trashed')
  const porId = new Map(indice.map((f) => [f.drive_file_id, f]))
  const carpetaPorRuta = new Map(indice.filter((f) => f.is_folder).map((f) => [f.path, f.drive_file_id]))
  const rutaDeCliente = new Map(indice.map((f) => [f.drive_file_id, f.path]))

  const cambios = []
  let sinVinculo = 0; let sinCarpeta = 0
  for (const r of rows) {
    const { fileId, carpeta } = driveDeNotas(r.notas)
    if (!fileId) { sinVinculo++; continue }
    const rutaCliente = rutaDeCliente.get(r.carpeta_cliente) ?? null
    const carpetaId = porId.get(fileId)?.parent_id
      ?? (carpeta && rutaCliente ? carpetaPorRuta.get(`${rutaCliente}/${carpeta}`) ?? null : null)
    if (!carpetaId) sinCarpeta++
    if (fileId === r.drive_file_id && carpetaId === (r.drive_carpeta_id ?? null)) continue
    cambios.push({ id: r.id, cliente: r.cliente, nombre: r.nombre_archivo, fileId, carpetaId })
  }

  console.log(`\nfilas con nota: ${rows.length} · con vínculo a Drive: ${rows.length - sinVinculo} · sin carpeta verificable: ${sinCarpeta}`)
  for (const c of cambios) {
    console.log(`  ~ ${c.cliente.padEnd(10)} ${String(c.nombre).slice(0, 44).padEnd(44)} file=${c.fileId} carpeta=${c.carpetaId ?? '—'}`)
  }
  if (!APLICAR) { console.log(`\nENSAYO — ${cambios.length} filas cambiarían. Nada se escribió. Con --aplicar.`); return }

  let escritas = 0
  for (const c of cambios) {
    const r = await query(
      'update public.cliente_orden set drive_file_id = $2, drive_carpeta_id = $3 where id = $1', [c.id, c.fileId, c.carpetaId])
    escritas += r.rowCount
  }
  console.log(`\nAPLICADO — filas actualizadas: ${escritas}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1) })
}
