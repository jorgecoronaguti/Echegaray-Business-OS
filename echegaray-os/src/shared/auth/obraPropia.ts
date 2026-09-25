// ¿QUIEN LLAMA EDITA Y BORRA LOS PARTES DE ESTA OBRA? — la pregunta a la base, antes de escribir.
//
// Dueño (25/09/2026): el jefe de obra edita y borra partes SÓLO de su obra; Administración, de todas.
// La regla vive en Postgres (`ve_obra_propia`, 20260926T0004: `ve_obra()` sin la línea que le abre todas
// las obras al jefe) y la base ya rechaza el borrado y la bitácora. Esto se pregunta ANTES de la
// primera escritura para que un rechazo no deje un parte a medio editar.
import type { SupabaseClient } from '@supabase/supabase-js'

export const SIN_PERMISO_DE_PARTE = 'El parte de esa obra lo edita su jefe de obra o Administración.'

export async function editaPartesDeLaObra(supabase: SupabaseClient, obraId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('ve_obra_propia', { p_obra: obraId })
  return !error && data === true
}
