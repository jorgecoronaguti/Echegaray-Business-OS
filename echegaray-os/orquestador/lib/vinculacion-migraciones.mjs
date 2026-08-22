// LAS MIGRACIONES DE VINCULACIÓN (T6100 · T6110 · T6500), APLICADAS DENTRO DE UNA TRANSACCIÓN QUE
// TERMINA EN ROLLBACK.
//
// Mismo criterio que `circuito-productivo-migraciones.mjs`: «una migración en el repo NO es una
// migración aplicada». El test LEE los .sql, los EJECUTA en su propia transacción y recién entonces
// afirma. Un error de sintaxis pone el test en rojo — que es lo que un archivo no aplicado tiene
// que hacer.
//
// Al terminar, ROLLBACK: la base viva no se toca. Aplicarlas de verdad lo decide quien integra.
//
// Se usa el protocolo de consulta simple (`client.query(texto)` sin parámetros), que admite varias
// sentencias en un envío y NO parte el archivo por `;` — partirlo rompería todo cuerpo `$$ … $$`.

import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const DIR_MIGRACIONES = join(AQUI, '..', '..', 'supabase', 'migrations')

/** Las bandas asignadas a este frente: T6100–T6199 (actividad ↔ estándar) y T6500–T6549 (documento
 *  ↔ obra). El nombre del archivo ES la posición en la cadena. */
export const PREFIJOS_VINCULACION = /^20260822T6(1[0-9]{2}|5[0-4][0-9])_/

export async function archivosDeVinculacion(filtro = PREFIJOS_VINCULACION) {
  const todos = await readdir(DIR_MIGRACIONES)
  return todos.filter((f) => f.endsWith('.sql') && filtro.test(f)).sort()
}

/**
 * Aplica las migraciones sobre un cliente que YA está dentro de una transacción.
 *
 * A diferencia del circuito productivo, acá NO hay centinela de «ya está vivo»: estas migraciones
 * todavía no se aplicaron en ninguna base, y el día que se apliquen los `create or replace` +
 * `drop … if exists` de los tres archivos son idempotentes, así que re-aplicarlos en la transacción
 * del test sigue siendo válido. Si alguna vez deja de serlo, el test se pone rojo — no en silencio.
 *
 * @param {import('pg').PoolClient} client
 * @returns {Promise<string[]>} los archivos aplicados, en orden.
 */
export async function aplicarMigracionesDeVinculacion(client) {
  const archivos = await archivosDeVinculacion()
  const aplicados = []
  for (const archivo of archivos) {
    const sql = await readFile(join(DIR_MIGRACIONES, archivo), 'utf8')
    try {
      await client.query(sql)
    } catch (err) {
      // El nombre del archivo va en el error: sin esto, un fallo en la tercera migración se lee
      // como un fallo del test y hay que ir a buscar cuál fue.
      err.message = `[${archivo}] ${err.message}`
      throw err
    }
    aplicados.push(archivo)
  }
  return aplicados
}
