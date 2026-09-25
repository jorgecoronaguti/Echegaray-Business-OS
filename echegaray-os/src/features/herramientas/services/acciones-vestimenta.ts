'use server'

// ENTREGAR, DEVOLVER Y DAR DE BAJA EPP Y ROPA DE UNA PERSONA — la solapa del legajo (dueño, 25/09/2026).
//
// Nada de lógica propia: entregar es `entregar_a_persona` (que mueve existencias con `mover_existencias`),
// devolver es `mover_existencias` al revés, la baja es `dar_de_baja_parcial` en la persona y el recuento
// es `ajustar_existencia`. Las reglas —no entregar más de lo que hay, persona que ya no está en la
// empresa, ítem que no es EPP ni ropa— las hace cumplir la base.
//
// SIN STOCK NO HAY NEGATIVO. Si en el inventario no hay, la pantalla ofrece dos caminos y los dos dejan
// la cuenta verdadera: contar el Taller en ese momento (recuento) y recién ahí entregar, o registrar que
// la persona YA lo tenía (entregado antes de cargarlo acá), que no descuenta de ningún lado.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rpcHerramientas, type Resultado } from './rpc'
import { MIGRACION_VESTIMENTA } from './vestimentaDePersona'

const uuid = z.string().uuid()

function refrescarLegajo(persona: string) {
  revalidatePath(`/administracion/personas/${persona}`)
}

const entregaSchema = z.object({
  persona: uuid,
  activo: uuid,
  cantidad: z.number().int('La cantidad es un número entero').min(1, 'La cantidad es 1 o más').max(1000),
  /** De dónde sale. null con `yaLaTenia`. */
  origen: uuid.nullable(),
  yaLaTenia: z.boolean().default(false),
  /** Sin stock: lo que se contó recién en `origen` (recuento), antes de entregar. */
  contadoEnOrigen: z.number().int().min(1, 'Lo contado es 1 o más').max(100000).optional(),
  nota: z.string().trim().max(400).optional(),
})

export async function entregarAPersonaAction(entrada: z.input<typeof entregaSchema>): Promise<Resultado<string>> {
  const p = entregaSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  if (!d.yaLaTenia && !d.origen) return { ok: false, error: 'Elegí de dónde sale' }
  if (d.contadoEnOrigen != null && d.origen) {
    const c = await rpcHerramientas<null>('ajustar_existencia', {
      p_activo: d.activo, p_ubicacion: d.origen, p_cantidad: d.contadoEnOrigen, p_detalle: 'recuento al entregar, desde el legajo',
    }, MIGRACION_VESTIMENTA)
    if (!c.ok) return c
  }
  const r = await rpcHerramientas<string>('entregar_a_persona', {
    p_persona: d.persona,
    p_items: [d.yaLaTenia ? { activo: d.activo, cantidad: d.cantidad } : { activo: d.activo, origen: d.origen, cantidad: d.cantidad }],
    p_nota: d.nota || null,
    p_ya_la_tenia: d.yaLaTenia,
  }, MIGRACION_VESTIMENTA)
  if (r.ok) refrescarLegajo(d.persona)
  return r
}

const devolucionSchema = z.object({
  persona: uuid,
  ubicacionPersona: uuid,
  activo: uuid,
  cantidad: z.number().int().min(1, 'La cantidad es 1 o más').max(1000),
  destino: uuid,
})

/** Vuelve al lugar elegido (el Taller, casi siempre). Es un movimiento: queda en el historial. */
export async function devolverDePersonaAction(entrada: z.input<typeof devolucionSchema>): Promise<Resultado<string | null>> {
  const p = devolucionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const r = await rpcHerramientas<string | null>('mover_existencias', {
    p_items: [{ activo: d.activo, origen: d.ubicacionPersona, cantidad: d.cantidad }],
    p_destino: d.destino, p_nota: 'devolución', p_bajar_carga: false,
  }, MIGRACION_VESTIMENTA)
  if (r.ok) refrescarLegajo(d.persona)
  return r
}

const bajaSchema = z.object({
  persona: uuid,
  ubicacionPersona: uuid,
  activo: uuid,
  cantidad: z.number().int().min(1, 'La cantidad es 1 o más').max(1000),
  motivo: z.enum(['descartada', 'perdida', 'robada'], { message: 'Elegí el motivo' }),
  detalle: z.string().trim().max(400).optional(),
})

/** Gastada o rota (descartada), perdida o robada. Queda en `activo_ajuste`; el ítem sigue en el catálogo. */
export async function bajaDePersonaAction(entrada: z.input<typeof bajaSchema>): Promise<Resultado> {
  const p = bajaSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const r = await rpcHerramientas<null>('dar_de_baja_parcial', {
    p_activo: d.activo, p_ubicacion: d.ubicacionPersona, p_cantidad: d.cantidad, p_motivo: d.motivo, p_detalle: d.detalle || null,
  }, MIGRACION_VESTIMENTA)
  if (r.ok) refrescarLegajo(d.persona)
  return r
}

const talle = z.string().trim().max(12).transform((v) => v.toUpperCase() || null)
const tallesSchema = z.object({ persona: uuid, camisa: talle, pantalon: talle, calzado: talle })

/** Los talles de la persona. La RLS deja escribir a quien puede ver a la persona. */
export async function guardarTallesAction(entrada: z.input<typeof tallesSchema>): Promise<Resultado> {
  const p = tallesSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { persona, ...t } = p.data
    const { data, error } = await supabase.from('persona_talle')
      .upsert({ persona_id: persona, ...t, actualizado_en: new Date().toISOString() }, { onConflict: 'persona_id' })
      .select('persona_id')
    if (error) return { ok: false, error: error.message }
    // Un upsert que la RLS no dejó pasar no da error: devuelve cero filas. Se dice.
    if (!data?.length) return { ok: false, error: 'No se guardó: sin permiso sobre esta persona.' }
    refrescarLegajo(persona)
    return { ok: true, dato: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}
