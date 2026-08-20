#!/usr/bin/env node
// LOS DOCUMENTOS DEL CLIENTE YA ESTÁN EN DRIVE — ACÁ SE GUARDA EL VÍNCULO, NUNCA UNA COPIA.
//
// La carpeta de cada cliente ya está indexada en `drive_index` (2.465 archivos con su path). Este
// script cuelga de cada cliente los archivos que viven bajo su carpeta y los marca como
// `path_inferido`: el dato dice de dónde salió, para que nadie lo confunda con un vínculo que puso
// una persona a propósito.
//
// LO QUE NO HACE:
// · No copia un solo byte a Supabase. Guarda `drive_file_id` y el archivo se abre en Drive.
// · No borra vínculos manuales. Si alguien colgó un documento a mano (`origen='manual'`), se
//   respeta: este script sólo agrega y actualiza los suyos.
// · No inventa la carpeta. Un cliente sin `drive_carpeta_id` se reporta, no se adivina por nombre —
//   adivinar por parecido de nombre es como este repo se comió 699 filas una vez.
//
//   node orquestador/scripts/sync-cliente-documentos.mjs             → dice qué haría
//   node orquestador/scripts/sync-cliente-documentos.mjs --aplicar   → escribe y relee

import { query, closePool } from '../lib/db.mjs'

const APLICAR = process.argv.includes('--aplicar')

async function main() {
  const { rows: clientes } = await query(
    `select id, slug, nombre_comercial as nombre, drive_carpeta_id from public.clientes order by nombre_comercial`)

  let total = 0
  const sinCarpeta = []
  for (const c of clientes) {
    if (!c.drive_carpeta_id) { sinCarpeta.push(c.nombre); continue }

    // El path de la carpeta manda: todo lo que cuelga de ella es del cliente. Se busca por el id de
    // la carpeta, no por su nombre, porque dos clientes pueden tener carpetas que se llaman igual.
    const { rows: carpeta } = await query(
      `select path from public.drive_index where drive_file_id = $1`, [c.drive_carpeta_id])
    if (!carpeta.length) { console.log(`  ⚠ ${c.nombre}: su carpeta no está en el índice de Drive`); continue }

    const prefijo = carpeta[0].path
    const { rows: archivos } = await query(
      `select drive_file_id, name, mime_type from public.drive_index
        where path like $1 || '/%' and mime_type not like '%folder%'
        order by modified_time desc nulls last`, [prefijo])

    console.log(`  ${c.nombre}: ${archivos.length} archivo(s) bajo "${prefijo}"`)
    total += archivos.length
    if (!APLICAR) continue

    for (const a of archivos) {
      await query(
        `insert into public.cliente_documento (cliente_id, drive_file_id, origen)
         values ($1, $2, 'path_inferido')
         on conflict (cliente_id, drive_file_id) do nothing`,
        [c.id, a.drive_file_id])
    }
  }

  if (sinCarpeta.length) {
    console.log(`\n  ⚠ sin carpeta de Drive declarada: ${sinCarpeta.join(', ')}`)
    console.log('    No se adivina por nombre. Se resuelve cargando el id de la carpeta en clientes.drive_carpeta_id.')
  }
  console.log(`\n${APLICAR ? '✓ escrito' : '(sin --aplicar)'}: ${total} vínculo(s)`)

  if (APLICAR) {
    // LA EVIDENCIA ES DEL EFECTO: se relee de la vista que van a leer las pantallas.
    const { rows } = await query(
      `select nombre, n_documentos, n_obras from public.cliente_panel order by nombre`)
    console.log('\n  releído de cliente_panel:')
    for (const r of rows) console.log(`    ${String(r.nombre).padEnd(42)} ${String(r.n_documentos).padStart(4)} documentos · ${r.n_obras} obra(s)`)
  }
  await closePool()
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
