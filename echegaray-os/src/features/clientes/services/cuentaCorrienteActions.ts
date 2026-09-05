'use server'

// PANTALLA 28 — «Registrar cobro». La acción con efecto económico de este módulo.
//
// ═══ ESTO NO ESCRIBE EL COBRO: LO ENCOLA ═══
//
// La verdad del cobro es la fila de la pestaña Cobranzas del Flujo de Caja, y la app corre en Vercel,
// que no habla con Google. Acá se deja una fila en `public.cobranza_cambio` y el worker de la VM la
// aplica con bisturí, verificando antes que la fila del Sheet siga siendo la misma. La pantalla lee
// el estado de esa fila y muestra qué pasó de verdad — no un «guardado» que no prueba nada.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { cobroSchema, type EntradaCobro, type EntradaEdicionPago } from './entradasCobranza'
import { mensajeDelCobro } from './propiedadesCertificado'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')

const registrarCobroSchema = z.object({
  // La fila física de Cobranzas. Los datos empiezan en la 5: por debajo está el encabezado, y una
  // escritura ahí rompe la tabla entera. El CHECK de la base dice lo mismo; esto lo dice antes, con
  // un mensaje que una persona entiende.
  cobranzaFila: z.number().int().min(5, 'Esa fila no es un renglón de cobranzas'),
  esquemaPagoId: z.string().uuid().nullable().optional(),
  fecha: fechaSchema,
  medio: z.enum(['transferencia', 'cheque', 'efectivo']).nullable().optional(),
  // LA HUELLA. Es lo que la pantalla vio en esa fila, y sin ella el worker no puede saber si la fila
  // se corrió de lugar entre el click y la aplicación. Se exige acá: un cambio sin huella se rechaza
  // igual del otro lado, y es mejor que la pantalla lo impida antes de prometer nada.
  huellaComprobante: z.string().trim().max(80).nullable().optional(),
  huellaMonto: z.number().nullable().optional(),
}).refine((v) => Boolean(v.huellaComprobante) || v.huellaMonto != null, {
  message: 'Falta la referencia de la fila: recargá la pantalla y volvé a intentar',
})

/**
 * Registra un cobro: encola la fecha (columna Q), el estado «Cobrado» (O) y, si se eligió, el medio (N).
 *
 * Son TRES filas de cola y no una: cada una escribe una celda distinta y cada una puede fallar por su
 * cuenta —el bisturí rechaza por celda, no por lote—. Si fueran una sola, el rechazo de una parte
 * dejaría el conjunto en un estado que nadie puede leer.
 */
export async function registrarCobro(entrada: EntradaCobro): Promise<ResultadoAccion> {
  const parsed = registrarCobroSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No hay sesión' }

  const base = {
    esquema_pago_id: v.esquemaPagoId ?? null,
    cobranza_fila: v.cobranzaFila,
    huella_comprobante: v.huellaComprobante ?? null,
    huella_monto: v.huellaMonto ?? null,
    pedido_por: user.id,
    estado: 'pendiente' as const,
    intentos: 0,
  }
  const filas = [
    { ...base, campo: 'fecha' as const, valor_nuevo: v.fecha },
    { ...base, campo: 'estado_cobrado' as const, valor_nuevo: 'Cobrado' },
    ...(v.medio ? [{ ...base, campo: 'medio' as const, valor_nuevo: v.medio }] : []),
  ]

  const { error } = await supabase.from('cobranza_cambio').insert(filas)
  if (error) return { ok: false, error: traducir(error.message) }

  revalidatePath('/clientes')
  revalidatePath('/calendario-financiero')
  return { ok: true }
}

const editarPagoSchema = z.object({
  esquemaPagoId: z.string().uuid(),
  cobranzaFila: z.number().int().min(5).nullable(),
  campo: z.enum(['fecha', 'monto', 'medio']),
  valorNuevo: z.string().trim().min(1, 'Falta el valor nuevo'),
  valorAnterior: z.string().trim().nullable().optional(),
  huellaComprobante: z.string().trim().max(80).nullable().optional(),
  huellaMonto: z.number().nullable().optional(),
  motivo: z.string().trim().max(300).optional(),
})

/**
 * PANTALLA 32 — editar la fecha, el monto o el medio de un pago del esquema.
 *
 * ═══ POR QUÉ UN PAGO SIN FILA EN COBRANZAS NO SE PUEDE EDITAR ACÁ ═══
 *
 * Un pago «previsto» que el dueño acordó pero todavía no facturó no tiene fila en el Sheet, así que
 * no hay celda que escribir. Editarlo sólo en Postgres crearía una fecha que existe en la app y no
 * en el Flujo de Caja: dos verdades para el mismo cobro. Se dice que falta la fila, en castellano.
 *
 * La reprogramación se guarda SIEMPRE (aunque el cliente no la vea): es la evidencia de cuántas
 * veces se movió una fecha, que es justo lo que hay que poder mirar al recotizar a ese cliente.
 */
export async function editarPago(entrada: EntradaEdicionPago): Promise<ResultadoAccion> {
  const parsed = editarPagoSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  if (v.cobranzaFila == null) {
    return {
      ok: false,
      error: 'Este pago todavía no tiene fila en Cobranzas. Cargalo primero en el Flujo de Caja y después se edita desde acá.',
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No hay sesión' }

  const { error } = await supabase.from('cobranza_cambio').insert({
    esquema_pago_id: v.esquemaPagoId,
    cobranza_fila: v.cobranzaFila,
    huella_comprobante: v.huellaComprobante ?? null,
    huella_monto: v.huellaMonto ?? null,
    campo: v.campo,
    valor_nuevo: v.valorNuevo,
    // El valor anterior es lo que hace auditable el cambio: sin él, «se movió la fecha» no dice
    // desde cuándo. Es también lo único que va a permitir, más adelante, medir el pago en término.
    valor_anterior: v.valorAnterior ?? null,
    pedido_por: user.id,
    estado: 'pendiente',
    intentos: 0,
  })
  if (error) return { ok: false, error: traducir(error.message) }

  revalidatePath('/clientes')
  return { ok: true }
}

/**
 * Un error de Postgres no es un mensaje para una persona. Se traducen los dos que van a aparecer de
 * verdad y el resto se devuelve tal cual: inventar un texto amable para un error desconocido esconde
 * justamente el que hay que ir a mirar.
 */
function traducir(mensaje: string): string {
  if (/permission denied/i.test(mensaje)) {
    return 'Tu usuario no tiene permiso para registrar cobros'
  }
  if (/violates check constraint .*cobranza_fila/i.test(mensaje)) {
    return 'Esa fila no es un renglón de cobranzas'
  }
  return mensaje
}

/**
 * LO QUE APRIETA LA PANTALLA 28 — «Registrar cobro» desde el formulario del panel del certificado.
 *
 * ═══ POR QUÉ ESTA ADAPTADORA EXISTE Y NO SE LLAMA A `registrarCobro` DIRECTO ═══
 *
 * `registrarCobro` habla el idioma de la COLA: fila física, huella, fecha ya en ISO. El panel habla
 * el de una persona: un `<form>` con la fecha, el monto escrito en argentino y el medio elegido.
 * Traducir en el navegador obligaría a mandarle al cliente la fila y la huella, y ahí se rompe lo
 * que la huella protege — un `curl` podría declarar la huella que le convenga y el worker escribiría
 * sobre la fila equivocada creyendo que la verificó.
 *
 * Así que la fila y la huella se LEEN acá, del certificado, con la sesión del que aprieta el botón.
 * Del formulario sólo viaja lo que una persona escribió.
 */
export async function registrarCobroDeCertificado(
  certificadoId: string, form: FormData,
): Promise<ResultadoAccion> {
  if (!certificadoId) return { ok: false, error: 'Falta el certificado que se está cobrando' }
  // `cobroSchema` es el de la pantalla: entiende «3.100.000» como tres millones cien mil y rechaza
  // el 30 de febrero. Ver `entradasCobranza.ts`.
  const parsed = cobroSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: cert, error } = await supabase
    .from('certificado_cliente')
    // `monto` entra para poder DETECTAR EL COBRO PARCIAL con el importe de la base y no con el que
    // manda el navegador: un `curl` podría declarar el monto que le convenga y el aviso callarse.
    .select('cobranza_fila, huella_comprobante, huella_monto, monto')
    .eq('id', certificadoId)
    .maybeSingle()
  if (error) return { ok: false, error: traducir(error.message) }
  if (!cert) return { ok: false, error: 'No se encontró ese certificado' }
  if (cert.cobranza_fila == null) {
    return {
      ok: false,
      error: 'Este certificado no tiene fila en Cobranzas. Cargá el cobro en el Flujo de Caja y volvé.',
    }
  }

  const r = await registrarCobro({
    cobranzaFila: cert.cobranza_fila,
    fecha: parsed.data.fecha,
    medio: parsed.data.medio,
    huellaComprobante: cert.huella_comprobante,
    huellaMonto: cert.huella_monto,
  })
  // LO QUE SE ENCOLÓ NO ES LO QUE SE ESCRIBIÓ, y eso se dice. El formulario pide un monto y la cola
  // sólo escribe fecha, estado y medio: sin este mensaje, un cobro parcial se iba con un «Encolado»
  // que afirmaba un cobro total. Ver `mensajeDelCobro`.
  if (!r.ok) return r
  return { ok: true, mensaje: mensajeDelCobro(parsed.data.monto, Number(cert.monto)) }
}
