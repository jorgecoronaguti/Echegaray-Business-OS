// LAS MIGRACIONES DEL CIRCUITO PRODUCTIVO, APLICADAS DENTRO DE UNA TRANSACCIÓN QUE TERMINA EN
// ROLLBACK.
//
// ═══ POR QUÉ LOS TESTS APLICAN EL .sql Y NO SUPONEN QUE YA ESTÁ APLICADO ═══
//
// «Una migración en el repo NO es una migración aplicada» es una trampa ya pagada en esta casa: el
// mensaje de bootstrap es igual al de la falla, y un test que asume el esquema nuevo pasa en verde
// contra el esquema viejo si el que lo mira no chequea. Acá el test LEE los archivos, los EJECUTA
// en su propia transacción y recién entonces afirma. Si el .sql tiene un error de sintaxis, el test
// se pone rojo — que es exactamente lo que un archivo no aplicado tiene que hacer.
//
// Y al terminar hace ROLLBACK: la base viva no se toca. Aplicar de verdad lo decide quien integra.
//
// Se usa el protocolo de consulta simple (`client.query(texto)` sin parámetros), que admite varias
// sentencias en un envío y NO parte el archivo por `;`. Partirlo rompería todo cuerpo `$$ ... $$`.

import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const DIR_MIGRACIONES = join(AQUI, '..', '..', 'supabase', 'migrations')

/** Las migraciones del circuito, en orden. El prefijo es el del encargo: T4000 … T4900. */
export const PREFIJOS_CIRCUITO = /^20260821T4[0-9]00_/

/**
 * Los archivos del circuito, ordenados por nombre — que es el orden de aplicación, porque el
 * timestamp del nombre ES la secuencia.
 *
 * @param {RegExp} [filtro] para aplicar sólo hasta cierta migración en un test acotado.
 */
export async function archivosDelCircuito(filtro = PREFIJOS_CIRCUITO) {
  const todos = await readdir(DIR_MIGRACIONES)
  return todos.filter((f) => f.endsWith('.sql') && filtro.test(f)).sort()
}

/**
 * Aplica las migraciones del circuito sobre un cliente que YA está dentro de una transacción.
 *
 * No abre ni cierra la transacción a propósito: quien llama es el dueño del `begin`/`rollback`, y
 * así el test puede sembrar datos antes y después en el mismo alcance.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ hasta?: string }} [opciones] nombre (o prefijo) de la última migración a aplicar.
 * @returns {Promise<string[]>} los archivos aplicados, en orden.
 */
export async function aplicarMigracionesDelCircuito(client, opciones = {}) {
  const archivos = await archivosDelCircuito()
  const hasta = opciones.hasta ?? null
  const aplicados = []
  for (const archivo of archivos) {
    const sql = await readFile(join(DIR_MIGRACIONES, archivo), 'utf8')
    try {
      await client.query(sql)
    } catch (err) {
      // El nombre del archivo va en el error: sin esto, un fallo de sintaxis en la sexta migración
      // se lee como un fallo del test y hay que ir a buscar cuál fue.
      err.message = `[${archivo}] ${err.message}`
      throw err
    }
    aplicados.push(archivo)
    if (hasta && archivo.startsWith(hasta)) break
  }
  return aplicados
}
