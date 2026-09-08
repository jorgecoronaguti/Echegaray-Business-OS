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
