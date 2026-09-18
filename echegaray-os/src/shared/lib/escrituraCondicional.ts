// LA CELDA SE ESCRIBE SÓLO SI SIGUE SIENDO LA QUE ESTA PERSONA VIO — y eso se decide DENTRO del `update`.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR (18/09/2026) ═══
//
// La primera corrección del deshacer leía la celda, la comparaba con `esperado` y después escribía. Entre la
// lectura y la escritura hay una ventana: dos personas que deshacen la misma celda en el mismo instante leen
// las dos lo mismo, las dos pasan el control, y la segunda pisa a la primera. Es «una escritura cambió lo que
// otra persona había cargado» con otro disfraz — exactamente lo que la regla de la casa prohíbe.
//
// La comparación viaja por eso en el `where` del propio `update`:
//
//     update … set campo = <nuevo> where <clave> = … and campo = <esperado>
//
// Postgres evalúa la condición y escribe en la misma sentencia: no hay ventana. Si tocó CERO filas, la celda ya
// no es la que se vio (o la fila no está), y se responde el mismo conflicto de siempre. `''` no se filtra con
// `= ''` sino con `is null`, porque el vacío se guarda como NULL en todas estas columnas — es lo que escriben
// estas mismas acciones (`valor || null`).
//
// COMPRAS NO PASA POR ACÁ, Y NO LE FALTA NADA: `asignarObraDeCompra` entra por la RPC `compra_obra_asignar`,
// que hace esta misma comprobación adentro de la base (migración 20260915T0700). Duplicarla acá sería una
// segunda definición de la misma regla.
//
// LO QUE ESTA PRIMITIVA NO DISTINGUE: una fila que la RLS no deja escribir también da cero filas, y se
// informa como conflicto. Es conservador —no se pierde ningún dato— pero el mensaje puede no ser el exacto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { MENSAJE_CONFLICTO, valorParaElFiltro } from './pilaDeDeshacer.ts'

export type ResultadoCondicional =
  | { estado: 'escrito' }
  /** La celda ya no es la que se vio: otra mano la cambió. */
  | { estado: 'conflicto'; error: string }
  /** La fila no existe (se borró entre la edición y el deshacer). */
  | { estado: 'no_existe' }
  | { estado: 'error'; error: string }

/**
 * ESCRIBE `cambios` SÓLO SI `campo` TODAVÍA VALE `esperado`.
 *
 * `donde` son las igualdades que identifican la fila (una o varias columnas: `cliente_documento` se identifica
 * por las dos). `tipo` es el de la columna comparada, para que «123,5» y 123.5 sean el mismo valor.
 */
export async function actualizarSiSigueIgual(
  supabase: SupabaseClient,
  opciones: {
    tabla: string
    donde: Record<string, string>
    campo: string
    esperado: string
    tipo?: 'texto' | 'numero'
    cambios: Record<string, unknown>
  },
): Promise<ResultadoCondicional> {
  const { tabla, donde, campo, esperado, tipo = 'texto', cambios } = opciones
  const exigido = valorParaElFiltro(esperado, tipo)

  // UN ESPERADO QUE NO ES UN NÚMERO no lo puede cumplir ninguna fila: no se intenta escribir. Sin esta rama, el
  // filtro viajaría como `eq.NaN` y la base contestaría un error de tipo en vez del conflicto que corresponde.
  if (typeof exigido === 'number' && !Number.isFinite(exigido)) {
    return { estado: 'conflicto', error: MENSAJE_CONFLICTO }
  }

  let escritura = supabase.from(tabla).update(cambios, { count: 'exact' })
  for (const [columna, valor] of Object.entries(donde)) escritura = escritura.eq(columna, valor)
  escritura = exigido === null ? escritura.is(campo, null) : escritura.eq(campo, exigido)

  const { error, count } = await escritura
  if (error) return { estado: 'error', error: error.message }
  if ((count ?? 0) > 0) return { estado: 'escrito' }

  // CERO FILAS. La escritura ya fue atómica: esta lectura no decide nada, sólo elige el mensaje —«la cambió
  // otra persona» o «ya no existe»—, que son dos cosas distintas para quien está mirando la pantalla.
  let lectura = supabase.from(tabla).select(campo)
  for (const [columna, valor] of Object.entries(donde)) lectura = lectura.eq(columna, valor)
  const { data } = await lectura.limit(1)
  return (data?.length ?? 0) > 0
    ? { estado: 'conflicto', error: MENSAJE_CONFLICTO }
    : { estado: 'no_existe' }
}
