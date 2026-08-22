'use server'

// VINCULAR UNA ACTIVIDAD DE OBRA AL ESTÁNDAR — la acción que ESCRIBE el vínculo.
//
// ═══ POR QUÉ ESTO ES UN GESTO DE UNA PERSONA Y NO UN BARRIDO ═══
//
// Al 22/08/2026 las 350 actividades reales están sin vincular, y un `update … where lower(nombre) =
// lower(nombre)` engancharía 12. Vincular decide contra qué estándar se mide el rendimiento de una
// obra: un análisis colgado de la actividad equivocada es peor que ninguno, porque el segundo se
// busca y el primero se cree. La sugerencia se MUESTRA con su evidencia (20260822T6110); aplicarla
// es este click.
//
// ═══ EL `obra_id` Y EL `actividad_id` NO VIAJAN EN EL FORMULARIO ═══
//
// Se atan con `.bind` en el servidor, igual que el resto del módulo. Un id en un campo del navegador
// lo edita cualquiera, y la RLS acota por obra pero no entre las actividades de la MISMA obra.
//
// ═══ LO QUE ESTA ACCIÓN NO HACE ═══
//
// No crea tareas tipo ni análisis, y no versiona nada: eso vive en la Base Maestra, que es la única
// pantalla que puede mostrar contra qué se está cambiando. Acá se elige entre lo que ya existe.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import {
  planDeVinculacion, resumenDeVinculacion,
  type ActividadAVincular, type EstandarVigente,
} from './vinculacionEstandar'

// LAS DOS MANERAS DE NOMBRAR EL MISMO VÍNCULO. `analisis_id` YA ES «tarea tipo + variante»: un
// análisis pertenece a una sola tarea tipo, así que mandarlo solo alcanza y es lo que hace la
// pantalla (un solo select, sin ambigüedad posible). `tarea_tipo_id` solo sigue valiendo para quien
// no quiere elegir variante — la acción toma la vigente si hay UNA, y si hay varias no elige.
const schema = z.object({
  tarea_tipo_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  analisis_id: z.union([z.string().uuid(), z.literal('')]).optional(),
}).refine((d) => Boolean(d.tarea_tipo_id || d.analisis_id), {
  message: 'Elegí contra qué estándar se mide esta actividad',
})

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

interface FilaEstandar {
  analisis_id: string
  tarea_tipo_id: string
  variante: string | null
  unidad: string | null
  hh_por_unidad: unknown
}

const aEstandar = (e: FilaEstandar): EstandarVigente => ({
  tareaTipoId: e.tarea_tipo_id,
  analisisId: e.analisis_id,
  variante: e.variante,
  unidad: e.unidad,
  hhPorUnidad: num(e.hh_por_unidad),
})

/** Cuál análisis rige. Con más de uno vigente devuelve el motivo, con las variantes nombradas: un
 *  mensaje que dice «elegí» sin decir entre qué manda a adivinar. */
function elegirEstandar(filas: FilaEstandar[], pedido: string | null):
{ estandar: EstandarVigente } | { error: string } {
  if (pedido) {
    const e = filas.find((f) => f.analisis_id === pedido)
    if (!e) return { error: 'Ese análisis ya no está vigente. Elegí otro o versionalo en la Base Maestra.' }
    return { estandar: aEstandar(e) }
  }
  if (filas.length === 0) {
    return { error: 'Esa tarea tipo no tiene ningún análisis vigente. Cargalo en la Base Maestra antes de vincular.' }
  }
  if (filas.length > 1) {
    const variantes = filas.map((f) => f.variante ?? 'base').join(', ')
    return { error: `Esa tarea tipo tiene ${filas.length} análisis vigentes (${variantes}). Elegí con cuál se mide esta actividad.` }
  }
  return { estandar: aEstandar(filas[0]) }
}

/**
 * VINCULAR: elegir la tarea tipo (y el análisis) y traer lo que el estándar aporte SIN pisar nada.
 *
 * `hh_plan` y `unidad` sólo se completan si la actividad los tiene vacíos. El resultado dice qué
 * trajo y qué respetó — «Guardado» a secas no permite saber si acaba de reemplazar el plan de la
 * obra por el teórico.
 */
export async function vincularActividadAEstandar(
  obraId: string, actividadId: string, form: FormData,
): Promise<Resultado> {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data: act, error: eAct } = await supabase.from('obra_actividad')
    .select('id, tipo, tiempo_tecnico, tarea_tipo_id, analisis_id, unidad, cantidad_objetivo, hh_plan')
    .eq('id', actividadId).eq('obra_id', obraId).maybeSingle()
  if (eAct) return { ok: false, error: eAct.message }
  if (!act) return { ok: false, error: 'Esa actividad no es de esta obra.' }

  // El filtro es por el dato MÁS específico que llegó: con el análisis en la mano, la tarea tipo se
  // deduce de él. Filtrar igual por la tarea tipo dejaría entrar una combinación imposible sin
  // decirlo — y el trigger de coherencia la rechazaría con un error de Postgres en vez de uno en
  // castellano.
  const consulta = supabase.from('estandar_productivo')
    .select('analisis_id, tarea_tipo_id, variante, unidad, hh_por_unidad')
  const { data: filas, error: eEst } = await (d.analisis_id
    ? consulta.eq('analisis_id', d.analisis_id)
    : consulta.eq('tarea_tipo_id', d.tarea_tipo_id!))
  if (eEst) return { ok: false, error: eEst.message }

  const elegido = elegirEstandar((filas ?? []) as FilaEstandar[], d.analisis_id || null)
  if ('error' in elegido) return { ok: false, error: elegido.error }
  if (d.tarea_tipo_id && elegido.estandar.tareaTipoId !== d.tarea_tipo_id) {
    return { ok: false, error: 'Ese análisis es de otra tarea tipo. Elegí uno de la tarea que estás vinculando.' }
  }

  const actividad: ActividadAVincular = {
    tipo: act.tipo as string,
    tiempoTecnico: Boolean(act.tiempo_tecnico),
    tareaTipoId: (act.tarea_tipo_id as string) ?? null,
    analisisId: (act.analisis_id as string) ?? null,
    unidad: (act.unidad as string) ?? null,
    cantidadObjetivo: num(act.cantidad_objetivo),
    hhPlan: num(act.hh_plan),
  }
  const plan = planDeVinculacion(actividad, elegido.estandar)

  const { error } = await supabase.from('obra_actividad')
    .update(plan.patch).eq('id', actividadId).eq('obra_id', obraId)
  if (error) {
    // El trigger de coherencia (20260822T6100) contesta con su propio texto, que ya está en
    // castellano y dice exactamente qué pasó. Lo demás se traduce.
    if (error.code === 'PGRST204' || error.code === '42703') {
      return { ok: false, error: `Falta aplicar en la base la migración de vinculación (20260822T6100). ${error.message}` }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: resumenDeVinculacion(plan) }
}

/**
 * SOLTAR EL VÍNCULO, sin tocar lo que la obra ya cargó.
 *
 * `hh_plan`, `unidad` y `cantidad_objetivo` se quedan donde están: son el plan de ESTA obra, y una
 * vinculación equivocada no lo vuelve falso. Sólo se borra de dónde salía el estándar.
 */
export async function desvincularActividadDeEstandar(
  obraId: string, actividadId: string,
): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad')
    // El análisis PRIMERO en el objeto no alcanza —Postgres aplica el UPDATE entero de una— pero
    // los dos van juntos a propósito: dejar el análisis sin la tarea tipo lo volvería a completar
    // el trigger de coherencia y el vínculo no se soltaría nunca.
    .update({ analisis_id: null, tarea_tipo_id: null })
    .eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Vínculo soltado. El plan cargado en la obra queda como estaba.' }
}
