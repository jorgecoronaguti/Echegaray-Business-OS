'use server'

// LAS HORAS TRABAJADAS, IMPUTADAS A LA OBRA — la punta REAL del plan contra real de HH.
//
// ═══ POR QUÉ EXISTE (19/08/2026) ═══
//
// «HH real» venía `—` en las ocho obras y la lectura fácil era "todavía nadie las cargó". No: NO SE
// PODÍAN CARGAR. `registros_hh.obra_id` era `not null` contra `public.obras` —la tabla legacy, 4
// filas, ninguna activa—, así que imputar una hora a San Francisco exigía inventar el uuid de una
// obra que no existe en el eje canónico. La columna `obra_canonica_id` estaba al lado, opcional.
// El eje muerto era obligatorio y el vivo optativo. Ver `20260819T0100_hh_sobre_el_eje_canonico.sql`.
//
// ═══ LO QUE ESTA ACCIÓN NO HACE ═══
//
// No calcula costo. `horas × tarifa` no se guarda acá y es deliberado desde el diseño original de la
// tabla: el costo de mano de obra ya se registra en su propia fuente, y valorizarlo también acá
// crearía la segunda versión del mismo peso. Tampoco administra legajos: `personas` es de RRHH.
//
// LA SEMANA ES EL GRANO. `fecha_inicio_semana` existe porque la fuente de estas horas —JORNALES— es
// quincenal/semanal, no diaria. Se normaliza al LUNES: si dos personas cargan la misma semana con
// fechas distintas del mismo lunes a domingo, la clave única no las vería como la misma y se
// duplicarían las horas.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import { lunesDeLaSemana } from './semana'

const CATEGORIAS = ['oficial_especializado', 'oficial', 'medio_oficial', 'ayudante'] as const

const hhSchema = z.object({
  trabajador_o_cuadrilla: z.string().trim().min(1, 'Poné quién trabajó (persona o cuadrilla)'),
  semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí la semana'),
  horas: z.coerce.number().positive('Las horas tienen que ser mayores que cero').max(400, 'Son demasiadas horas para una semana'),
  categoria: z.union([z.enum(CATEGORIAS), z.literal('')]).optional(),
  notas: z.string().trim().optional(),
})

export async function imputarHH(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = hhSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('registros_hh').insert({
    // El eje canónico y SÓLO el canónico. `obra_id` queda null: es la columna legacy y las filas
    // nuevas no pertenecen a ese eje.
    obra_canonica_id: obraId,
    trabajador_o_cuadrilla: d.trabajador_o_cuadrilla,
    categoria: d.categoria || null,
    fecha_inicio_semana: lunesDeLaSemana(d.semana),
    horas: d.horas,
    fuente_legacy: 'web:obra',
    notas: d.notas || null,
  })
  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? 'Esa persona o cuadrilla ya tiene horas cargadas en esa semana para esta obra. Editá el registro en vez de agregar otro.'
        : error.message,
    }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

export async function borrarHH(obraId: string, registroId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('obra_canonica_id')` no sobra: sin él, un id de otra obra borraría horas ajenas.
  const { error } = await supabase
    .from('registros_hh').delete().eq('id', registroId).eq('obra_canonica_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}
