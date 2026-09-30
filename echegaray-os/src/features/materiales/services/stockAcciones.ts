'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { HREF_MATERIAL_ESCRITORIO, HREF_MATERIAL_TELEFONO } from '../logica/pedidos'
import { PREFIJO_OBRA } from '../logica/stock'

// MATERIAL · STOCK — las escrituras, y ninguna regla propia.
//
// Igual que `acciones.ts`: la REGLA está en Postgres (`recibir_pedido_material`, `usar_material`,
// `mover_material`, `ajustar_material` exigen Administración, no dejan sacar más de lo que hay y llevan
// el correlativo del remito sin huecos). Acá sólo se valida la FORMA con Zod y se revalidan las dos caras.
// No hay `insert`/`update` sobre las tablas de stock: no tienen policy de escritura, a propósito.

export type EstadoStock = { error: string | null; ok?: boolean; remito?: { id: string; numero: number } }

const id = z.string().uuid('Elegí de nuevo el material o el lugar')
const cantidad = z.number({ message: 'Poné una cantidad' }).positive('La cantidad tiene que ser mayor a cero').max(1_000_000, 'La cantidad es demasiado grande')
const texto = (max: number) => z.string().trim().max(max, 'El texto es demasiado largo').optional()

function revalidar() {
  revalidatePath(HREF_MATERIAL_ESCRITORIO)
  revalidatePath(HREF_MATERIAL_TELEFONO)
  revalidatePath('/campo')
}

const falla = (err: unknown): EstadoStock => ({ error: err instanceof Error ? err.message : 'Error al conectar con Supabase' })

/** Un destino `obra:<id>` es una obra activa sin depósito todavía: se le da el suyo (la función ya existe, es la de Herramientas). */
async function resolverLugar(supabase: Awaited<ReturnType<typeof createClient>>, valor: string): Promise<{ id: string } | { error: string }> {
  if (!valor.startsWith(PREFIJO_OBRA)) {
    const r = id.safeParse(valor)
    return r.success ? { id: r.data } : { error: r.error.issues[0].message }
  }
  const { data, error } = await supabase.rpc('ubicacion_de_obra', { p_obra_id: valor.slice(PREFIJO_OBRA.length) })
  if (error) return { error: error.message }
  return { id: data as string }
}

const llegoSchema = z.object({
  id_pedido: z.string().trim().min(1),
  cantidad: cantidad.nullable(),
  destino: z.string().trim().min(1).nullable(),
  nota: texto(400),
})

/** «Llegó»: total (cantidad null = lo que falta) o parcial. Suma stock en la obra del pedido o en el lugar que se elija. */
export async function llegoPedidoAction(input: { id_pedido: string; cantidad: number | null; destino: string | null; nota?: string }): Promise<EstadoStock> {
  const p = llegoSchema.safeParse(input)
  if (!p.success) return { error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    let destino: string | null = null
    if (p.data.destino) {
      const l = await resolverLugar(supabase, p.data.destino)
      if ('error' in l) return { error: l.error }
      destino = l.id
    }
    const { error } = await supabase.rpc('recibir_pedido_material', {
      p_id_pedido: p.data.id_pedido, p_cantidad: p.data.cantidad, p_destino: destino, p_nota: p.data.nota || null,
    })
    if (error) return { error: error.message }
  } catch (err) { return falla(err) }
  revalidar()
  return { error: null, ok: true }
}

const anularSchema = z.object({
  id_pedido: z.string().trim().min(1),
  cantidad: cantidad.nullable(),
  nota: z.string().trim().min(3, 'Escribí el motivo de la anulación').max(400, 'El texto es demasiado largo'),
})

/**
 * Anula una llegada mal marcada (total o una parte): baja `cantidad_recibida` Y el stock a la vez. Sin esto
 * el recuento corregía el saldo pero el pedido seguía diciendo que llegó. La base exige el motivo y que el
 * stock siga ahí; acá sólo se valida la forma.
 */
export async function anularLlegadaAction(input: { id_pedido: string; cantidad: number | null; nota: string }): Promise<EstadoStock> {
  const p = anularSchema.safeParse(input)
  if (!p.success) return { error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('anular_recepcion_material', {
      p_id_pedido: p.data.id_pedido, p_cantidad: p.data.cantidad, p_nota: p.data.nota,
    })
    if (error) return { error: error.message }
  } catch (err) { return falla(err) }
  revalidar()
  return { error: null, ok: true }
}

const usoSchema = z.object({ material: id, lugar: id, cantidad, nota: texto(400) })

/** «Usé»: resta del lugar. No deja pasar de lo que hay. */
export async function usoMaterialAction(input: { material: string; lugar: string; cantidad: number; nota?: string }): Promise<EstadoStock> {
  const p = usoSchema.safeParse(input)
  if (!p.success) return { error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('usar_material', {
      p_material: p.data.material, p_ubicacion: p.data.lugar, p_cantidad: p.data.cantidad, p_nota: p.data.nota || null,
    })
    if (error) return { error: error.message }
  } catch (err) { return falla(err) }
  revalidar()
  return { error: null, ok: true }
}

const moverSchema = z.object({
  origen: id,
  destino: z.string().trim().min(1, 'Elegí a dónde va'),
  items: z.array(z.object({ material: id, cantidad })).min(1, 'Elegí qué material se mueve').max(60, 'Son demasiados renglones para un remito'),
  recibe: texto(120),
  nota: texto(500),
})

/** «Sobra → Taller / otra obra»: mueve y emite el remito. Devuelve su número para imprimirlo. */
export async function moverMaterialAction(input: {
  origen: string; destino: string; items: Array<{ material: string; cantidad: number }>; recibe?: string; nota?: string
}): Promise<EstadoStock> {
  const p = moverSchema.safeParse(input)
  if (!p.success) return { error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    const l = await resolverLugar(supabase, p.data.destino)
    if ('error' in l) return { error: l.error }
    if (l.id === p.data.origen) return { error: 'El origen y el destino son el mismo lugar' }
    const { data, error } = await supabase.rpc('mover_material', {
      p_items: p.data.items, p_origen: p.data.origen, p_destino: l.id, p_recibe: p.data.recibe || null, p_nota: p.data.nota || null,
    })
    if (error) return { error: error.message }
    const remitoId = data as string
    const { data: fila } = await supabase.from('remito').select('numero').eq('id', remitoId).maybeSingle()
    revalidar()
    return { error: null, ok: true, remito: { id: remitoId, numero: Number(fila?.numero ?? 0) } }
  } catch (err) { return falla(err) }
}

const ingresoSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribí qué material es').max(160, 'El nombre es demasiado largo'),
  unidad: z.string().trim().min(1, 'Elegí la unidad').max(20),
  lugar: z.string().trim().min(1, 'Elegí dónde queda'),
  cantidad,
  origen: z.string().trim().min(3, 'Decí de dónde viene (compra directa, stock inicial…)').max(400, 'El texto es demasiado largo'),
})

/**
 * Ingreso SIN pedido: lo que ya está en el Taller o en una obra, o lo que se compró directo. Sin esta
 * puerta el stock sólo nacía de un «Llegó» y el control no tenía por dónde arrancar. El origen es
 * obligatorio (lo exige también la base): una entrada sin decir de dónde vino no se puede auditar.
 */
export async function ingresarMaterialAction(input: { nombre: string; unidad: string; lugar: string; cantidad: number; origen: string }): Promise<EstadoStock> {
  const p = ingresoSchema.safeParse(input)
  if (!p.success) return { error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    const l = await resolverLugar(supabase, p.data.lugar)
    if ('error' in l) return { error: l.error }
    const { error } = await supabase.rpc('ingresar_material', {
      p_nombre: p.data.nombre, p_unidad: p.data.unidad, p_ubicacion: l.id, p_cantidad: p.data.cantidad, p_origen: p.data.origen,
    })
    if (error) return { error: error.message }
  } catch (err) { return falla(err) }
  revalidar()
  return { error: null, ok: true }
}

const ajusteSchema = z.object({
  material: id, lugar: id,
  contado: z.number({ message: 'Poné lo que contaste' }).min(0, 'Lo contado no puede ser negativo').max(1_000_000),
  motivo: z.enum(['recuento', 'perdido', 'descartado']),
  nota: texto(400),
})

/** Recuento: lo que hay contado reemplaza al saldo, y la diferencia queda en el libro con su motivo. */
export async function ajusteMaterialAction(input: { material: string; lugar: string; contado: number; motivo: string; nota?: string }): Promise<EstadoStock> {
  const p = ajusteSchema.safeParse(input)
  if (!p.success) return { error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('ajustar_material', {
      p_material: p.data.material, p_ubicacion: p.data.lugar, p_contado: p.data.contado, p_motivo: p.data.motivo, p_nota: p.data.nota || null,
    })
    if (error) return { error: error.message }
  } catch (err) { return falla(err) }
  revalidar()
  return { error: null, ok: true }
}
