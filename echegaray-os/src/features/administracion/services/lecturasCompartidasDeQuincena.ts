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
//
// ═══ DOS LÍMITES, DECLARADOS (auditoría de cierre, 11/09/2026) ═══
//
//   · EL CLIENTE NO ENTRA EN LA CLAVE. Hay UNO por request, así que hoy no muerde; un futuro
//     llamador que use `service_role` en el mismo request recibiría lo que leyó el cliente del
//     usuario. El día que eso exista, la clave tiene que incluir de qué cliente sale la lectura.
//   · NINGUNA DE LAS DOS PAGINA. `registrosHHService.ts` existe porque PostgREST corta en
//     `db-max-rows` (1.000 filas) sin avisar. Acá no se agregó `.range()` a propósito: medido el
//     11/09/2026, `asistencia_dia` tiene 54 filas en el mes más cargado de toda la base y el
//     padrón de `persona_legajo` son decenas — paginar costaría el viaje de cierre de cada página,
//     que es exactamente el viaje que este archivo vino a sacar. Si alguna de las dos se acerca al
//     millar, la paginación entra ACÁ y no en cada pantalla.

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

export type FilaPresencia = {
  persona_id: string; fecha: string; estado: string; motivo: string | null
  /** La marca de tardanza (20260915T2220). Ausente mientras la migración no esté aplicada: se lee como `false`. */
  llego_tarde?: boolean; salio_antes?: boolean
}
export type FilaCuil = { id: string; cuil: string | null }
export type FilaSubcontrato = { id: string; subcontrato_id: string | null }

const memoPresencias = cache((): Map<string, Promise<Lectura<FilaPresencia>>> => new Map())
const memoCuiles = cache((): Map<string, Promise<Lectura<FilaCuil>>> => new Map())
const memoSesionDePrueba = cache((): Map<string, Promise<boolean>> => new Map())
const memoSubcontratos = cache((): Map<string, Promise<Lectura<FilaSubcontrato>>> => new Map())

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
    // LA TARDANZA VIAJA SI LA BASE LA TIENE: sin `20260915T2220` aplicada se relee sin ella, para que
    // Liquidación y Horas no queden rotas por una migración pendiente. Sin columna nadie pudo marcar.
    const leer = (campos: string) => supabase.from('asistencia_dia').select(campos).gte('fecha', desde).lte('fecha', hasta)
    let { data, error } = await leer('persona_id, fecha, estado, motivo, llego_tarde, salio_antes')
    if (error && (error.code === '42703' || error.code === 'PGRST204' || /llego_tarde|salio_antes/i.test(error.message))) {
      ;({ data, error } = await leer('persona_id, fecha, estado, motivo'))
    }
    return { data: (data ?? null) as unknown as FilaPresencia[] | null, error }
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

/**
 * ¿QUIEN ABRIÓ LA PANTALLA ES UNA IDENTIDAD DE PRUEBA? Una vez por request.
 *
 * La contesta la BASE (`sesion_es_de_prueba()`, migración `20260912T1200`) y no el código, porque es
 * la MISMA función que filtra `persona_directorio`, `persona_legajo` y `persona_plantel`: preguntarlo
 * acá por otro camino —leer `perfiles` a mano— sería una segunda definición de quién es una cuenta de
 * prueba, y el día que las dos no coincidan la pantalla mostraría una lista y la base otra.
 *
 * SIN LA MIGRACIÓN APLICADA la RPC no existe y esto devuelve `false`: exactamente el comportamiento
 * de antes del cambio. Falla cerrado y en silencio a propósito —no es un error de pantalla— porque
 * «no pude preguntar» y «no es una cuenta de prueba» llevan al mismo lado seguro: esconder.
 */
export function laSesionEsDePrueba(supabase: SupabaseClient): Promise<boolean> {
  return recordar(memoSesionDePrueba(), 'sesion_es_de_prueba', async () => {
    const { data, error } = await supabase.rpc('sesion_es_de_prueba')
    return error ? false : data === true
  })
}

/**
 * QUIÉN ES DE LA CUADRILLA DE UN SUBCONTRATISTA (`persona_directorio.subcontrato_id`, 20260915T0910), una vez por request.
 *
 * Va APARTE de las lecturas del directorio que ya existen, y no sumado a sus `select`, por el orden de despliegue: sin
 * la migración aplicada la columna no existe, y pedirla junto con el resto haría fallar la lectura ENTERA del plantel.
 * Así, sin la migración la respuesta es «column does not exist», que `sinTabla()` de los llamadores ya trata como
 * «todavía no está», y el plantel queda exactamente como antes.
 */
export function leerSubcontratoDePersonas(supabase: SupabaseClient): Promise<Lectura<FilaSubcontrato>> {
  return recordar(memoSubcontratos(), 'persona_directorio(id,subcontrato_id)', async () => {
    const { data, error } = await supabase.from('persona_directorio').select('id, subcontrato_id').not('subcontrato_id', 'is', null)
    return { data: (data ?? null) as FilaSubcontrato[] | null, error }
  })
}

/** `persona_id → subcontrato_id` de una lectura; vacía si la lectura falló. */
export function subcontratoPorPersona(l: Lectura<FilaSubcontrato>): Map<string, string> {
  return new Map((l.data ?? []).filter((f) => f.subcontrato_id).map((f) => [f.id, f.subcontrato_id as string]))
}
