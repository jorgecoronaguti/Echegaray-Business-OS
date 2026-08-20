'use server'

// CONTRATO Y COBRANZA — las acciones que ESCRIBEN sobre `certificados`.
//
// ═══ LAS TRES ETAPAS VAN POR SEPARADO Y SIN ORDEN IMPUESTO ═══
//
// Certificado → facturado → cobrado. La tabla no obliga a completarlas en orden porque el estado
// intermedio ES el dato que sirve: un certificado sin facturar y una factura sin cobrar son
// exactamente lo que hay que ver. Lo que sí exige la base es que la FECHA y el MONTO de cada etapa
// vayan juntos —`certificados_facturacion_par_check`—: un monto facturado sin su fecha no se puede
// ubicar en el flujo de fondos, y una fecha sin monto no es nada.
//
// El certificado va al EJE CANÓNICO (`obra_canonica_id`) y deja `obra_id` legacy en null: las
// cuatro filas de `public.obras` están pausadas y no son la operación real.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const fechaOpt = z.union([fecha, z.literal('')]).optional()
const montoOpt = z.union([z.coerce.number().positive('Los montos van en positivo'), z.literal('')]).optional()
const nulo = <T,>(v: T | '' | undefined) => (v === '' || v === undefined ? null : v)

const certificadoSchema = z.object({
  numero: z.string().trim().optional(),
  descripcion: z.string().trim().optional(),
  fecha_certificacion: fecha.describe('fecha de certificación'),
  monto_certificado: z.coerce.number().positive('El monto certificado tiene que ser mayor a cero'),
  fecha_facturacion: fechaOpt,
  monto_facturado: montoOpt,
  referencia_factura: z.string().trim().optional(),
  fecha_cobranza: fechaOpt,
  monto_cobrado: montoOpt,
  notas: z.string().trim().optional(),
})

export async function crearCertificado(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = certificadoSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  // La base rechaza el par incompleto con un mensaje de constraint que nadie entiende. Se dice acá,
  // en castellano, antes de mandarlo.
  if (!!nulo(d.fecha_facturacion) !== !!nulo(d.monto_facturado)) {
    return { ok: false, error: 'La facturación va completa: fecha y monto, o ninguno de los dos.' }
  }
  if (!!nulo(d.fecha_cobranza) !== !!nulo(d.monto_cobrado)) {
    return { ok: false, error: 'La cobranza va completa: fecha y monto, o ninguno de los dos.' }
  }

  const supabase = await createClient()

  // El número se repite: `unique (obra_id, numero)` de la tabla vieja mira `obra_id` legacy, que
  // ahora va en null — y en Postgres dos NULL no chocan. O sea que la restricción existe pero NO
  // protege al eje canónico. Se chequea acá, contra la obra canónica, que es donde de verdad no
  // puede haber dos "Certificado 3".
  if (d.numero) {
    const { data: choque } = await supabase.from('certificados')
      .select('id').eq('obra_canonica_id', obraId).eq('numero', d.numero).maybeSingle()
    if (choque) return { ok: false, error: `Ya hay un certificado "${d.numero}" en esta obra` }
  }

  const { data, error } = await supabase.from('certificados').insert({
    obra_canonica_id: obraId,
    obra_id: null,
    numero: d.numero || null,
    descripcion: d.descripcion || null,
    fecha_certificacion: d.fecha_certificacion,
    monto_certificado: d.monto_certificado,
    fecha_facturacion: nulo(d.fecha_facturacion),
    monto_facturado: nulo(d.monto_facturado),
    referencia_factura: d.referencia_factura || null,
    fecha_cobranza: nulo(d.fecha_cobranza),
    monto_cobrado: nulo(d.monto_cobrado),
    notas: d.notas || null,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras'); revalidatePath('/clientes')
  return { ok: true, id: data.id as string }
}

/**
 * Borrar un certificado. Es la ÚNICA operación destructiva del módulo y existe por una razón
 * concreta: un certificado mal cargado corre el certificado, el facturado y el pendiente de cobrar
 * de la obra entera, y no hay ningún estado que lo pueda neutralizar —no existe "anulado"—. Un
 * número equivocado que no se puede sacar es peor que un borrado.
 */
export async function borrarCertificado(obraId: string, certificadoId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('certificados')
    .delete().eq('id', certificadoId).eq('obra_canonica_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras'); revalidatePath('/clientes')
  return { ok: true }
}
