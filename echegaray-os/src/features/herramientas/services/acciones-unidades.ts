'use server'

// DAR CÓDIGO A CADA UNIDAD DE UN LOTE (migración 20260923T1500) — por `individualizar_unidades`.
//
// La base genera los códigos correlativos bajo candado y rechaza pasarse de `activo.cantidad`, un lote en
// baja y un activo de una sola unidad. Acá sólo se valida la forma con Zod.

import { z } from 'zod'
import { MIGRACION_UNIDADES, type Unidad } from '../logica/unidades'
import { rpcHerramientas, type Resultado } from './rpc'

const schema = z.object({
  activo: z.string().uuid(),
  cuantas: z.coerce.number().int('La cantidad es un número entero').min(1, 'La cantidad es 1 o más').max(1000, 'De a 1.000 como mucho: es lo que entra en 42 hojas de etiquetas'),
})

/** Devuelve las unidades creadas, con su código, para mostrarlas y mandarlas a imprimir. */
export async function individualizarUnidadesAction(entrada: z.input<typeof schema>): Promise<Resultado<Unidad[]>> {
  const p = schema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const r = await rpcHerramientas<Unidad[]>('individualizar_unidades', { p_activo: p.data.activo, p_cuantas: p.data.cuantas }, MIGRACION_UNIDADES)
  if (!r.ok) return r
  return { ok: true, dato: r.dato ?? [] }
}
