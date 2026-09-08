// EL PLAN DE OBRA DE UNA PERSONA — leerlo y cancelar un pase, sin Next y sin cliente real.
//
// Mismo reparto que `obraActualNucleo.ts`: las decisiones puras están en `planDeObraActual.ts`, la
// secuencia entera vive acá —donde un test la puede correr— y la server action de al lado sólo
// pone el cliente, el perfil, la fecha y el `revalidatePath`.
//
// ═══ POR QUÉ NO ESTÁ ADENTRO DE `obraActualNucleo.ts` ═══
//
// Cancelar es la única operación de este módulo que BORRA, y borrar necesita el verbo `delete` en
// la interfaz del cliente. Agregárselo a `SupabaseLike` obligaba a que el falso del test del cambio
// de obra —que hoy declara `select`, `update` e `insert` y nada más— tuviera que implementar un
// verbo que ese camino no usa. Un falso más ancho que el código que prueba deja de ser evidencia de
// qué tablas se tocaron, que es justamente lo que ese test existe para mirar.

import { z } from 'zod'
import {
  planDeCancelacion, puedeCambiarObraActual, type TramoDeAsignacion,
} from './planDeObraActual.ts'

export type ResultadoCancelacion = { ok: true; mensaje: string } | { ok: false; error: string }

type Fila = Record<string, unknown>
type Respuesta<T> = { data: T | null; error: { message: string; code?: string } | null }

/** El subconjunto de PostgREST que estas dos operaciones usan. Tipar sólo esto —y no
 *  `SupabaseClient`— es lo que permite que el falso del test sea un objeto común. */
export interface SupabasePlanLike {
  from(tabla: string): TablaPlanLike
}

interface TablaPlanLike {
  select(columnas: string): LecturaPlanLike
  update(valores: Fila): EscrituraPlanLike
  delete(): EscrituraPlanLike
}

interface LecturaPlanLike {
  eq(columna: string, valor: string): LecturaPlanLike
  in(columna: string, valores: string[]): PromiseLike<Respuesta<Fila[]>>
  order(columna: string, opciones: { ascending: boolean }): PromiseLike<Respuesta<Fila[]>>
}

interface EscrituraPlanLike {
  eq(columna: string, valor: string): EscrituraPlanLike
  select(columnas: string): PromiseLike<Respuesta<Fila[]>>
}

export interface DepsPlanDeObra {
  supabase: SupabasePlanLike
  perfil: { rol: string | null } | null
  /** `YYYY-MM-DD`. Por parámetro: un test atado al reloj se rompería a medianoche. */
  hoy: string
  revalidar?: (personaId: string) => void
}

/**
 * TODOS los tramos de `obra_asignacion` de la persona, con el nombre de su obra resuelto.
 *
 * ═══ TAMBIÉN LOS CERRADOS, Y TAMBIÉN LAS OBRAS QUE YA NO ESTÁN ACTIVAS ═══
 *
 * El panel muestra de dónde viene, dónde está y a dónde va: filtrar por `hasta is null` dejaría
 * sólo el presente y el futuro, y el pase que se está por programar se decide mirando el pasado
 * reciente. Y filtrar por obra activa borraría del historial las obras cerradas, que es la mitad de
 * las obras de esta empresa.
 *
 * `planDeCancelacion` NECESITA los cerrados: el tramo que hay que reabrir es exactamente el que
 * cierra en la víspera del pase, y sin él en la lista la cancelación dejaría a la persona sin obra.
 */
export async function leerTramosCon(
  supabase: SupabasePlanLike, personaId: string,
): Promise<{ data: TramoDeAsignacion[]; error: string | null }> {
  const { data, error } = await supabase.from('obra_asignacion')
    .select('id, obra_id, desde, hasta').eq('persona_id', personaId)
    .order('desde', { ascending: false })
  // UNA LECTURA QUE FALLA NO ES «NO TIENE NINGUNO». Seguir con la lista vacía haría que la
  // cancelación no encontrara el tramo que reabrir y dejara a la persona sin obra en silencio.
  if (error) return { data: [], error: `No pude leer sus asignaciones: ${error.message}` }
  const filas = (data ?? []) as unknown as {
    id: string; obra_id: string; desde: string | null; hasta: string | null
  }[]
  if (filas.length === 0) return { data: [], error: null }

  const { data: obras } = await supabase.from('obra_canonica')
    .select('id, nombre').in('id', [...new Set(filas.map((f) => f.obra_id))])
  const nombres = new Map(((obras ?? []) as unknown as { id: string; nombre: string }[])
    .map((o) => [o.id, o.nombre]))
  return {
    data: filas.map((f) => ({
      id: f.id,
      obra_id: f.obra_id,
      // Sin catálogo se escribe el id: es feo, pero el panel tiene que poder nombrar lo que lista.
      nombre: nombres.get(f.obra_id) ?? f.obra_id,
      desde: f.desde,
      hasta: f.hasta,
    })),
    error: null,
  }
}

const cancelarSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  tramo_id: z.string().uuid('Elegí un tramo programado'),
})

/**
 * Cancelar un pase programado y dejar a la persona como estaba.
 *
 * ═══ PRIMERO BORRA, DESPUÉS REABRE ═══
 *
 * Al revés sería más seguro sólo en apariencia. El tramo programado tiene `hasta is null`; si el
 * que se reabre es de la MISMA obra —dato sucio, pero lo hay—, reabrirlo antes de borrar hace que
 * durante un instante haya dos filas abiertas a la misma obra y el `update` choque contra
 * `obra_asignacion_una_vigente`. Borrando primero, el peor caso es que la persona quede «Sin obra»
 * —estado visible, que el desplegable arregla— en vez de que la cancelación falle a medias sin
 * decir cuál de las dos escrituras pasó.
 */
export async function cancelarTramoProgramadoCon(
  deps: DepsPlanDeObra, entrada: unknown,
): Promise<ResultadoCancelacion> {
  const parsed = cancelarSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { persona_id: personaId, tramo_id: tramoId } = parsed.data
  const { supabase, hoy } = deps

  // MISMO PERMISO QUE MOVER DE OBRA HOY, y antes de tocar nada. Cancelar un pase mueve costo de mano
  // de obra igual que programarlo: la única diferencia es el signo.
  if (!puedeCambiarObraActual(deps.perfil?.rol)) {
    return {
      ok: false,
      error: 'Tu usuario no puede cambiar la obra de una persona: lo hacen Dirección, '
        + 'Administración y los jefes de obra.',
    }
  }

  const tramos = await leerTramosCon(supabase, personaId)
  if (tramos.error) return { ok: false, error: tramos.error }

  const plan = planDeCancelacion({ tramos: tramos.data, id: tramoId, hoy })
  if (plan.error) return { ok: false, error: plan.error }

  for (const id of plan.borrar) {
    // EL `eq('persona_id')` NO SOBRA: sin él un id copiado de otra ficha borraría el pase de otro.
    // Y `.select()` porque la evidencia es del efecto: un `delete` que no borra ninguna fila
    // —porque la policy lo rechazó sin error— no puede acusar «cancelado».
    const { data, error } = await supabase.from('obra_asignacion')
      .delete().eq('id', id).eq('persona_id', personaId).select('id')
    if (error) return { ok: false, error: `No pude cancelar el pase: ${error.message}` }
    if ((data ?? []).length === 0) {
      return {
        ok: false,
        error: 'No pude cancelar el pase: la base no borró ninguna fila. Puede ser un permiso.',
      }
    }
  }

  if (plan.reabrirId) {
    const { data, error } = await supabase.from('obra_asignacion')
      .update({ hasta: null }).eq('id', plan.reabrirId).eq('persona_id', personaId).select('id')
    if (error || (data ?? []).length === 0) {
      deps.revalidar?.(personaId)
      return {
        ok: false,
        error: `Cancelé el pase pero NO pude reabrir su obra anterior${error ? `: ${error.message}` : ' (cero filas)'}. `
          + 'La persona quedó SIN OBRA — elegila de nuevo en el desplegable.',
      }
    }
  }

  deps.revalidar?.(personaId)
  return { ok: true, mensaje: plan.acuse }
}
