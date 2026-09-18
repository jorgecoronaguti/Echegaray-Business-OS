// QUÉ COLUMNAS DE `compra_sheet` TIENE QUE REFRESCAR EL ESPEJO — y por qué se aborta si falta una.
//
// ═══ EL RIESGO QUE ESTO CIERRA (18/09/2026) ═══
//
// Desde hoy `sync-compras.mjs` escribe el espejo por `insert … on conflict (fila) do update set …` en
// vez de `delete` + `insert`, para que la fila NUNCA desaparezca mientras corre (las RPC de la app
// hacen `select … for update` y sobre una fila borrada contestan «esa fila ya no está en Compras»).
//
// El upsert es correcto sólo mientras las columnas que se escriben sean TODAS las columnas vivas de la
// tabla. Con `delete` + `insert`, una columna que el sync no escribiera quedaba en su default —un
// hueco visible—. Con upsert queda el valor de la corrida anterior, pegado a un número de fila que
// puede haber cambiado de compra: el dato de la compra de ayer publicado como si fuera el de la de
// hoy. Es peor que un hueco, porque nadie lo ve.
//
// Por eso esto no es un aviso: es un freno, del mismo tipo que el `contratoDeColumnas` que aborta
// nombrando el rótulo que falta. Una columna nueva se agrega a `CAMPOS`/`CAMPOS_OBRA` del sync —o se
// declara acá si a propósito no la escribe el espejo— y recién entonces la corrida sigue.

// ═══ CON LA MIGRACIÓN DE OBRA A MEDIO APLICAR, ESTO DETIENE EL SYNC ═══
//
// `hayObraPorFila` exige las CUATRO columnas de `20260915T0700` para dar por aplicada la migración. Si
// existieran sólo algunas —una migración cortada a la mitad—, daría `false`, el sync compararía contra
// `CAMPOS` a secas y este freno encontraría las columnas de obra sin cubrir y ABORTARÍA, en vez de
// degradar a modo legado como hace el resto del archivo. Es a propósito: escribir el espejo ignorando
// una columna de obra que YA EXISTE la dejaría con el valor de la corrida anterior, que es justo lo que
// esto existe para impedir. Una migración a medio aplicar se termina de aplicar; no se trabaja encima.
//
/**
 * Las columnas que el espejo NO escribe A PROPÓSITO y por eso no tienen que estar en `CAMPOS`.
 *
 *   · `fila` es la PK: es la clave del `on conflict`, no algo que se refresque.
 *   · `sincronizado_en` la pone el propio upsert con `now()`.
 */
export const NO_LAS_ESCRIBE_EL_ESPEJO = Object.freeze(['fila', 'sincronizado_en'])

/**
 * Las columnas vivas de la tabla que el upsert dejaría sin refrescar. Vacío = el espejo la reescribe
 * entera y el upsert es equivalente a borrar e insertar.
 *
 * @param {string[]} columnasVivas lo que dice `information_schema` HOY (no lo que dice una migración:
 *        una migración en el repo no es una migración aplicada).
 * @param {string[]} campos las columnas que el sync escribe.
 */
export function columnasSinRefrescar(columnasVivas = [], campos = []) {
  const cubiertas = new Set([...campos, ...NO_LAS_ESCRIBE_EL_ESPEJO])
  return columnasVivas.filter((c) => !cubiertas.has(c))
}

/** El mensaje del freno, con los nombres adentro: sin ellos nadie sabe qué agregar. */
export function porQueNoEscribo(faltantes = []) {
  return `compra_sheet tiene ${faltantes.length} columna(s) que el espejo no escribe (${faltantes.join(', ')}). `
    + 'El upsert les dejaría el valor de la corrida anterior bajo un número de fila que pudo cambiar de compra. '
    + 'Agregalas a CAMPOS/CAMPOS_OBRA de sync-compras.mjs o a NO_LAS_ESCRIBE_EL_ESPEJO si el espejo no las escribe a propósito. NO toco nada.'
}

/** Las columnas vivas de `compra_sheet`, tal como están en la base ahora. */
export async function columnasVivasDeCompraSheet(q) {
  const { rows } = await q(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'compra_sheet' order by ordinal_position`)
  return (rows ?? []).map((r) => r.column_name)
}
