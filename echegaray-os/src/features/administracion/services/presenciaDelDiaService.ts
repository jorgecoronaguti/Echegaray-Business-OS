// LO QUE YA ESTÁ DECLARADO — la lectura de `asistencia_dia`.
//
// La REGLA no vive acá: qué significa cada estado y qué se puede escribir lo decide
// `presenciaDelDia.ts`. Acá sólo se traen filas.
//
// Quién ve qué tampoco se decide acá: `asistencia_dia` tiene RLS (`es_administracion()` o
// `persona_id = mi_persona_id()`). Repetir el alcance en TypeScript sería una segunda definición
// que además no protege una llamada directa a PostgREST.
//
// ═══ POR QUÉ LA LECTURA TOLERA QUE LA TABLA NO EXISTA ═══
//
// La migración la aplica el dueño, no este código, y hasta que la aplique PostgREST responde
// «relation "public.asistencia_dia" does not exist». Sin este trato, TODA la carga de asistencia
// —incluida la de horas, que no tiene nada que ver— quedaría rota en producción hasta que alguien
// corra el SQL. `sinTabla` distingue ese caso de un error real de permisos, que sí se muestra:
// una lista vacía porque la RLS rechazó la consulta es indistinguible de un día sin marcar, y la
// diferencia entre las dos es todo.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { EstadoPresencia, PresenciaGuardada } from './presenciaDelDia'
import {
  planDeDeclaracion, seRetiraLaPresencia,
  type DeclaracionPedida, type PresenciaEnLaBase,
} from './presenciaPorHoras'

interface FilaCruda {
  persona_id: string
  estado: string
  motivo: string | null
}

/** Postgres 42P01 = undefined_table. Es el único error que se trata como «todavía no existe». */
const sinTabla = (error: { code?: string; message: string }): boolean =>
  error.code === '42P01' || /asistencia_dia.*does not exist/i.test(error.message)

const ESTADOS: readonly string[] = ['presente', 'ausente', 'licencia']

/** La presencia declarada de una obra y un día. Vacío = nadie marcó nada todavía. */
export async function getPresenciaDelDia(
  supabase: SupabaseClient, fecha: string, obraId?: string | null,
): Promise<ServiceResult<PresenciaGuardada[]>> {
  let consulta = supabase.from('asistencia_dia').select('persona_id, estado, motivo').eq('fecha', fecha)
  if (obraId) consulta = consulta.eq('obra_canonica_id', obraId)
  const { data, error } = await consulta
  if (error) return sinTabla(error) ? { data: [], error: null } : { data: null, error: error.message }
  return {
    data: ((data ?? []) as FilaCruda[])
      // UN ESTADO QUE LA PANTALLA NO SABE DIBUJAR NO SE DIBUJA. El CHECK de la tabla ya lo impide;
      // esto es la segunda cerradura, para que un dato cargado por script no rompa la grilla.
      .filter((f) => ESTADOS.includes(f.estado))
      .map((f) => ({
        persona_id: f.persona_id,
        estado: f.estado as EstadoPresencia,
        motivo: f.motivo,
      })),
    error: null,
  }
}

/** Un día declarado de una persona, tal como lo necesita la franja de la quincena de su ficha. */
export interface PresenciaDeUnDia {
  fecha: string
  estado: EstadoPresencia
  motivo: string | null
}

/**
 * LO DECLARADO DE UNA PERSONA EN UNA VENTANA — la fuente que le faltaba a la franja de la ficha.
 *
 * La franja dibujaba sólo `registros_hh`: un día declarado ausente por el jefe y todavía sin horas
 * cargadas se veía «sin registrar», que es el gris de «nadie cargó» y NO de «no vino». Son dos
 * hechos distintos y la celda los distingue desde el 08/09/2026; lo que faltaba era traerle el dato.
 *
 * Se pide por persona y por ventana —no la tabla entera— porque es lo que dibuja el bloque, y la
 * RLS de `asistencia_dia` recorta igual: Administración ve todo, la persona ve lo suyo.
 */
export async function getPresenciaDePersona(
  supabase: SupabaseClient, personaId: string, desde: string, hasta: string,
): Promise<ServiceResult<PresenciaDeUnDia[]>> {
  const { data, error } = await supabase
    .from('asistencia_dia').select('fecha, estado, motivo')
    .eq('persona_id', personaId).gte('fecha', desde).lte('fecha', hasta)
  if (error) return sinTabla(error) ? { data: [], error: null } : { data: null, error: error.message }
  return {
    data: ((data ?? []) as { fecha: string; estado: string; motivo: string | null }[])
      .filter((f) => ESTADOS.includes(f.estado))
      .map((f) => ({
        fecha: f.fecha.slice(0, 10),
        estado: f.estado as EstadoPresencia,
        motivo: f.motivo,
      })),
    error: null,
  }
}

// ═══ LA ESCRITURA DE `asistencia_dia` QUE USAN LAS PUERTAS DE HORAS ═══
//
// Vive acá y no en `presenciaDelDiaActions.ts` por una razón mecánica y una de fondo. La mecánica:
// un archivo `'use server'` sólo exporta funciones async y no se puede importar desde otra acción
// sin arrastrar su `revalidatePath`. La de fondo: el upsert es UNA sola definición, y las tres
// puertas de horas —el formulario del celular, la grilla y el panel— tienen que escribir la misma
// fila de la misma forma. Dos upserts distintos discrepan el día que alguien toca uno.
//
// PENDIENTE DECLARADO: `guardarPresencia` (la pantalla móvil) todavía tiene su propio upsert
// inline. Es la MISMA escritura y hay que unificarla contra `declararPresencia`; no se hizo en este
// trabajo porque ese archivo lo estaba editando otra rama al mismo tiempo.

/** La columna `origen` la agrega `20260908T2300_asistencia_dia_origen.sql`, que aplica el dueño.
 *  Hasta entonces PostgREST no la conoce y hay que escribir y leer sin ella. */
const sinColumnaOrigen = (error: { code?: string; message: string }): boolean =>
  error.code === '42703' || error.code === 'PGRST204' || /origen/i.test(error.message)

export interface ResultadoDeclaracion {
  escritas: number
  /** Lo que no se escribió y por qué. Nunca se omite en silencio. */
  omitidas: { persona_id: string; fecha: string; porque: string }[]
  error: string | null
}

/**
 * DECLARAR PRESENCIA — la única escritura de `asistencia_dia` fuera de la pantalla móvil.
 *
 * Lee lo guardado, aplica `planDeDeclaracion` (una `'horas'` no pisa una `'declarada'`) y hace un
 * único upsert. `marcado_por` y `marcado_en` los sella el trigger de la base, nunca el cliente.
 *
 * ═══ NO PUEDE ROMPER LA CARGA DE HORAS ═══
 *
 * Si la tabla o la columna todavía no existen, esto devuelve `escritas: 0` y NO un error: las horas
 * ya se escribieron y son el hecho principal. Un error acá dejaría a la grilla diciendo que falló
 * una carga que sí entró — el defecto peor de los dos.
 */
export async function declararPresencia(
  supabase: SupabaseClient, pedidas: readonly DeclaracionPedida[],
): Promise<ResultadoDeclaracion> {
  if (pedidas.length === 0) return { escritas: 0, omitidas: [], error: null }

  const previas = await presenciaGuardadaDe(supabase, pedidas)
  if (previas.error !== null) return { escritas: 0, omitidas: [], error: previas.error }

  const plan = planDeDeclaracion(pedidas, previas.data)
  if (plan.escribir.length === 0) return { escritas: 0, omitidas: plan.omitidas, error: null }

  const fila = (p: DeclaracionPedida, conOrigen: boolean) => ({
    persona_id: p.persona_id,
    fecha: p.fecha,
    obra_canonica_id: p.obra_canonica_id,
    estado: p.estado,
    motivo: p.motivo,
    ...(conOrigen ? { origen: p.origen } : {}),
  })

  let escrito = await supabase.from('asistencia_dia')
    .upsert(plan.escribir.map((p) => fila(p, true)), { onConflict: 'persona_id,fecha' })
    .select('persona_id')
  if (escrito.error && sinColumnaOrigen(escrito.error)) {
    // SIN LA COLUMNA, LA FILA NACE `'declarada'` (el default). Se escribe igual: que el dueño no
    // haya aplicado todavía la migración no puede dejar el Plantel diciendo «sin marcar».
    escrito = await supabase.from('asistencia_dia')
      .upsert(plan.escribir.map((p) => fila(p, false)), { onConflict: 'persona_id,fecha' })
      .select('persona_id')
  }
  if (escrito.error) {
    return sinTabla(escrito.error)
      ? { escritas: 0, omitidas: plan.omitidas, error: null }
      : { escritas: 0, omitidas: plan.omitidas, error: escrito.error.message }
  }
  return { escritas: (escrito.data ?? []).length, omitidas: plan.omitidas, error: null }
}

/**
 * RETIRAR LA PRESENCIA QUE PRODUJERON LAS HORAS, cuando esas horas se borraron y el día quedó
 * vacío. Sólo `origen='horas'`: una declaración explícita no se toca (`seRetiraLaPresencia`).
 *
 * El `delete` está acotado por `origen` también en el WHERE, no sólo en la decisión de TypeScript:
 * la policy de la base es la que decide de verdad, y sin el filtro una llamada directa borraría lo
 * declarado por el jefe.
 */
export async function retirarPresenciaPorHoras(
  supabase: SupabaseClient, personaId: string, fecha: string, quedanRegistros: boolean,
): Promise<{ retiradas: number; error: string | null }> {
  const previas = await presenciaGuardadaDe(supabase, [{ persona_id: personaId, fecha }])
  if (previas.error !== null) return { retiradas: 0, error: previas.error }
  const previa = previas.data.find((p) => p.persona_id === personaId && p.fecha === fecha) ?? null
  if (!seRetiraLaPresencia(previa, quedanRegistros)) return { retiradas: 0, error: null }

  const { data, error } = await supabase.from('asistencia_dia')
    .delete().eq('persona_id', personaId).eq('fecha', fecha).eq('origen', 'horas')
    .select('id')
  // NO SE RETIRA A LA FUERZA. Sin policy de delete o sin la columna, la fila queda: decir que se
  // retiró algo que sigue ahí sería peor que dejarla.
  if (error) return { retiradas: 0, error: sinTabla(error) || sinColumnaOrigen(error) ? null : error.message }
  return { retiradas: (data ?? []).length, error: null }
}

/** Lo guardado para esas (persona, fecha), con su origen cuando la columna existe. */
async function presenciaGuardadaDe(
  supabase: SupabaseClient, pedidas: readonly { persona_id: string; fecha: string }[],
): Promise<{ data: PresenciaEnLaBase[]; error: string | null }> {
  const personas = [...new Set(pedidas.map((p) => p.persona_id))]
  const fechas = pedidas.map((p) => p.fecha).sort()
  const leer = (campos: string) => supabase.from('asistencia_dia')
    .select(campos).in('persona_id', personas)
    .gte('fecha', fechas[0]).lte('fecha', fechas[fechas.length - 1])

  let conOrigen = true
  let { data, error } = await leer('persona_id, fecha, estado, motivo, origen')
  if (error && sinColumnaOrigen(error)) {
    conOrigen = false
    ;({ data, error } = await leer('persona_id, fecha, estado, motivo'))
  }
  // SIN TABLA NO HAY NADA GUARDADO — y no hay nada que proteger tampoco.
  if (error) return sinTabla(error) ? { data: [], error: null } : { data: [], error: error.message }

  const filas = (data ?? []) as unknown as {
    persona_id: string; fecha: string; estado: string; motivo: string | null; origen?: string | null
  }[]
  return {
    data: filas.filter((f) => ESTADOS.includes(f.estado)).map((f) => ({
      persona_id: f.persona_id,
      fecha: f.fecha.slice(0, 10),
      estado: f.estado as EstadoPresencia,
      motivo: f.motivo,
      origen: conOrigen && (f.origen === 'horas' || f.origen === 'declarada') ? f.origen : null,
    })),
    error: null,
  }
}
