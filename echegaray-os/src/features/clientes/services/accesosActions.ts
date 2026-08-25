'use server'

// PANTALLA 31 — habilitar, revocar y reenviar la invitación al portal.
//
// Habilitar un acceso es dejar entrar a un TERCERO a la información económica de una obra. Es la
// acción de mayor alcance de este módulo, y por eso el mail que la acompaña no sale de acá: se
// encola en `public.mail_saliente` y lo manda el worker de la VM con el Gmail del orquestador.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
// La plantilla del mail viene del NÚCLEO, con la misma ruta relativa que usan los demás puertos web
// de este repo (ver features/obras/services/operacionService.ts). No se reescribe acá: el mismo mail
// lo puede mandar el timer de avisos, y dos plantillas para un mensaje es cómo se llega a que el
// cliente reciba dos textos distintos según quién apretó el botón.
import { habilitacionPortal } from '../../../../orquestador/comunicacion/portal/plantillas.mjs'
import type { ResultadoAccion } from '../types'

const habilitarSchema = z.object({
  clienteId: z.string().uuid(),
  // Se normaliza en el borde: el CHECK de `cliente_acceso.email` exige el mail ya en minúsculas y
  // sin espacios, y sin esto el rechazo llegaría como un error crudo de Postgres.
  email: z.string().trim().toLowerCase().email('Escribí un correo válido'),
  personaContacto: z.string().trim().max(120).optional(),
  puedeVerObra: z.boolean().default(true),
  puedeVerMontos: z.boolean().default(false),
  puedeAprobar: z.boolean().default(false),
  // `null` = todas las obras del cliente. Un array VACÍO significa ninguna y no es lo mismo: el
  // vacío es el estado natural de un formulario a medio llenar, y confundirlo con «todas» abriría
  // el acceso por accidente.
  obras: z.array(z.string().trim().min(1)).nullable().default(null),
  avisarPorMail: z.boolean().default(true),
})

/**
 * Habilita un acceso y, si se pidió, encola el mail de aviso.
 *
 * ═══ EL MAIL SE ENCOLA DESPUÉS Y SU FALLA NO DESHACE EL ACCESO ═══
 *
 * Son dos hechos distintos: el acceso quedó habilitado (y funciona: la persona puede pedir su enlace
 * cuando quiera) y el aviso salió o no. Si el encolado del mail fallara y eso revirtiera la
 * habilitación, un problema de correo dejaría al cliente sin acceso. Se informa el mail no enviado
 * sin mentir sobre el acceso, que sí está.
 */
export async function habilitarAcceso(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = habilitarSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No hay sesión' }

  const { data, error } = await supabase
    .from('cliente_acceso')
    .insert({
      cliente_id: v.clienteId,
      email: v.email,
      persona_contacto: v.personaContacto || null,
      puede_ver_obra: v.puedeVerObra,
      puede_ver_montos: v.puedeVerMontos,
      puede_aprobar: v.puedeAprobar,
      obras: v.obras,
      habilitado_por: user.id,
      habilitado_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { ok: false, error: 'Ese correo ya tiene un acceso. Si estaba revocado, volvé a habilitarlo desde su fila.' }
    }
    if (/permission denied/i.test(error.message)) {
      return { ok: false, error: 'Tu usuario no puede habilitar accesos al portal' }
    }
    return { ok: false, error: error.message }
  }

  // El hecho queda en el libro append-only: es la respuesta a «¿quién le abrió la puerta a esta persona?».
  await supabase.from('cliente_actividad_portal').insert({
    cliente_id: v.clienteId, acceso_id: data.id, tipo: 'habilitado',
    detalle: `acceso habilitado para ${v.email}`,
  })

  if (v.avisarPorMail) {
    const enviado = await encolarInvitacion(supabase, { accesoId: data.id, clienteId: v.clienteId, email: v.email, persona: v.personaContacto ?? null, pedidoPor: user.id })
    if (!enviado.ok) {
      revalidatePath('/clientes')
      return { ok: false, error: `El acceso quedó habilitado, pero no pude encolar el aviso: ${enviado.error}` }
    }
  }

  revalidatePath('/clientes')
  return { ok: true, id: data.id }
}

const idSchema = z.object({ accesoId: z.string().uuid() })

/**
 * Revocar es un UPDATE, no un DELETE.
 *
 * Un acceso borrado no deja rastro de que existió, y la pregunta «¿quién aprobó este certificado?»
 * tiene que poder responderse un año después aunque a esa persona ya se le haya quitado el acceso.
 * `cliente_de_sesion()` devuelve NULL para un acceso revocado, así que la sesión que tuviera abierta
 * deja de ver todo en la consulta siguiente.
 */
export async function revocarAcceso(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = idSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: 'Acceso inválido' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('cliente_acceso')
    .update({ revocado_at: new Date().toISOString() })
    .eq('id', parsed.data.accesoId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/clientes')
  return { ok: true }
}

/**
 * Reenvía la invitación. NO es idempotente a propósito: reenviar es exactamente lo que se pide
 * cuando el primer mail se perdió, así que la clave de idempotencia va en null y este mail sale
 * aunque ya haya salido otro igual.
 */
export async function reenviarInvitacion(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = idSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: 'Acceso inválido' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No hay sesión' }

  const { data: acceso, error } = await supabase
    .from('cliente_acceso')
    .select('id, cliente_id, email, persona_contacto, revocado_at')
    .eq('id', parsed.data.accesoId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!acceso) return { ok: false, error: 'No encontré ese acceso' }
  // Reenviarle la invitación a alguien a quien le sacamos el acceso es el peor de los dos errores.
  if (acceso.revocado_at) return { ok: false, error: 'Ese acceso está revocado. Habilitalo de nuevo antes de invitar.' }

  const r = await encolarInvitacion(supabase, {
    accesoId: acceso.id, clienteId: acceso.cliente_id, email: acceso.email,
    persona: acceso.persona_contacto, pedidoPor: user.id, reenvio: true,
  })
  if (!r.ok) return { ok: false, error: r.error }

  revalidatePath('/clientes')
  return { ok: true }
}

type DatosInvitacion = {
  accesoId: string; clienteId: string; email: string
  persona: string | null; pedidoPor: string; reenvio?: boolean
}

/**
 * Arma el mail con la plantilla del orquestador y lo deja en la cola.
 *
 */
async function encolarInvitacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  d: DatosInvitacion,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: cliente } = await supabase
    .from('clientes').select('nombre_comercial').eq('id', d.clienteId).maybeSingle()

  const plantilla = habilitacionPortal({
    para: d.email,
    persona_contacto: d.persona,
    cliente_nombre: cliente?.nombre_comercial ?? 'tu obra',
    // En un reenvío la clave va en null: reenviar es pedir explícitamente el duplicado.
    acceso_id: d.reenvio ? null : d.accesoId,
  })

  const { error } = await supabase.from('mail_saliente').insert({
    para: d.email,
    asunto: plantilla.asunto,
    cuerpo_html: plantilla.html,
    plantilla: plantilla.plantilla,
    clave_unica: plantilla.clave_unica,
    cliente_id: d.clienteId,
    pedido_por: d.pedidoPor,
    estado: 'pendiente',
    intentos: 0,
  })
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      // La clave ya estaba: el mail salió (o está por salir). No es un fallo.
      return { ok: true }
    }
    return { ok: false, error: error.message }
  }

  await supabase.from('cliente_acceso')
    .update({ invitacion_enviada_at: new Date().toISOString() }).eq('id', d.accesoId)
  return { ok: true }
}
