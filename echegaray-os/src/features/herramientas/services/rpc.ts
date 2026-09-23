// LA LLAMADA A UNA FUNCIÓN DE LA BASE, UNA SOLA VEZ — para las acciones del módulo que viven en más de
// un archivo (`acciones.ts` es de la etapa 1; las unidades y la revisión, del 23/09, tienen el suyo).
// Sin `'use server'`: no es una puerta del cliente, la importan las acciones que sí lo son.
//
// Sólo traduce el error a palabras de la pantalla y refresca las rutas del módulo. Las reglas las hace
// cumplir la base: acá no se decide nada.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { faltaMigracion } from '../logica/falta-migracion'

export type Resultado<T = null> = { ok: true; dato: T; mensaje?: string } | { ok: false; error: string }

function traducir(e: { code?: string; message: string }, migracion: string): string {
  if (faltaMigracion(e)) return `Falta aplicar la migración ${migracion}: todavía no se puede registrar.`
  if (e.code === '42501') return 'Hace falta entrar con tu usuario para registrar esto.'
  return e.message
}

/** Llama a `fn` y, si salió bien, refresca las pantallas del módulo (escritorio y teléfono). */
export async function rpcHerramientas<T>(fn: string, args: Record<string, unknown>, migracion: string): Promise<Resultado<T>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { ok: false, error: traducir(error, migracion) }
    revalidatePath('/herramientas', 'layout')
    revalidatePath('/campo/herramientas', 'layout')
    return { ok: true, dato: data as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}
