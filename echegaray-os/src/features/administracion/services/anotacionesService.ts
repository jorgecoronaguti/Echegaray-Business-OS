// LEER LAS ANOTACIONES DE UNA PERSONA — y decir la verdad cuando todavía no se pueden leer.
//
// ═══ LA VENTANA QUE HAY QUE ATRAVESAR SIN MENTIR ═══
//
// `20260908T1700_anotaciones_de_la_persona` está en el repositorio y NO en la base: las migraciones
// no las aplica un agente. Mientras dure esa ventana, la ficha tiene que decir que las anotaciones
// no están disponibles, y el formulario no puede aceptar una palabra: el único desenlace
// inaceptable es que alguien escriba «pidió adelanto de quincena», la pantalla conteste «Anotado» y
// no exista ninguna fila. Un dato que se cree guardado y no existe es peor que uno que falta,
// porque nadie lo vuelve a cargar.
//
// El día que se aplique la migración este módulo deja de intervenir solo, sin tocar una línea.
//
// EL PREDICADO DE «LA TABLA NO ESTÁ» SE IMPORTA, NO SE COPIA. Son dos códigos y hacen falta los
// dos —`42P01` de Postgres y `PGRST205` del caché de esquema de PostgREST—; ya está escrito y
// probado en `clientes/services/notaPendiente.ts`. Una segunda copia miraría un código solo el día
// que alguien la toque.

import type { SupabaseClient } from '@supabase/supabase-js'
import { faltaLaTablaDeNotas } from '@/features/clientes/services/notaPendiente'
import type { ServiceResult } from '../types'

export const MIGRACION_ANOTACIONES = '20260908T1700_anotaciones_de_la_persona'

export interface AnotacionDePersona {
  id: string
  texto: string
  creado_en: string
  /** El nombre de quien la escribió. `null` cuando la cuenta ya no existe (`on delete set null`). */
  autor: string | null
}

/** Cuántas se traen. La ficha se abre muchas veces por día y la lista más larga no puede empujar el
 *  resto del Resumen fuera de la pantalla; el tope es alto porque una anotación pesa poco y perder
 *  la más vieja sería perder el motivo por el que existe el bloque. */
export const TOPE_ANOTACIONES = 100

/** Lo que lee una persona al ABRIR la ficha. Es un aviso, no un error: todavía no hay nada roto. */
export function avisoDeAnotacionesPendiente(): string {
  return 'Las anotaciones todavía no están disponibles en esta base: falta aplicar la migración '
    + `${MIGRACION_ANOTACIONES}. Hasta entonces no se puede anotar y no se pierde nada de lo demás.`
}

/** Lo que lee quien INTENTÓ anotar. Dice qué NO pasó —«no guardé nada»— antes que por qué. */
export function mensajeDeAnotacionesPendiente(): string {
  return 'Todavía no puedo guardar anotaciones: falta aplicar en la base la migración '
    + `${MIGRACION_ANOTACIONES}. No guardé nada.`
}

export type LecturaAnotaciones = ServiceResult<AnotacionDePersona[]> & {
  /** Cuando la tabla no existe: el texto del aviso. `null` cuando sí existe. */
  pendiente: string | null
}

/**
 * LAS ANOTACIONES DE ESTA PERSONA, LA ÚLTIMA ARRIBA.
 *
 * El autor viene por el `references` a `perfiles`: PostgREST lo embebe y así el nombre sale de la
 * misma consulta, sin una segunda vuelta por cada fila. `perfiles` es legible por cualquier
 * `authenticated` desde 2026-07-08 —«no hay dato sensible acá»—, así que el join no abre nada nuevo.
 *
 * QUIÉN PUEDE LEER LO DECIDE LA RLS, no este archivo: para `campo` la consulta devuelve cero filas
 * aunque alguien llame a esta función. La pantalla además no dibuja el bloque.
 */
export async function getAnotaciones(
  supabase: SupabaseClient,
  personaId: string,
): Promise<LecturaAnotaciones> {
  const { data, error } = await supabase
    .from('persona_nota')
    .select('id, texto, creado_en, perfiles:creado_por (nombre)')
    .eq('persona_id', personaId)
    .order('creado_en', { ascending: false })
    .limit(TOPE_ANOTACIONES)

  if (error) {
    if (faltaLaTablaDeNotas(error)) {
      // La tabla no está: NO es un error de la ficha. Se devuelve lista vacía con el aviso, para
      // que el resto del Resumen se siga leyendo normalmente.
      return { data: [], error: null, pendiente: avisoDeAnotacionesPendiente() }
    }
    return { data: null, error: error.message, pendiente: null }
  }

  const filas = (data ?? []) as unknown as Array<{
    id: string
    texto: string
    creado_en: string
    // PostgREST devuelve el embebido como objeto cuando la relación es muchos-a-uno, pero lo tipa
    // como arreglo en varios de sus modos. Se contemplan los dos: un `any` acá escondería el día
    // que devuelva la otra forma y el autor aparecería vacío en todas las filas.
    perfiles: { nombre: string | null } | { nombre: string | null }[] | null
  }>

  return {
    data: filas.map((f) => ({
      id: f.id,
      texto: f.texto,
      creado_en: f.creado_en,
      autor: (Array.isArray(f.perfiles) ? f.perfiles[0]?.nombre : f.perfiles?.nombre) ?? null,
    })),
    error: null,
    pendiente: null,
  }
}
