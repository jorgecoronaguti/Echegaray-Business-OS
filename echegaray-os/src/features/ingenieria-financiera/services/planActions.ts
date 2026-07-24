'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AprobarState = { ok: boolean; error: string | null; mensaje: string | null }

// APROBAR Y CONVERTIR EN TRABAJO. La única acción principal del Plan de ejecución.
//
// No ejecuta nada financiero ni bancario: marca el plan vigente como 'autorizado'. El Financial
// Execution Orchestrator (en el OS, no en React) toma ese plan autorizado y crea las tareas para los
// especialistas. Las acciones Nivel E (mover plata) siguen requiriendo aprobación humana aparte: esta
// aprobación coordina el TRABAJO, no autoriza pagos.
//
// IMPIDE LA DOBLE EJECUCIÓN: sólo actúa si el plan está 'pendiente_ejecucion'. Si ya está autorizado o
// ejecutado, no hace nada. Además exige que el identificador del plan que ve la interfaz coincida con
// el vigente (por si el motor recalculó un plan nuevo mientras el usuario miraba el anterior).
export async function aprobarPlanAction(_prev: AprobarState, formData: FormData): Promise<AprobarState> {
  const horizonteVisto = String(formData.get('horizonte') ?? '')
  const calculadoVisto = String(formData.get('calculado_en') ?? '')

  // Exige sesión: aprobar es una decisión humana explícita.
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return { ok: false, error: 'Iniciá sesión para aprobar el plan.', mensaje: null }
  } catch {
    return { ok: false, error: 'No se pudo verificar la sesión.', mensaje: null }
  }

  const admin = createAdminClient()
  // Sólo pasa a 'autorizado' si sigue pendiente Y es el mismo plan que se vio (mismo corte de cálculo).
  const { data, error } = await admin
    .schema('public')
    .from('finanzas_plan_vigente')
    .update({ estado: 'autorizado', autorizado_por: 'interfaz', autorizado_en: new Date().toISOString() })
    .eq('id', 1)
    .eq('estado', 'pendiente_ejecucion')
    .eq('horizonte', horizonteVisto)
    .eq('calculado_en', calculadoVisto)
    .select('estado')

  if (error) return { ok: false, error: error.message, mensaje: null }
  if (!data || data.length === 0) {
    return { ok: false, error: null, mensaje: 'El plan ya no estaba pendiente (fue aprobado o cambió). Revisá el plan vigente.' }
  }

  revalidatePath('/calendario-financiero')
  return { ok: true, error: null, mensaje: 'Plan aprobado. El OS está generando el trabajo para los especialistas.' }
}
