// LO QUE EL PANEL DE LA TAREA (04) NECESITA DE LA BASE, ADEMÁS DEL ÁRBOL. Cinco lecturas chicas y
// ninguna cuenta: las cuentas viven en `panelTarea.ts` (puro) y en `dotacion.ts`.
//
// SE LEE SÓLO CON EL PANEL ABIERTO. Son datos de UNA actividad; pedirlos con la lista entera sería
// pagarlos 350 veces para mostrar uno.
//
// ═══ LO ECONÓMICO NO SE PIDE SI NO SE PUEDE VER ═══
//
// `cotizacion_partida` está cerrada a `ve_economia()`: para un jefe de obra la lectura vuelve vacía,
// y una fila ausente por permisos es indistinguible de una partida que no existe. Por eso ni se
// consulta cuando el rol no la ve, y la pantalla dice «la partida es dato económico» en vez de
// «sin análisis» — que mandaría a cargar algo que ya está cargado.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ContextoTarea {
  /** De `obra_canonica`. `null` = no pude leer la obra; el cálculo cae a la jornada por defecto y
   *  la restricción no se dibuja, en vez de afirmar una jornada que nadie declaró. */
  jornadaHoras: number | null
  diasHabiles: number[] | null
  capacidadCuadrilla: number | null
  /** La partida de origen, cuando la actividad viene de un presupuesto Y quien mira ve economía. */
  partida: { id: string; cotizacionId: string; codigo: string | null; hsUnitarias: number | null } | null
  puedeVerPartida: boolean
  /** De `rendimiento_recomendado`: el teórico vigente y lo que enseñaron las obras terminadas. */
  historico: {
    hsAnalisis: number | null
    mediana: number | null
    muestra: number
    obras: number
    lectura: string | null
  } | null
  /** Días HÁBILES entre hoy y el fin de plan, con el calendario de la obra (`public.dias_habiles`).
   *  `null` cuando no hay fin de plan o la fecha ya pasó: la cuenta inversa necesita días por
   *  delante, y una fecha vencida no se contesta con «0 personas». */
  diasHastaFinPlan: number | null
}

const VACIO: ContextoTarea = {
  jornadaHoras: null, diasHabiles: null, capacidadCuadrilla: null, partida: null,
  puedeVerPartida: false, historico: null, diasHastaFinPlan: null,
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

export interface ClavesDeLaTarea {
  cuadrillaId: string | null
  cotizacionPartidaId: string | null
  tareaTipoId: string | null
  finPlan: string | null
}

/**
 * TODO LO QUE EL PANEL NECESITA Y EL ÁRBOL NO TRAE, en paralelo.
 *
 * Ninguna de las cinco lecturas hace fallar al panel: si una vuelve con error, su dato queda en
 * `null` y la pantalla lo dice con su nombre. Un panel que se cae entero porque no pudo leer la
 * mediana histórica es peor que un panel que muestra «sin histórico».
 */
export async function getContextoTarea(
  supabase: SupabaseClient, obraId: string, claves: ClavesDeLaTarea, veEconomia: boolean,
): Promise<ContextoTarea> {
  const hoy = new Date().toISOString().slice(0, 10)
  const pideDias = Boolean(claves.finPlan && claves.finPlan > hoy)

  const [obra, capacidad, partida, historico, dias] = await Promise.all([
    supabase.from('obra_canonica').select('jornada_horas, dias_habiles').eq('id', obraId).maybeSingle(),
    claves.cuadrillaId
      ? supabase.from('cuadrilla_capacidad').select('capacidad_ponderada')
          .eq('cuadrilla_id', claves.cuadrillaId).maybeSingle()
      : Promise.resolve({ data: null }),
    claves.cotizacionPartidaId && veEconomia
      ? supabase.from('cotizacion_partida').select('id, cotizacion_id, codigo, hs_unitarias')
          .eq('id', claves.cotizacionPartidaId).maybeSingle()
      : Promise.resolve({ data: null }),
    claves.tareaTipoId
      ? supabase.from('rendimiento_recomendado')
          .select('hs_analisis, hs_observado_mediana, muestra, obras, lectura')
          .eq('tarea_tipo_id', claves.tareaTipoId).maybeSingle()
      : Promise.resolve({ data: null }),
    // LOS DÍAS HÁBILES LOS CUENTA LA BASE. `public.dias_habiles` ya respeta los días de la semana de
    // la obra y su calendario de feriados; contarlos acá sería una segunda definición de qué día se
    // trabaja, y el día que la obra declare que trabaja sábados sólo se enteraría una de las dos.
    pideDias
      ? supabase.rpc('dias_habiles', { p_obra_id: obraId, p_desde: hoy, p_hasta: claves.finPlan })
      : Promise.resolve({ data: null }),
  ])

  const o = obra.data as { jornada_horas?: unknown; dias_habiles?: unknown } | null
  const p = partida.data as {
    id: string; cotizacion_id: string; codigo: string | null; hs_unitarias: unknown
  } | null
  const h = historico.data as {
    hs_analisis: unknown; hs_observado_mediana: unknown; muestra: unknown; obras: unknown; lectura: string | null
  } | null

  return {
    ...VACIO,
    jornadaHoras: num(o?.jornada_horas),
    diasHabiles: Array.isArray(o?.dias_habiles) ? (o.dias_habiles as number[]) : null,
    capacidadCuadrilla: num((capacidad.data as { capacidad_ponderada?: unknown } | null)?.capacidad_ponderada),
    partida: p
      ? { id: p.id, cotizacionId: p.cotizacion_id, codigo: p.codigo, hsUnitarias: num(p.hs_unitarias) }
      : null,
    puedeVerPartida: veEconomia,
    historico: h
      ? {
          hsAnalisis: num(h.hs_analisis),
          mediana: num(h.hs_observado_mediana),
          muestra: Number(h.muestra ?? 0),
          obras: Number(h.obras ?? 0),
          lectura: h.lectura,
        }
      : null,
    diasHastaFinPlan: num((dias as { data?: unknown }).data),
  }
}
