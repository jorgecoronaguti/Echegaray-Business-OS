'use server'

// PEDIR UN CAMBIO DE LA NOTA «QUÉ HACER» DE UN PROVEEDOR — la app pide, el Sheet confirma.
//
// No se escribe `proveedor_notas`: la RPC `proveedor_nota_pedir` (20260917T1410) encola y rechaza si la
// base ya no dice lo que la pantalla mostraba. Ante un conflicto gana la edición del dueño en el Sheet
// (decisión del 17/09/2026), y la pantalla lo dice con lo que el Sheet dice ahora.
//
// La clave se calcula ACÁ con `claveProv`, la misma función con la que la sonda y el Sheet guardan la
// nota: una segunda normalización en plpgsql repartiría las notas de un proveedor entre dos claves.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { claveProv } from '../../../../orquestador/lib/proveedor-notas.mjs'

export type ResultadoNota =
  | { ok: true; sinCambio: boolean }
  | { ok: false; error: string; actual?: string }

const Pedido = z.object({
  proveedor: z.string().trim().min(1, 'Falta el proveedor.').max(200),
  nota: z.string().trim().max(500, 'La nota pasa de 500 caracteres.')
    .refine((t) => !t.startsWith('='), 'Una nota no puede empezar con «=»: el Sheet la leería como fórmula.'),
  anterior: z.string().trim().max(500),
})

interface RespuestaRpc { ok: boolean; error?: string; sin_cambio?: boolean; actual?: string }

export async function pedirNotaProveedor(p: z.input<typeof Pedido>): Promise<ResultadoNota> {
  const v = Pedido.safeParse(p)
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? 'Pedido inválido.' }
  const clave = String(claveProv(v.data.proveedor))
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('proveedor_nota_pedir', {
    p_proveedor: v.data.proveedor, p_clave: clave, p_nota: v.data.nota, p_anterior: v.data.anterior,
  })
  if (error) {
    // PGRST202: la función no existe todavía. Se dice así, no «error desconocido».
    return {
      ok: false,
      error: error.code === 'PGRST202'
        ? 'Editar notas todavía no está habilitado en la base (falta aplicar 20260917T1410). No se guardó nada.'
        : 'No pude pedir el cambio. No se guardó nada.',
    }
  }
  const r = data as RespuestaRpc | null
  if (!r?.ok) return { ok: false, error: r?.error ?? 'No se guardó nada.', actual: r?.actual }
  revalidatePath('/administracion/proveedores')
  return { ok: true, sinCambio: r.sin_cambio === true }
}
