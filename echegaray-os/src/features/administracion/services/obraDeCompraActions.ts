'use server'

// ELEGIR LA OBRA DE UNA FILA DE COMPRAS DESDE LA APP — por la ÚNICA puerta: `compra_obra_asignar`.
//
// La app no escribe el Sheet desde Vercel. La RPC (migración 20260915T0700) valida el rol, que la celda
// no haya cambiado desde que se miró (`esperado`), guarda en `compra_sheet` y encola la escritura de
// la columna «Obra» en `compra_obra_cambio`. Esta acción sólo valida la FORMA y traduce los errores:
// la regla de qué es una obra válida vive en la base y en `obra-destino.mjs`, no acá.
//
// POR QUÉ ESTA NO USA `actualizarSiSigueIgual` (18/09/2026): a las otras cuatro superficies del deshacer se
// les metió la comparación de `esperado` adentro del `update` para que dos personas que deshacen a la vez no
// se pisen. Acá ya está hecho, y mejor: la RPC compara y escribe dentro de la MISMA transacción en la base.
// Agregar la primitiva sería una segunda definición de la misma regla. No falta nada.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { FORMA_VALOR_OBRA } from './obraDeCompra'

const RUTA = '/administracion/compras'

export type ResultadoObra = { ok: true } | { ok: false; error: string }

const Pedido = z.object({
  fila: z.number().int().min(4),
  // Vacío = sacar la obra elegida (la fila vuelve a la inferencia).
  valor: z.string().trim().max(200).refine((v) => v === '' || FORMA_VALOR_OBRA.test(v), 'no es una opción del desplegable de Obra'),
  esperado: z.string().trim().max(200),
  // LA RUTA A REFRESCAR NO LA ELIGE QUIEN LLAMA: llega un uuid y acá se arma la ruta. Aceptar una
  // ruta cruda desde el cliente sería dejar que la pantalla decida qué caché del servidor invalidar.
  proveedorId: z.string().uuid().nullish(),
})

/** ¿La base todavía no tiene la RPC? PostgREST responde PGRST202 cuando la función no existe. */
const faltaLaRpc = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || /compra_obra_asignar/.test(e.message ?? '')

export async function asignarObraDeCompra(
  fila: number, valor: string, esperado: string, proveedorId?: string | null,
): Promise<ResultadoObra> {
  const p = Pedido.safeParse({ fila, valor, esperado, proveedorId })
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Pedido inválido.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('compra_obra_asignar', {
    p_fila: p.data.fila, p_valor: p.data.valor, p_esperado: p.data.esperado,
  })
  if (error) {
    return {
      ok: false,
      error: faltaLaRpc(error)
        ? 'La base todavía no tiene la columna Obra (migración 20260915T0700 sin aplicar). No se guardó nada.'
        : 'No pude guardar la obra. No se guardó nada.',
    }
  }
  const r = data as { ok?: boolean; error?: string } | null
  if (!r?.ok) return { ok: false, error: r?.error ?? 'La base rechazó el cambio.' }
  revalidatePath(RUTA)
  // La MISMA fila se ve en la ficha del proveedor. Si sólo se revalidara Compras, la pantalla donde
  // se hizo el cambio seguiría mostrando la obra vieja debajo de su propio ✓.
  if (p.data.proveedorId) revalidatePath(`/administracion/proveedores/${p.data.proveedorId}`)
  return { ok: true }
}
