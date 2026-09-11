// LAS DOS LECTURAS QUE LA SOLAPA «HORAS» PEDÍA DOS VECES, EN EL MISMO RENDER.
//
// ═══ LO MEDIDO (11/09/2026, `PERF_TRAZA=1` sobre `/administracion/personas?vista=liquidacion&solapa=horas`) ═══
//
// La solapa dispara `getDatosDeLaSolapaHoras()` y `getLiquidacionDeLaQuincena()` en el MISMO
// `Promise.all` (`SolapaHoras.tsx`), y dos de sus lecturas son idénticas —misma tabla, mismas
// columnas, misma ventana—:
//
//     asistencia_dia  (persona_id, fecha, estado, motivo)  entre q.desde y q.hasta    2 viajes, 5,9 KB
//     persona_legajo  (id, cuil)                                                      2 viajes, 5,4 KB
//
// No son «casi iguales»: son la misma consulta escrita en dos archivos. El costo no es el plan
// —ninguna de las dos llega a 25 ms— sino el VIAJE: cada consulta de PostgREST puede caer en un
// backend nuevo del pool y pagar el arranque en frío por conexión (~800 ms la primera vez que un
// backend ve las vistas anidadas del OS, ver `postgrest-arranque-en-frio-por-conexion`).
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No unifica las lecturas que sólo se PARECEN. `persona_directorio`, `persona_tarifa`,
// `nomina_adelanto` y `liquidacion_quincena` también salen dos veces, pero con juegos de columnas
// distintos porque cada pantalla dibuja cosas distintas; fusionarlas obligaría a una de las dos a
// pedir columnas que no usa, o a que un cambio en una arrastre a la otra. Y `registros_hh` sale
// tres veces a propósito: son tres VENTANAS distintas, y la tercera es la paginación de
// `registrosHHService.ts`, que paga un viaje de cierre por diseño declarado.
//
// ═══ POR QUÉ MEMORIZA LA PROMESA Y NO EL RESULTADO ═══
//
// Las dos llamadas salen CONCURRENTES desde el mismo `Promise.all`. Guardando el resultado, la
// segunda no encuentra nada registrado todavía y larga su propio viaje: el ahorro sería cero. Es la
// misma razón —y la misma función `recordar`— que ya usa `getPerfilActual`.
//
// `cache()` de React no memoriza fuera de un request, y ése es el modo de fallo BUENO: sin scope de
// React esto se comporta exactamente como el código que reemplaza, nunca compartiendo de más.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordar } from '../../auth/services/authService.ts'

/** `{ data, error }` crudo de PostgREST: los dos llamadores lo consumen tal cual venía.
 *
 *  `code` VIAJA. `liquidacionQuincenaService` lo mira (`sinTabla()`) para distinguir «la tabla
 *  todavía no existe» de «no pude leer»: perderlo acá convertiría una migración pendiente en un
 *  error rojo en pantalla. Un intermediario que se come un campo del error es un intermediario que
 *  cambia el comportamiento. */
type Lectura<T> = { data: T[] | null; error: { code?: string; message: string } | null }

export type FilaPresencia = { persona_id: string; fecha: string; estado: string; motivo: string | null }
export type FilaCuil = { id: string; cuil: string | null }

const memoPresencias = cache((): Map<string, Promise<Lectura<FilaPresencia>>> => new Map())
const memoCuiles = cache((): Map<string, Promise<Lectura<FilaCuil>>> => new Map())

/**
 * LA PRESENCIA DECLARADA DE LA QUINCENA (`asistencia_dia`), una vez por request y por ventana.
 *
 * La clave es la ventana: dos quincenas distintas son dos lecturas distintas, y compartirlas sería
 * dibujar la asistencia de un período sobre otro.
 */
export function leerPresenciasDeLaQuincena(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<Lectura<FilaPresencia>> {
  return recordar(memoPresencias(), `${desde}|${hasta}`, async () => {
    const { data, error } = await supabase.from('asistencia_dia')
      .select('persona_id, fecha, estado, motivo').gte('fecha', desde).lte('fecha', hasta)
    return { data: (data ?? null) as FilaPresencia[] | null, error }
  })
}

/**
 * LOS CUIL DEL LEGAJO (`persona_legajo`), una vez por request.
 *
 * Sin ventana: es el padrón entero, y las dos pantallas piden exactamente las mismas dos columnas.
 * `persona_legajo` es la vista CON PORTERO —el único camino de la web a ese campo—, así que
 * compartir la lectura no comparte ningún permiso: lo que la RLS le negó a quien pregunta, se lo
 * niega una vez en lugar de dos.
 */
export function leerCuilesDelLegajo(supabase: SupabaseClient): Promise<Lectura<FilaCuil>> {
  return recordar(memoCuiles(), 'persona_legajo(id,cuil)', async () => {
    const { data, error } = await supabase.from('persona_legajo').select('id, cuil')
    return { data: (data ?? null) as FilaCuil[] | null, error }
  })
}
