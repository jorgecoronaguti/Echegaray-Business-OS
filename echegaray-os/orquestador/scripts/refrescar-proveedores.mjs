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
  // ═══ EL TIMEOUT QUE PARTÍA LA PESTAÑA AL MEDIO (31/07) ═══
  //
  // El dueño: "me rompiste proveedores nuevamente... porque me rompes todo y no arreglas nada?". Y el
  // culpable era ESTA línea: `timeout: 170000`. Este refresher corre cada 10 minutos y lanzaba el
  // generador completo con un tope de 170 segundos. El generador tarda más —lee Compras entera, cruza
  // ARCA, concilia notas— y cuando se pasaba, execFile lo MATABA a mitad de la corrida: la pestaña
  // quedaba con las filas entrelazadas (dos "Gerson Castro", dos "Alumetal", fechas dibujadas como
  // plata) y este script imprimía "Proveedores refrescada ... sin errores", porque no distinguía un
  // proceso muerto de uno terminado.
  //
  // Peor: el backoff nuevo para el 429 (que espera hasta un minuto para no leer datos parciales) hacía
  // que se pasara de los 170s MÁS seguido. Un arreglo correcto disparando un defecto viejo.
  //
  // Ahora: el tope es 10 minutos —más que el peor caso medido— y si el proceso muere, se DICE. Un
  // refresher que informa "refrescada" sobre una pestaña que quedó a medias es peor que uno que falla.
  // Y con --solo Proveedores: este refresher no tiene nada que hacer en "Materiales".
  let stdout = ''
  try {
    ({ stdout } = await ejecutar(process.execPath, [path.join(AQUI, 'proveedores-materiales-pestana.mjs'), '--solo', 'Proveedores'], {
      env: process.env, maxBuffer: 32 * 1024 * 1024, timeout: 600_000,
    }))
  } catch (e) {
    const muerto = e.killed || e.signal
    console.error(muerto
      ? `⚠ el generador fue MATADO (${e.signal || 'timeout'}) — la pestaña puede haber quedado a medias. NO la doy por refrescada; hay snapshot para volver atrás.`
      : `⚠ el generador falló: ${e.message.slice(0, 200)}`)
    throw e
  }
  // ═══ EL LOG DEL GENERADOR NO SE PIERDE (31/07) ═══
  //
  // Este refresher se comía el stdout del generador y publicaba una sola línea de resumen. Cuando la
  // pestaña salió entrelazada después de una corrida automática, no había NINGÚN rastro de qué había
  // hecho: ni qué guardas actuaron, ni cuántos proveedores listó, ni si escribió. Un agente que corre
  // solo y no deja registro de lo que hizo no se puede diagnosticar — y este ya rompió la pestaña
  // cuatro veces. Se reenvía el log completo al journal, con prefijo para distinguirlo.
  for (const linea of String(stdout).split('\n')) if (linea.trim()) console.log(`  │ ${linea}`)
  const preserv = (String(stdout).match(/Proveedores: (\d+) celda/) || [])[1]
  const errores = /sin una sola celda en error/.test(stdout)
  // Y el propio aviso del cuadro: si el listado no muestra toda la deuda, no está refrescada.
  const faltan = /⚠ Faltan/.test(stdout)
  console.log(`Proveedores refrescada - ${preserv || '?'} celdas del dueno conservadas - ${errores ? 'sin errores' : 'REVISAR errores'}${faltan ? ' - ⚠ el cuadro dice que le faltan facturas' : ''}`)
}

main().then(() => closePool()).then(() => process.exit(0))
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
