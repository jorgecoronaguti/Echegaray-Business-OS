'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type AprobarState = { ok: boolean; error: string | null; mensaje: string | null }

// APROBAR Y CONVERTIR EN TRABAJO. La única acción principal del Plan de ejecución.
//
// No ejecuta nada financiero ni bancario: marca el plan vigente como 'autorizado'. El Financial
// Execution Orchestrator (en el OS, no en React) toma ese plan autorizado y crea las tareas para los
// especialistas. Las acciones Nivel E (mover plata) siguen requiriendo aprobación humana aparte: esta
// aprobación coordina el TRABAJO, no autoriza pagos.
//
// CÓMO ESCRIBE (24/07): por la RPC `finanzas_autorizar_plan` (SECURITY DEFINER), con el cliente
// autenticado normal. NO usa service_role — antes usaba el admin client, cuya key no estaba en Vercel
// y hacía CRASHEAR la página al aprobar. La RPC gatea por rol (Dirección/Administración) e impide la
// doble ejecución: sólo pasa a 'autorizado' si el plan sigue 'pendiente_ejecucion' Y coincide con el
// que la interfaz mostró (mismo horizonte y corte de cálculo, por si el motor recalculó mientras tanto).
export async function aprobarPlanAction(_prev: AprobarState, formData: FormData): Promise<AprobarState> {
  const horizonteVisto = String(formData.get('horizonte') ?? '')
  const calculadoVisto = String(formData.get('calculado_en') ?? '')

  try {
    const supabase = await createClient()
    // Exige sesión: aprobar es una decisión humana explícita.
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return { ok: false, error: 'Iniciá sesión para aprobar el plan.', mensaje: null }

    const { data, error } = await supabase.rpc('finanzas_autorizar_plan', {
      p_horizonte: horizonteVisto,
      p_calculado_en: calculadoVisto,
    })

    if (error) return { ok: false, error: error.message, mensaje: null }
    if (!data) {
      return { ok: false, error: null, mensaje: 'El plan ya no estaba pendiente (fue aprobado o cambió). Revisá el plan vigente.' }
    }

    revalidatePath('/calendario-financiero')
    return { ok: true, error: null, mensaje: 'Plan aprobado. El OS está generando el trabajo para los especialistas.' }
  } catch (e) {
    // Un server action nunca debe crashear la página: cualquier fallo se informa en la UI.
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo aprobar el plan.', mensaje: null }
  }
}
