'use server'

// LO QUE EL CLIENTE HACE — pantalla 29: aprobar, observar, informar una transferencia, consultar.
//
// ═══ EL CLIENTE ESCRIBE, PERO NO DECIDE ═══
//
// Aprobar un certificado tiene peso contractual, así que cada una de estas acciones deja su renglón
// en `cliente_actividad_portal`, que es append-only y sin UPDATE por policy: una aprobación que se
// puede editar después no prueba nada.
//
// Ninguna de estas acciones toca Cobranzas ni la caja. Que el cliente diga «te transferí» no es que
// el dinero entró: eso lo confirma el extracto del banco y lo concilia Administración.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  crearConsultaSchema, informarTransferenciaSchema, observarCertificadoSchema, type Resultado,
} from '../types'
import { getClienteDeSesion, getPermisos } from './portalService'

/** El contexto de quien está actuando. Sin acceso vivo no se escribe nada. */
async function contexto() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No hay sesión' as const }

  const { data: acceso } = await supabase
    .from('cliente_acceso')
    .select('id, cliente_id, puede_aprobar, revocado_at')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!acceso || acceso.revocado_at) return { error: 'Tu acceso al portal no está vigente' as const }
  return { supabase, acceso }
}

const idSchema = z.object({ certificadoId: z.string().uuid() })

/**
 * APRUEBA UN CERTIFICADO.
 *
 * ═══ POR QUÉ SE VUELVE A MIRAR `puede_aprobar` ACÁ ═══
 *
 * El botón ya está escondido para quien no puede aprobar, pero esconder un botón no es un permiso:
 * esta acción se invoca por HTTP y cualquiera con la sesión puede llamarla. La RLS tampoco alcanza —
 * filtra QUÉ FILAS ve, no si esta persona en particular puede aprobarlas. Se pregunta acá, ahora,
 * que es cuando se va a escribir.
 */
export async function aprobarCertificado(entrada: unknown): Promise<Resultado> {
  const parsed = idSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: 'Certificado inválido' }

  const c = await contexto()
  if ('error' in c) return { ok: false, error: c.error }
  if (!c.acceso.puede_aprobar) {
    return { ok: false, error: 'Tu usuario puede ver los certificados pero no aprobarlos. Avisale a quien firma en tu empresa.' }
  }

  const { data: cert, error: errCert } = await c.supabase
    .from('certificado_cliente')
    .select('id, numero, estado, monto')
    .eq('id', parsed.data.certificadoId)
    .maybeSingle()
  if (errCert) return { ok: false, error: errCert.message }
  // La RLS ya devuelve vacío para un certificado ajeno: acá eso llega como «no existe», que para el
  // cliente es la respuesta correcta — no tiene por qué enterarse de que existe.
  if (!cert) return { ok: false, error: 'No encontré ese certificado' }
  // Un certificado ya cobrado o en disputa no se aprueba: el estado ya lo superó.
  if (['cobrado', 'aprobado', 'en_disputa'].includes(String(cert.estado))) {
    return { ok: false, error: `Ese certificado ya está ${cert.estado === 'aprobado' ? 'aprobado' : String(cert.estado)}` }
  }

  const { error } = await c.supabase
    .from('certificado_cliente')
    .update({ estado: 'aprobado', actualizado_at: new Date().toISOString() })
    .eq('id', cert.id)
  if (error) return { ok: false, error: error.message }

  await c.supabase.from('cliente_actividad_portal').insert({
    cliente_id: c.acceso.cliente_id, acceso_id: c.acceso.id, tipo: 'aprobo_certificado',
    referencia: String(cert.numero ?? cert.id), detalle: 'aprobado desde el portal',
    monto: cert.monto ?? null,
  })

  revalidatePath('/portal')
  revalidatePath('/clientes')
  return { ok: true }
}

/**
 * OBSERVA UN CERTIFICADO. No requiere `puede_aprobar`: observar es señalar un problema, y quien mira
 * la obra tiene que poder decir que algo no cierra aunque no sea el que firma. Bloquear la
 * observación empujaría ese reclamo a un canal donde no queda registrado.
 */
export async function observarCertificado(entrada: unknown): Promise<Resultado> {
  const parsed = observarCertificadoSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const c = await contexto()
  if ('error' in c) return { ok: false, error: c.error }

  const { data: cert } = await c.supabase
    .from('certificado_cliente').select('id, numero').eq('id', parsed.data.certificadoId).maybeSingle()
  if (!cert) return { ok: false, error: 'No encontré ese certificado' }

  const { error } = await c.supabase
    .from('certificado_cliente')
    .update({ estado: 'observado', observacion: parsed.data.texto, actualizado_at: new Date().toISOString() })
    .eq('id', cert.id)
  if (error) return { ok: false, error: error.message }

  await c.supabase.from('cliente_actividad_portal').insert({
    cliente_id: c.acceso.cliente_id, acceso_id: c.acceso.id, tipo: 'observo_certificado',
    referencia: String(cert.numero ?? cert.id), detalle: parsed.data.texto,
  })

  revalidatePath('/portal')
  revalidatePath('/clientes')
  return { ok: true }
}

/**
 * INFORMA UNA TRANSFERENCIA.
 *
 * NO es un cobro y no toca Cobranzas. Nace `informado` y sólo Administración puede pasarlo a
 * `conciliado`, después de verlo en el extracto. Si esto escribiera en el Flujo de Caja, el cliente
 * estaría moviendo la caja de la empresa desde su teléfono.
 */
export async function informarTransferencia(entrada: unknown): Promise<Resultado> {
  const parsed = informarTransferenciaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const c = await contexto()
  if ('error' in c) return { ok: false, error: c.error }

  const { error } = await c.supabase.from('pago_informado').insert({
    cliente_id: c.acceso.cliente_id,
    esquema_pago_id: v.esquemaPagoId ?? null,
    monto: v.monto,
    fecha: v.fecha,
    referencia: v.referencia ?? null,
    comprobante_storage_path: v.comprobanteStoragePath ?? null,
    informado_por: c.acceso.id,
    estado: 'informado',
  })
  if (error) return { ok: false, error: error.message }

  await c.supabase.from('cliente_actividad_portal').insert({
    cliente_id: c.acceso.cliente_id, acceso_id: c.acceso.id, tipo: 'informo_transferencia',
    referencia: v.referencia ?? null, detalle: `transferencia informada del ${v.fecha}`, monto: v.monto,
  })

  revalidatePath('/portal')
  revalidatePath('/clientes')
  return { ok: true }
}

/** Deja una consulta por escrito. Responderla y cerrarla es de Administración. */
export async function crearConsulta(entrada: unknown): Promise<Resultado> {
  const parsed = crearConsultaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const v = parsed.data

  const c = await contexto()
  if ('error' in c) return { ok: false, error: c.error }

  const { error } = await c.supabase.from('consulta_portal').insert({
    cliente_id: c.acceso.cliente_id,
    obra_id: v.obraId ?? null,
    acceso_id: c.acceso.id,
    titulo: v.titulo,
    cuerpo: v.cuerpo,
    estado: 'abierta',
  })
  if (error) return { ok: false, error: error.message }

  await c.supabase.from('cliente_actividad_portal').insert({
    cliente_id: c.acceso.cliente_id, acceso_id: c.acceso.id, tipo: 'consulta',
    referencia: v.titulo, detalle: v.cuerpo.slice(0, 500),
  })

  revalidatePath('/portal')
  revalidatePath('/clientes')
  return { ok: true }
}

export { getPermisos, getClienteDeSesion }
