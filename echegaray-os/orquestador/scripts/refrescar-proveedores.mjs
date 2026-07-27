#!/usr/bin/env node
// REFRESCAR PROVEEDORES — el cuadro "a quién se debe" vivo, respetando lo que el dueño carga a mano.
//
// POR QUÉ (2026-07-27). El cuadro de deuda tiene que ser "lo más vivo" (aparece la deuda nueva sola,
// se va la pagada) PERO sin perder las columnas y comentarios que el dueño escribe a mano (Obra, Tipo
// de Pago, Categoría, Comentarios). Una fórmula/QUERY es viva pero le borra esas columnas. El generador
// reconstruye la deuda desde Compras Y preserva los comentarios ANCLADOS AL PROVEEDOR (notasAncladas)
// — probado en la copia y en el real: 11/11 comentarios conservados, 0 perdidos. Es la única forma de
// tener el cuadro vivo + respetado. Snapshot de seguridad antes de cada corrida.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { tomarSnapshot } from '../lib/sheet-snapshot.mjs'
import { closePool } from '../lib/db.mjs'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

async function main() {
  try {
    const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
    await tomarSnapshot({ google, fileId: ID, pestana: 'Proveedores', tool: 'refrescar-proveedores' })
    console.log('snapshot de Proveedores tomado (red de seguridad)')
  } catch (e) {
    console.error('no pude snapshotear Proveedores:', e.message, '- sigo (el generador preserva)')
  }
  const { stdout } = await ejecutar(process.execPath, [path.join(AQUI, 'proveedores-materiales-pestana.mjs')], {
    env: process.env, maxBuffer: 32 * 1024 * 1024, timeout: 170000,
  })
  const preserv = (String(stdout).match(/Proveedores: (\d+) celda/) || [])[1]
  const errores = /sin una sola celda en error/.test(stdout)
  console.log(`Proveedores refrescada - ${preserv || '?'} celdas del dueno conservadas - ${errores ? 'sin errores' : 'REVISAR errores'}`)
}

main().then(() => closePool()).then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
