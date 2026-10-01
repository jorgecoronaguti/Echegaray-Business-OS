'use server'

// FIRMAR EL RECIBO DE UN GASTO MANUAL (dueño, 01/10/2026) — la escritura. Una sola, por la función de la base
// (`firmar_recibo_gasto_manual`, migración 20261001T0900): ella decide quién puede y que no se pisa. Acá se
// valida la FORMA (Zod, y la misma regla de aclaración/DNI que usa la pantalla) y se traduce el error.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { esTrazoGuardable } from '@/shared/firma/firma'
import { mensajeDeError } from '../logica/formularios'
import { validarFirmaDelRecibo } from '../logica/reciboFirma'

export type ResultadoFirmaRecibo = { ok: true; firmado_en: string } | { ok: false; error: string }

const entrada = z.object({
  rendicion: z.string().uuid('Falta qué gasto se firma'),
  trazo: z.string().refine(esTrazoGuardable, 'Firmá arriba de la línea: el recuadro está vacío.'),
  aclaracion: z.string().max(300),
  dni: z.string().max(30),
})

export async function firmarReciboGastoManualAction(e: z.input<typeof entrada>): Promise<ResultadoFirmaRecibo> {
  const p = entrada.safeParse(e)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const v = validarFirmaDelRecibo({ aclaracion: p.data.aclaracion, dni: p.data.dni })
  if (!v.ok) return v
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('firmar_recibo_gasto_manual', {
      p_rendicion: p.data.rendicion, p_trazo: p.data.trazo, p_aclaracion: v.dato.aclaracion, p_dni: v.dato.dni,
    })
    if (error) return { ok: false, error: mensajeDeError(error) }
    revalidatePath('/administracion/compras')
    revalidatePath('/mi-informacion/efectivo')
    return { ok: true, firmado_en: String(data) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}
