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
// ═══ CERO FILAS NO SIEMPRE ES «LA CAMBIÓ OTRA PERSONA» (auditoría, 18/09/2026) ═══
//
// Una fila que la RLS no deja escribir también devuelve cero filas. Decir ahí «la celda la cambió otra persona»
// es el OS afirmando un hecho que no comprobó, y eso se paga en confianza mucho más caro que un mensaje vago.
// Por eso, cuando el `update` no toca nada, se relee la fila y se decide con evidencia:
//
//   · no se puede leer          → `no_visible`  («no está, o no la ves»)
//   · se lee y NO es la esperada → `conflicto`   (verificado: alguien la cambió)
//   · se lee y SÍ es la esperada → `sin_certeza` (el update no la tomó por otra razón: permiso, o un vacío
//                                  guardado como cadena que el filtro `is null` no encuentra). No se afirma nada.

import type { SupabaseClient } from '@supabase/supabase-js'
import { MENSAJE_CONFLICTO, coincideConLoEsperado, valorParaElFiltro } from './pilaDeDeshacer.ts'

/** Lo que se dice cuando la escritura no entró y NO se pudo comprobar por qué. No afirma quién la cambió. */
export const MENSAJE_SIN_CERTEZA = 'no se pudo escribir esa celda: puede que no tengas permiso. No se cambió nada.'

export type ResultadoCondicional =
  | { estado: 'escrito'; filas: Record<string, unknown>[] }
  /** COMPROBADO: se leyó la celda y ya no es la que esta persona vio. */
  | { estado: 'conflicto'; error: string }
  /** La fila no existe, o esta sesión no la ve. */
  | { estado: 'no_existe' }
  /** No entró y la celda sigue siendo la esperada: no se sabe por qué, y no se inventa. */
  | { estado: 'sin_certeza'; error: string }
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
    /**
     * LA FILA TODAVÍA NO EXISTE Y HAY QUE CREARLA (Liquidación: la línea nace con la primera corrección). Se
     * intenta el alta sólo cuando lo esperado es vacío, que es lo único compatible con «no había fila». El
     * alta es igual de atómica que el update: si otra mano la creó en el medio, la clave única la rebota
     * (23505) y eso ES el conflicto. Nunca un `upsert`, que pisaría sin preguntar.
     */
    crearSiFalta?: Record<string, unknown>
    /** Columnas a devolver de lo escrito, para que quien llama verifique el efecto contra la base. */
    seleccionar?: string
  },
): Promise<ResultadoCondicional> {
  const { tabla, donde, campo, esperado, tipo = 'texto', cambios, crearSiFalta, seleccionar } = opciones
  const exigido = valorParaElFiltro(esperado, tipo)

  // UN ESPERADO QUE NO ES UN NÚMERO no lo puede cumplir ninguna fila: no se intenta escribir. Sin esta rama, el
  // filtro viajaría como `eq.NaN` y la base contestaría un error de tipo en vez del conflicto que corresponde.
  if (typeof exigido === 'number' && !Number.isFinite(exigido)) {
    return { estado: 'conflicto', error: MENSAJE_CONFLICTO }
  }

  let escritura = supabase.from(tabla).update(cambios, { count: 'exact' })
  for (const [columna, valor] of Object.entries(donde)) escritura = escritura.eq(columna, valor)
  escritura = exigido === null ? escritura.is(campo, null) : escritura.eq(campo, exigido)

  const { data: escritas, error, count } = await escritura.select(seleccionar ?? campo)
  if (error) return { estado: 'error', error: error.message }
  if ((count ?? 0) > 0) return { estado: 'escrito', filas: (escritas ?? []) as unknown as Record<string, unknown>[] }

  // LA FILA NO EXISTÍA. El alta lleva la clave única como testigo: dos altas a la vez, una sola gana.
  if (crearSiFalta && exigido === null) {
    const { data: creadas, error: eAlta } = await supabase
      .from(tabla).insert({ ...crearSiFalta, ...cambios }).select(seleccionar ?? campo)
    if (!eAlta) return { estado: 'escrito', filas: (creadas ?? []) as unknown as Record<string, unknown>[] }
    // 23505 = clave duplicada: alguien la creó entre el update y el insert. Es el conflicto, comprobado.
    if (eAlta.code === '23505') return { estado: 'conflicto', error: MENSAJE_CONFLICTO }
    return { estado: 'error', error: eAlta.message }
  }

  // CERO FILAS. La escritura ya fue atómica: esta lectura no decide si se escribe, sólo QUÉ SE DICE — y no se
  // dice nada que no se haya comprobado.
  let lectura = supabase.from(tabla).select(campo)
  for (const [columna, valor] of Object.entries(donde)) lectura = lectura.eq(columna, valor)
  const { data, error: eLectura } = await lectura.limit(1)
  const fila = (data ?? [])[0] as unknown as Record<string, unknown> | undefined
  if (eLectura || !fila) return { estado: 'no_existe' }
  return coincideConLoEsperado(fila[campo], esperado)
    ? { estado: 'sin_certeza', error: MENSAJE_SIN_CERTEZA }
    : { estado: 'conflicto', error: MENSAJE_CONFLICTO }
}
