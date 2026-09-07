'use server'

// GUARDAR EL DÍA — la única escritura de la asistencia por obra.
//
// ═══ POR QUÉ NO ES `imputarHHMasivo` ═══
//
// Esa acción inserta y SALTEA a quien ya tenía horas: sirve para cargar una cuadrilla la primera vez
// y no sirve acá, donde reabrir el día y corregir un 8,8 a 5 es el caso normal — saltearlo dejaría
// la corrección afuera y diría que salió bien. El plan de qué insertar, corregir y reemplazar lo
// decide `planDeJornada.ts`, que se prueba sin base.
//
// ═══ EL AUSENTE NO SE GUARDA COMO CERO ═══
//
// `registros_hh` exige `horas > 0`. La ausencia se guarda con las horas de la jornada y
// `tipo_hora='ausencia'`, que es lo que `tipoHora.ts` ya declara: «una ausencia tiene horas y no es
// trabajo». Nadie la suma como trabajo.
//
// ═══ NO SE TOCAN LAS HORAS DE OTRA OBRA ═══
//
// Todo `update` y todo `delete` llevan `eq('obra_canonica_id', obraId)`. Sin eso, corregir el día en
// una obra podría borrar la imputación que esa misma persona tiene ese día en otra.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { acuseDe, envioSchema, planDeGuardado, type FilaExistente } from './planDeJornada'

export type ResultadoJornada = { ok: true; mensaje: string } | { ok: false; error: string }

export async function guardarJornada(entrada: unknown): Promise<ResultadoJornada> {
  const parsed = envioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { obra_id: obraId, fecha, marcas } = parsed.data

  const supabase = await createClient()
  const previos = await supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora')
    .eq('obra_canonica_id', obraId).eq('fecha', fecha)
    .in('persona_id', marcas.map((m) => m.persona_id))
  if (previos.error) return { ok: false, error: previos.error.message }

  const plan = planDeGuardado(marcas, (previos.data ?? []) as FilaExistente[])

  if (plan.borrar.length > 0) {
    const { error } = await supabase.from('registros_hh').delete()
      .eq('obra_canonica_id', obraId).eq('fecha', fecha).in('id', plan.borrar)
    if (error) return { ok: false, error: error.message }
  }
  if (plan.insertar.length > 0) {
    const { error } = await supabase.from('registros_hh').insert(plan.insertar.map((m) => ({
      obra_canonica_id: obraId,
      persona_id: m.persona_id,
      // SIN ACTIVIDAD, A PROPÓSITO. El diseño lo dice: «ni foto, ni tarea, ni plata». Exigir una
      // actividad obligaría al jefe a inventar una para poder declarar horas que sí se trabajaron.
      actividad_id: null,
      fecha,
      // La semana la deriva el trigger `registros_hh_normalizar`; se manda igual porque la columna
      // es `not null` y un insert sin ella fallaría si el trigger se cayera.
      fecha_inicio_semana: fecha,
      horas: m.horas,
      tipo_hora: m.estado === 'ausente' ? 'ausencia' : 'normal',
      fuente_legacy: 'web:asistencia-obra',
    })))
    if (error) return { ok: false, error: error.message }
  }
  for (const { id, marca } of plan.actualizar) {
    const { error } = await supabase.from('registros_hh')
      .update({ horas: marca.horas }).eq('id', id).eq('obra_canonica_id', obraId)
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath('/campo/asistencia')
  revalidatePath('/administracion/personas')
  return { ok: true, mensaje: acuseDe(plan) }
}
