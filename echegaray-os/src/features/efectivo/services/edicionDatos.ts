// LO QUE LA FICHA NECESITA PARA EDITAR (migración 20260925T1200): los avisos de la entrega y su bitácora.
// Se pide para UNA entrega. Una lectura que falla deja la lista vacía y lo dice (`error`), nunca un cero
// silencioso.

import { createClient } from '@/lib/supabase/server'
import type { Cambio } from '../logica/edicion'
import { nombresDeUsuarios } from '../../../shared/personas/nombresDeUsuarios.ts'

export interface AvisoDeFicha {
  id: string
  tipo: string
  destino: string
  texto: string
  pedido_en: string
  enviado_en: string | null
  intentos: number
  ultimo_error: string | null
}

export interface CambioDeFicha extends Cambio {
  autorNombre: string | null
}

export interface EdicionDeFicha {
  avisos: AvisoDeFicha[]
  cambios: CambioDeFicha[]
  error: string | null
}

export async function leerEdicionDeFicha(entregaId: string): Promise<EdicionDeFicha> {
  try {
    const supabase = await createClient()
    const [avisos, cambios, usuarios] = await Promise.all([
      supabase.from('efectivo_aviso').select('id, tipo, destino, texto, pedido_en, enviado_en, intentos, ultimo_error')
        .eq('entrega_id', entregaId).order('pedido_en', { ascending: false }).limit(200),
      supabase.from('entidad_cambio').select('id, campo, antes, despues, autor, en')
        .eq('entidad', 'efectivo').eq('entidad_id', entregaId).order('en', { ascending: false }).limit(200),
      nombresDeUsuarios(supabase),
    ])
    return {
      avisos: (avisos.data ?? []) as AvisoDeFicha[],
      cambios: ((cambios.data ?? []) as Cambio[]).map((c) => ({ ...c, autorNombre: c.autor ? usuarios.get(c.autor) ?? null : null })),
      error: avisos.error?.message ?? cambios.error?.message ?? null,
    }
  } catch (err) {
    return { avisos: [], cambios: [], error: err instanceof Error ? err.message : 'No pude leer los avisos ni los cambios' }
  }
}
