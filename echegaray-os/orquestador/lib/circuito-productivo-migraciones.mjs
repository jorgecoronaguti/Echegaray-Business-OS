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

/**
 * Las migraciones del circuito, en orden. El encargo asignó T4000 … T4900.
 *
 * Y la banda T5xxx de otro frente, que hay que aplicar EN EL MEDIO: `20260821T5450` reescribe dos de
 * los mismos objetos —`obra_actividad_control` y `convertir_partida_a_plan`— y `20260822T1000` es la
 * que los reconcilia. Si el test aplicara sólo las 4xxx, mediría un estado que en producción no va a
 * existir nunca, y el pisado silencioso de la conversión pasaría en verde.
 */
export const PREFIJOS_CIRCUITO = /^20260821T4[0-9]00_|^20260821T5450_|^20260822T1000_/

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
  // ═══ LAS DOS ÉPOCAS DEL MISMO TEST (22/08/2026) ═══
  //
  // Antes de la integración, la base no tenía el circuito y el test APLICABA los .sql en su
  // transacción — así medía que los archivos fueran ejecutables. Después de la integración las
  // migraciones VIVEN en la base, y re-aplicarlas acá revienta («ya existe» / «cannot drop columns
  // from view»): el mismo test pasó a medir un mundo que ya no existe. Desde entonces: si el
  // circuito completo ya está vivo (el centinela es el ÚLTIMO objeto de la cadena, la vista
  // `actividad_horas` de 20260822T1000, más `parametro_comercial` de T4300), no se aplica nada y
  // las aserciones corren contra el esquema REAL — que es la regla de la casa: verificar objetos en
  // la base, no en migrations/. Si el circuito NO está (una base nueva, un entorno de prueba), se
  // aplica como siempre. En ningún caso un esquema a medias pasa en silencio: sin centinela y con
  // un .sql roto, el test se pone rojo igual que antes.
  const centinela = await client.query(
    "select to_regclass('public.actividad_horas') as vista, to_regclass('public.parametro_comercial') as tabla",
  )
  if (centinela.rows[0].vista && centinela.rows[0].tabla) return []

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
