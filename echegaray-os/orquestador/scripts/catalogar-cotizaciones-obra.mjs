#!/usr/bin/env node
// CATALOGA LAS COTIZACIONES DE CADA OBRA ACTIVA EN `obra_documento` Y CORRIGE UN DRIVE ID ROTO.
//
//   node orquestador/scripts/catalogar-cotizaciones-obra.mjs            (ensayo: begin … rollback)
//   node orquestador/scripts/catalogar-cotizaciones-obra.mjs --aplicar
//
// ═══ POR QUÉ `obra_documento` Y NO `documento_cliente` ═══
//
// `documento_cliente` es el espejo del PORTAL DEL CLIENTE (`documentos-espejo.mjs`): baja el archivo
// a Storage, falla cerrado para lo interno —una .xlsm de cotización NUNCA sale de Drive, ver
// src/app/portal/papeles.ts— y recalcula la categoría por nombre en cada corrida, así que una
// recategorización a mano se revierte sola. Cargar ahí una cotización interna sería publicarle al
// cliente el cómputo, o una fila con una ruta de Storage que no existe.
//
// `obra_documento` es el catálogo interno de la obra: `vincular-documentos-obra.mjs` no pisa el rol
// ni el origen que escribió una persona. Acá se escribe origen 'confirmado' con el rol del papel.
//
// Además: `obra_contrato.fuente_drive_id` de entrepiso-y-escalera apunta a un id inexistente (…Xio);
// el archivo real es …Xik. Se corrige SÓLO si sigue el id roto.
import { getPool, closePool } from '../lib/db.mjs'
import { DOCUMENTOS, CORRECCION_CONTRATO } from '../lib/presupuestos-cotizados.mjs'

const aplicar = process.argv.includes('--aplicar')

async function main() {
  const pool = getPool()
  const c = await pool.connect()
  let res
  try {
    await c.query('begin')
    const faltan = (await c.query(
      'select x from unnest($1::text[]) x where not exists (select 1 from public.drive_index i where i.drive_file_id = x)',
      [DOCUMENTOS.map((d) => d.drive)])).rows.map((r) => r.x)
    if (faltan.length) throw new Error(`drive ids que no están en drive_index: ${faltan.join(', ')}`)

    res = { insertados: 0, actualizados: 0, iguales: 0, contrato: 0 }
    for (const d of DOCUMENTOS) {
      const r = await c.query(
        `insert into public.obra_documento (obra_id, drive_file_id, rol, origen, nombre, tipo, mime_type, creado_por)
         values ($1, $2, $3, 'confirmado', $4, 'archivo', $5, null)
         on conflict (obra_id, drive_file_id) do update
           set rol = excluded.rol, origen = excluded.origen, nombre = excluded.nombre, mime_type = excluded.mime_type
         where (obra_documento.rol, obra_documento.origen, obra_documento.nombre, obra_documento.mime_type)
               is distinct from (excluded.rol, excluded.origen, excluded.nombre, excluded.mime_type)
         returning (xmax = 0) as insertado`,
        [d.obra, d.drive, d.rol, d.nombre, d.mime])
      if (!r.rows.length) res.iguales++
      else if (r.rows[0].insertado) res.insertados++
      else res.actualizados++
    }
    res.contrato = (await c.query(
      'update public.obra_contrato set fuente_drive_id = $3 where obra_id = $1 and fuente_drive_id = $2',
      [CORRECCION_CONTRATO.obra, CORRECCION_CONTRATO.idRoto, CORRECCION_CONTRATO.idReal])).rowCount

    console.log(`obra_documento: ${res.insertados} insertados · ${res.actualizados} actualizados · ${res.iguales} iguales`)
    console.log(`obra_contrato entrepiso: ${res.contrato} fila corregida`)
    if (!aplicar) {
      await c.query('rollback')
      console.log('✓ ensayo: nada quedó escrito (rollback). Para escribir: --aplicar')
      return
    }
    await c.query('commit')
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
  const otra = await pool.connect()
  try {
    const docs = (await otra.query(
      `select count(*)::int n from public.obra_documento d
        join unnest($1::text[], $2::text[], $3::text[]) as x(obra, drive, rol) on d.obra_id = x.obra and d.drive_file_id = x.drive and d.rol = x.rol
        where d.origen = 'confirmado'`,
      [DOCUMENTOS.map((d) => d.obra), DOCUMENTOS.map((d) => d.drive), DOCUMENTOS.map((d) => d.rol)])).rows[0].n
    const k = (await otra.query('select fuente_drive_id, exists (select 1 from public.drive_index i where i.drive_file_id = c.fuente_drive_id) en_indice from public.obra_contrato c where obra_id = $1', [CORRECCION_CONTRATO.obra])).rows[0]
    console.log(`LEÍDO EN DESTINO: ${docs}/${DOCUMENTOS.length} documentos con su rol y origen confirmado · entrepiso fuente_drive_id=${k.fuente_drive_id} (en drive_index: ${k.en_indice})`)
  } finally {
    otra.release()
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => closePool())
