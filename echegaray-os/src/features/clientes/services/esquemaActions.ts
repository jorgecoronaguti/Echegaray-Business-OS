'use server'

// PANTALLA 32 — publicar el esquema al portal y ajustar lo que el cliente ve de cada pago.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { esquemaPublicado } from '../../../../orquestador/comunicacion/portal/plantillas.mjs'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import type { PagoEsquema } from '../types'
import { proximoVencimiento } from './esquemaService'
import { editarPago } from './cuentaCorrienteActions'
import {
  cambioPagoSchema,
  type CambioPago, type EntradaAjustePago, type EntradaPublicacion,
} from './entradasCobranza'

const ajustarSchema = z.object({
  esquemaPagoId: z.string().uuid(),
  visiblePortal: z.boolean().optional(),
  avisoDias: z.number().int().min(0).max(365).nullable().optional(),
  mostrarReprogramaciones: z.boolean().optional(),
  notaInterna: z.string().trim().max(2000).nullable().optional(),
  orden: z.number().int().min(0).max(9999).optional(),
})

/**
 * Ajusta lo que es PROPIO de la app: visibilidad, aviso, nota interna y orden.
 *
 * La fecha, el monto, el medio y el estado NO se tocan acá — son espejo de las columnas Q/J/N/O de
 * Cobranzas y se cambian con `editarPago`, que encola. El grant de la base tampoco los deja: si una
 * action distraída los mandara, rebota con permission denied en vez de crear una segunda verdad.
 *
 * Marcar `cambio_pendiente` cuando cambia la VISIBILIDAD de algo ya publicado es deliberado: mostrar
 * un pago que estaba oculto es un cambio para el cliente aunque el importe no se haya movido.
 */
export async function ajustarPagoEsquema(entrada: EntradaAjustePago): Promise<ResultadoAccion> {
  const parsed = ajustarSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const cambios: Record<string, unknown> = { actualizado_at: new Date().toISOString() }
  if (v.visiblePortal !== undefined) cambios.visible_portal = v.visiblePortal
  if (v.avisoDias !== undefined) cambios.aviso_dias = v.avisoDias
  if (v.mostrarReprogramaciones !== undefined) cambios.mostrar_reprogramaciones = v.mostrarReprogramaciones
  if (v.notaInterna !== undefined) cambios.nota_interna = v.notaInterna
  if (v.orden !== undefined) cambios.orden = v.orden
  if (v.visiblePortal !== undefined) cambios.cambio_pendiente = true

  const supabase = await createClient()
  const { error } = await supabase.from('esquema_pago').update(cambios).eq('id', v.esquemaPagoId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/clientes')
  return { ok: true }
}

const publicarSchema = z.object({ clienteId: z.string().uuid() })

/**
 * PUBLICA EL ESQUEMA AL PORTAL y le avisa al cliente por mail.
 *
 * ═══ SE PUBLICA LO VISIBLE, Y NADA MÁS ═══
 *
 * Sólo los pagos marcados `visible_portal`. Un esquema a medio armar no puede filtrarse: la fecha
 * que el dueño está tanteando no es una fecha comprometida con el cliente. Los que no están
 * marcados no cambian de estado y el RLS los sigue ocultando aunque alguien consulte PostgREST.
 *
 * ═══ SI NO HAY NADA VISIBLE, NO SE PUBLICA NI SE AVISA ═══
 *
 * Publicar un esquema vacío le mandaría al cliente un mail que lo invita a mirar una pantalla en
 * blanco. Se dice que falta marcar los pagos, que es lo que hay que hacer.
 */
export async function publicarEsquema(entrada: EntradaPublicacion): Promise<ResultadoAccion> {
  const parsed = publicarSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: 'Cliente inválido' }
  const { clienteId } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No hay sesión' }

  const { data: pagos, error: errLectura } = await supabase
    .from('esquema_pago')
    .select('id, cliente_id, obra_id, cobranza_fila, concepto, fecha, monto, reparo, estado, medio,'
      + ' visible_portal, aviso_dias, mostrar_reprogramaciones, nota_interna, reprogramaciones,'
      + ' publicado_at, cambio_pendiente, orden')
    .eq('cliente_id', clienteId)
  if (errLectura) return { ok: false, error: errLectura.message }

  const visibles = ((pagos ?? []) as unknown as PagoEsquema[]).filter((p) => p.visible_portal)
  if (!visibles.length) {
    return { ok: false, error: 'No hay ningún pago marcado como visible para el cliente. Marcá los que quiera ver y volvé a publicar.' }
  }

  const publicadoAt = new Date().toISOString()
  const { error: errPublicar } = await supabase
    .from('esquema_pago')
    .update({ publicado_at: publicadoAt, cambio_pendiente: false, actualizado_at: publicadoAt })
    .eq('cliente_id', clienteId)
    .eq('visible_portal', true)
  if (errPublicar) return { ok: false, error: errPublicar.message }

  const aviso = await encolarAvisoPublicacion(supabase, { clienteId, publicadoAt, visibles, pedidoPor: user.id })

  revalidatePath('/clientes')
  revalidatePath('/portal')
  // El esquema QUEDÓ publicado aunque el mail no salga: son dos hechos y se informan por separado.
  if (!aviso.ok) return { ok: false, error: `El esquema quedó publicado, pero no pude encolar el aviso: ${aviso.error}` }
  return { ok: true }
}

type DatosPublicacion = {
  clienteId: string; publicadoAt: string; visibles: PagoEsquema[]; pedidoPor: string
}

async function encolarAvisoPublicacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  d: DatosPublicacion,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: cliente } = await supabase
    .from('clientes').select('nombre_comercial').eq('id', d.clienteId).maybeSingle()

  // A quién se le avisa: los accesos VIVOS del cliente. Un acceso revocado no recibe nada.
  const { data: accesos } = await supabase
    .from('cliente_acceso')
    .select('email, persona_contacto')
    .eq('cliente_id', d.clienteId)
    .is('revocado_at', null)

  if (!accesos?.length) {
    // No es un fallo del publicado: el esquema está publicado y lo verá quien entre. Simplemente
    // todavía no hay a quién escribirle.
    return { ok: true }
  }

  const proximo = proximoVencimiento(d.visibles)
  for (const a of accesos) {
    const plantilla = esquemaPublicado({
      persona_contacto: a.persona_contacto,
      cliente_nombre: cliente?.nombre_comercial ?? 'tu obra',
      cantidad_pagos: d.visibles.length,
      proximo: proximo ? { fecha: proximo.fecha, monto: proximo.monto } : null,
      cliente_id: d.clienteId,
      publicado_at: d.publicadoAt,
    })
    const { error } = await supabase.from('mail_saliente').insert({
      para: a.email,
      asunto: plantilla.asunto,
      cuerpo_html: plantilla.html,
      plantilla: plantilla.plantilla,
      // La clave lleva el destinatario además del publicado_at: si no, el segundo acceso del mismo
      // cliente chocaría contra el UNIQUE del primero y sólo se enteraría una persona.
      clave_unica: plantilla.clave_unica ? `${plantilla.clave_unica}:${a.email}` : null,
      cliente_id: d.clienteId,
      pedido_por: d.pedidoPor,
      estado: 'pendiente',
      intentos: 0,
    })
    if (error && !/duplicate key|unique/i.test(error.message)) {
      return { ok: false, error: error.message }
    }
  }
  return { ok: true }
}

/**
 * LO QUE APRIETA LA PANTALLA 32 — un cambio sobre un pago, que va a DOS destinos distintos.
 *
 * ═══ LA COSTURA ESTÁ ACÁ, Y ES LA PARTE QUE IMPORTA ═══
 *
 * El panel de la 32 toca de a un campo y no distingue —ni tiene por qué— entre los que son ESPEJO
 * del Sheet y los que son PROPIOS de la app. Pero el destino no es el mismo:
 *
 *   fecha · monto · medio    → columnas Q/J/N de Cobranzas. Se ENCOLAN en `cobranza_cambio` y las
 *                              escribe el worker con bisturí. La app no toca esas columnas ni
 *                              podría: el grant de `esquema_pago` no las incluye.
 *   visible_portal · aviso   → son de la app. Se escriben directo.
 *   mostrar_repro · nota
 *
 * Mandar todo por un solo camino era la tentación y es el error: escribir la fecha en Postgres
 * dejaría al esquema diciendo una cosa y al Flujo de Caja otra sobre el mismo cobro.
 *
 * El VALOR ANTERIOR se lee acá, del pago, y no llega del navegador: es lo que hace auditable el
 * cambio, y un valor anterior declarado por el cliente puede ser cualquiera.
 */
export async function editarPagoDelEsquema(
  pagoId: string, cambio: CambioPago,
): Promise<ResultadoAccion> {
  if (!pagoId) return { ok: false, error: 'Falta el pago que se está editando' }
  const parsed = cambioPagoSchema.safeParse(cambio)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const supabase = await createClient()
  const { data: pago, error } = await supabase
    .from('esquema_pago')
    .select('cobranza_fila, huella_comprobante, huella_monto, fecha, monto, medio')
    .eq('id', pagoId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!pago) return { ok: false, error: 'No se encontró ese pago' }

  // PRIMERO LO QUE VA AL SHEET. Si la cola rechaza, no se tocan los campos propios: el pago queda
  // como estaba y el mensaje explica por qué, en vez de dejar la mitad aplicada.
  const alSheet: { campo: 'fecha' | 'monto' | 'medio'; nuevo: string; anterior: string | null }[] = []
  if (v.fecha !== undefined) alSheet.push({ campo: 'fecha', nuevo: v.fecha, anterior: pago.fecha })
  if (v.monto !== undefined) {
    alSheet.push({ campo: 'monto', nuevo: String(v.monto), anterior: pago.monto == null ? null : String(pago.monto) })
  }
  if (v.medio !== undefined && v.medio !== null) {
    alSheet.push({ campo: 'medio', nuevo: v.medio, anterior: pago.medio })
  }
  for (const c of alSheet) {
    const r = await editarPago({
      esquemaPagoId: pagoId,
      cobranzaFila: pago.cobranza_fila,
      campo: c.campo,
      valorNuevo: c.nuevo,
      valorAnterior: c.anterior,
      huellaComprobante: pago.huella_comprobante,
      huellaMonto: pago.huella_monto,
    })
    if (!r.ok) return r
  }

  // DESPUÉS LO PROPIO DE LA APP. `undefined` = la pantalla no lo tocó, y no se manda: mandar el
  // objeto entero pisaría lo que otra persona acababa de cambiar en el campo de al lado.
  const propios = {
    visiblePortal: v.visible_portal,
    avisoDias: v.aviso_dias,
    mostrarReprogramaciones: v.mostrar_reprogramaciones,
    notaInterna: v.nota_interna,
  }
  if (Object.values(propios).some((x) => x !== undefined)) {
    return ajustarPagoEsquema({ esquemaPagoId: pagoId, ...propios })
  }
  return { ok: true }
}
