// TODO LO QUE EL PANEL DE LA TAREA (04) PUEDE NECESITAR, LEÍDO UNA VEZ POR OBRA.
//
// ═══ POR QUÉ EN BLOQUE Y NO POR ACTIVIDAD (23/08/2026 · Design canónico §16) ═══
//
// El panel se abría con una navegación al servidor: cada clic en una fila eran dos tandas de
// lecturas y un render RSC completo — 2 a 6 segundos para mostrar datos que ya estaban a un JOIN
// de distancia. El contrato nuevo pide panel < 200 ms percibidos: se lee TODO el material del
// panel junto con el árbol (los volúmenes son chicos: pasos, ejecuciones y sugerencias de una obra
// son decenas o cientos de filas, no miles) y abrir/cerrar/cambiar de actividad pasa a ser estado
// del cliente. La base sigue siendo la única fuente: esto es UNA lectura más temprana, no una
// segunda verdad.
//
// TODO VIAJA COMO OBJETO PLANO (Record, no Map): cruza la frontera server → cliente serializado.
//
// LO ECONÓMICO NO SE PIDE SI NO SE PUEDE VER: `cotizacion_partida` sólo se consulta con
// `veEconomia` — para un jefe de obra la lectura volvería vacía y una fila ausente por permisos es
// indistinguible de una partida que no existe.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PasoDeActividad, RegistroAvance } from './tareasService'
import type { OpcionEstandar, SugerenciaEstandar } from './vinculacionTareaService'
import { estadoVinculacion } from './vinculacionEstandar'

export interface PartidaDeOrigen {
  id: string
  cotizacionId: string
  codigo: string | null
  hsUnitarias: number | null
}

export interface HistoricoDeTipo {
  hsAnalisis: number | null
  mediana: number | null
  muestra: number
  obras: number
  lectura: string | null
}

/** El material del panel para TODAS las actividades de la obra, serializable. */
export interface PanelDeObra {
  pasos: Record<string, PasoDeActividad[]>
  historial: Record<string, RegistroAvance[]>
  /** Jornada y calendario de la obra. `null` = no se pudo leer; el cálculo cae al defecto. */
  jornadaHoras: number | null
  diasHabiles: number[] | null
  capacidadPorCuadrilla: Record<string, number>
  /** Por id de PARTIDA (no de actividad). Vacío cuando el rol no ve economía. */
  partidas: Record<string, PartidaDeOrigen>
  puedeVerPartida: boolean
  /** Por `tarea_tipo_id`. */
  historicos: Record<string, HistoricoDeTipo>
  /** Días hábiles entre hoy y cada `fin_plan` futuro presente en la obra, por fecha ISO. */
  diasHastaFin: Record<string, number>
  /** El catálogo para vincular (vacío si ninguna actividad lo necesita) y la sugerencia por
   *  actividad sin vincular. */
  opcionesEstandar: OpcionEstandar[]
  sugerencias: Record<string, SugerenciaEstandar>
}

/** Lo mínimo del árbol que la lectura en bloque necesita para decidir qué pedir. */
export interface ClaveDeNodo {
  id: string
  tipo: string
  tiempo_tecnico: boolean
  cuadrilla_id: string | null
  cotizacion_partida_id: string | null
  tarea_tipo_id: string | null
  analisis_id: string | null
  fin_plan: string | null
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

function trocear<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export async function getPanelDeObra(
  supabase: SupabaseClient, obraId: string, nodos: ClaveDeNodo[], veEconomia: boolean,
): Promise<PanelDeObra> {
  const hoy = new Date().toISOString().slice(0, 10)
  const ids = nodos.map((n) => n.id)
  const partidaIds = [...new Set(nodos.map((n) => n.cotizacion_partida_id).filter(Boolean))] as string[]
  const tipoIds = [...new Set(nodos.map((n) => n.tarea_tipo_id).filter(Boolean))] as string[]
  const finesFuturos = [...new Set(nodos.map((n) => n.fin_plan).filter((f): f is string => Boolean(f && f > hoy)))]
  const sinVincular = nodos.filter((n) => {
    const e = estadoVinculacion({
      tipo: n.tipo, tiempoTecnico: n.tiempo_tecnico, tareaTipoId: n.tarea_tipo_id, analisisId: n.analisis_id,
    })
    return e !== 'no_aplica' && e !== 'vinculada'
  })

  const [pasosRes, ejecRes, obraRes, capRes, partidasRes, historicosRes, diasRes, opcionesRes, sugRes] =
    await Promise.all([
      // `obra_actividad_paso` no tiene obra_id: se pide por tandas de ids (URLs acotadas).
      Promise.all(trocear(ids, 120).map((tanda) =>
        supabase.from('obra_actividad_paso')
          .select('id, actividad_id, orden, nombre, peso, tiempo_tecnico, dias_tecnicos, hecho_en')
          .in('actividad_id', tanda).order('orden', { ascending: true }),
      )),
      supabase.from('obra_ejecucion')
        .select('id, actividad_id, fecha, creado_en, cantidad, avance_pct, comentario, criterio, metodo, fuente, masivo, creado_por, evidencia')
        .eq('obra_id', obraId)
        .order('fecha', { ascending: false }).order('creado_en', { ascending: false }),
      supabase.from('obra_canonica').select('jornada_horas, dias_habiles').eq('id', obraId).maybeSingle(),
      supabase.from('cuadrilla_capacidad').select('cuadrilla_id, capacidad_ponderada'),
      veEconomia && partidaIds.length > 0
        ? Promise.all(trocear(partidaIds, 120).map((tanda) =>
            supabase.from('cotizacion_partida').select('id, cotizacion_id, codigo, hs_unitarias').in('id', tanda),
          ))
        : Promise.resolve([]),
      tipoIds.length > 0
        ? supabase.from('rendimiento_recomendado')
            .select('tarea_tipo_id, hs_analisis, hs_observado_mediana, muestra, obras, lectura')
            .in('tarea_tipo_id', tipoIds)
        : Promise.resolve({ data: [] }),
      // LOS DÍAS HÁBILES LOS CUENTA LA BASE (`public.dias_habiles`): contar acá sería una segunda
      // definición de qué día se trabaja. Una llamada por fecha DISTINTA de fin, en paralelo.
      Promise.all(finesFuturos.map(async (fin) => {
        const { data } = await supabase.rpc('dias_habiles', { p_obra_id: obraId, p_desde: hoy, p_hasta: fin })
        return [fin, num(data)] as const
      })),
      sinVincular.length > 0
        ? supabase.from('analisis')
            .select('id, tarea_tipo_id, variante, tarea_tipo(codigo, nombre, unidad)')
            .eq('vigente', true)
        : Promise.resolve({ data: [] }),
      sinVincular.length > 0
        ? supabase.from('obra_actividad_sugerencia_estandar')
            .select('actividad_id, tarea_tipo_id, tarea_tipo_codigo, tarea_tipo_nombre, evidencia_texto, analisis_sugerido_id, analisis_vigentes')
            .eq('obra_id', obraId)
        : Promise.resolve({ data: [] }),
    ])

  const pasos: Record<string, PasoDeActividad[]> = {}
  for (const r of pasosRes) {
    for (const p of (r.data ?? []) as (PasoDeActividad & { actividad_id: string })[]) {
      ;(pasos[p.actividad_id] ??= []).push(p)
    }
  }

  // Los nombres de quien firmó cada registro, en una sola lectura extra.
  const ejec = (ejecRes.data ?? []) as Record<string, unknown>[]
  const autorIds = [...new Set(ejec.map((r) => r.creado_por as string | null).filter(Boolean))] as string[]
  const nombres = new Map<string, string>()
  if (autorIds.length > 0) {
    const { data: usuarios } = await supabase.from('perfiles').select('id, nombre').in('id', autorIds)
    for (const u of usuarios ?? []) nombres.set(u.id as string, u.nombre as string)
  }
  const historial: Record<string, RegistroAvance[]> = {}
  for (const r of ejec) {
    const fila: RegistroAvance = {
      id: r.id as string,
      fecha: r.fecha as string,
      creado_en: r.creado_en as string,
      cantidad: r.cantidad as number | null,
      avance_pct: r.avance_pct as number | null,
      comentario: r.comentario as string | null,
      criterio: (r.criterio as string) ?? null,
      metodo: (r.metodo as string) ?? null,
      fuente: (r.fuente as string) ?? null,
      masivo: Boolean(r.masivo),
      autor: r.creado_por ? (nombres.get(r.creado_por as string) ?? null) : null,
      evidencia: Array.isArray(r.evidencia) ? (r.evidencia as string[]).filter(Boolean) : [],
    }
    ;(historial[r.actividad_id as string] ??= []).push(fila)
  }

  const o = obraRes.data as { jornada_horas?: unknown; dias_habiles?: unknown } | null
  const capacidadPorCuadrilla: Record<string, number> = {}
  for (const c of (capRes.data ?? []) as { cuadrilla_id: string; capacidad_ponderada: unknown }[]) {
    const v = num(c.capacidad_ponderada)
    if (v != null) capacidadPorCuadrilla[c.cuadrilla_id] = v
  }

  const partidas: Record<string, PartidaDeOrigen> = {}
  for (const r of partidasRes) {
    for (const p of (r.data ?? []) as { id: string; cotizacion_id: string; codigo: string | null; hs_unitarias: unknown }[]) {
      partidas[p.id] = { id: p.id, cotizacionId: p.cotizacion_id, codigo: p.codigo, hsUnitarias: num(p.hs_unitarias) }
    }
  }

  const historicos: Record<string, HistoricoDeTipo> = {}
  for (const h of (historicosRes.data ?? []) as Record<string, unknown>[]) {
    historicos[h.tarea_tipo_id as string] = {
      hsAnalisis: num(h.hs_analisis),
      mediana: num(h.hs_observado_mediana),
      muestra: Number(h.muestra ?? 0),
      obras: Number(h.obras ?? 0),
      lectura: (h.lectura as string) ?? null,
    }
  }

  const diasHastaFin: Record<string, number> = {}
  for (const [fin, dias] of diasRes) if (dias != null) diasHastaFin[fin] = dias

  const opcionesEstandar: OpcionEstandar[] = ((opcionesRes.data ?? []) as unknown as {
    id: string; tarea_tipo_id: string; variante: string | null
    tarea_tipo: { codigo: string; nombre: string; unidad: string | null } | null
  }[])
    .filter((f) => f.tarea_tipo !== null)
    .map((f) => ({
      analisisId: f.id,
      tareaTipoId: f.tarea_tipo_id,
      codigo: f.tarea_tipo!.codigo,
      nombre: f.tarea_tipo!.nombre,
      unidad: f.tarea_tipo!.unidad,
      variante: f.variante,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const sugerencias: Record<string, SugerenciaEstandar> = {}
  for (const s of (sugRes.data ?? []) as Record<string, unknown>[]) {
    sugerencias[s.actividad_id as string] = {
      tareaTipoId: s.tarea_tipo_id as string,
      analisisId: (s.analisis_sugerido_id as string) ?? null,
      codigo: s.tarea_tipo_codigo as string,
      nombre: s.tarea_tipo_nombre as string,
      evidencia: s.evidencia_texto as string,
      analisisVigentes: Number(s.analisis_vigentes ?? 0),
    }
  }

  return {
    pasos,
    historial,
    jornadaHoras: num(o?.jornada_horas),
    diasHabiles: Array.isArray(o?.dias_habiles) ? (o.dias_habiles as number[]) : null,
    capacidadPorCuadrilla,
    partidas,
    puedeVerPartida: veEconomia,
    historicos,
    diasHastaFin,
    opcionesEstandar,
    sugerencias,
  }
}
