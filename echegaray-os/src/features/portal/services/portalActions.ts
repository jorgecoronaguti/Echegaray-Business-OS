'use server'

// LO QUE EL CLIENTE HACE — pantallas 29 y 30: entrar, aprobar, observar, informar una transferencia
// y consultar.
//
// ═══ EL CLIENTE ESCRIBE, PERO NO DECIDE ═══
//
// Aprobar un certificado tiene peso contractual, así que cada una de estas acciones deja su renglón
// en `cliente_actividad_portal`, que es append-only y sin UPDATE por policy: una aprobación que se
// puede editar después no prueba nada.
//
// Ninguna de estas acciones toca Cobranzas ni la caja. Que el cliente diga «te transferí» no es que
// el dinero entró: eso lo confirma el extracto del banco y lo concilia Administración.
//
// ═══ LAS FIRMAS SON LAS DE LA PANTALLA; LOS CUERPOS, LOS DEL FRENTE DE DATOS ═══
//
// Los dos frentes trajeron este archivo. Las pantallas llaman `aprobarCertificado(id)` y
// `observarCertificado(id, texto)` —parámetros sueltos, que es lo que un `onClick` tiene a mano— y
// el frente de datos las había escrito como `(entrada: unknown)` con un objeto. Se conservan las
// firmas de la pantalla y los cuerpos reales: al revés, había que tocar cinco componentes para no
// ganar nada. Lo que NO se conserva es `unknown` donde el objeto viaja entero (`crearConsulta`,
// `informarTransferencia`): con `unknown`, la pantalla mandaba `obra_id` a un esquema que espera
// `obraId` y el compilador no decía nada — la consulta se guardaba sin obra.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { faltaLaMigracion } from '@/features/mi-cuenta/services/miCuentaService'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { RUTA_PORTAL } from '../rutas'
import {
  crearConsultaSchema, informarTransferenciaSchema, observarCertificadoSchema,
  type ConsultaNueva, type InformeDeTransferencia,
} from '../types'
import { MIGRACION_PORTAL } from './portalService'

/**
 * Lo que devuelve toda acción del portal. ES EL TIPO COMPARTIDO DEL REPO y no uno propio: los dos
 * frentes habían declarado su `Resultado` con formas distintas —uno unión discriminada, el otro con
 * `ok` y `error` opcional a la vez, que admite el imposible «ok con error»—. El que ya existía
 * gana. `id` no se usa acá y sobra sin molestar.
 */
export type Resultado = ResultadoAccion

const SIN_CAPACIDAD =
  `Esto todavía no se puede hacer desde el portal: falta aplicar en la base la migración ${MIGRACION_PORTAL}. `
  + 'Escribinos y lo resolvemos por el canal de siempre.'

/** El mensaje de un Zod que falló, sin el objeto entero: la pantalla muestra una línea. */
const primerError = (e: z.ZodError): string => e.issues[0]?.message ?? 'Revisá los datos.'

/**
 * EL CONTEXTO DE QUIEN ESTÁ ACTUANDO. Sin acceso vigente no se escribe nada.
 *
 * Se resuelve por `auth_user_id` y NO por el mail de la sesión: el mail se puede cambiar en Supabase
 * Auth y el vínculo con el cliente quedaría colgado del texto.
 */
type Contexto =
  | { ok: false; error: string }
  | {
      ok: true
      supabase: Awaited<ReturnType<typeof createClient>>
      acceso: { id: string; cliente_id: string; puede_aprobar: boolean }
    }

async function contexto(): Promise<Contexto> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No hay sesión' }

  const { data: acceso } = await supabase
    .from('cliente_acceso')
    .select('id, cliente_id, puede_aprobar, revocado_at')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!acceso || acceso.revocado_at) return { ok: false, error: 'Tu acceso al portal no está vigente' }
  return {
    ok: true,
    supabase,
    acceso: {
      id: String(acceso.id),
      cliente_id: String(acceso.cliente_id),
      puede_aprobar: Boolean(acceso.puede_aprobar),
    },
  }
}

// EL INGRESO NO ESTÁ ACÁ. Vive en `portalAuth.ts` y no es una división arbitraria: pedir el enlace
// es lo único que ocurre SIN SESIÓN, y por eso necesita la clave de servicio para poder mirar
// `cliente_acceso` —con la anónima, la RLS devuelve vacío siempre y no entraría nadie nunca—.
// Mezclarlo con las acciones de acá, que todas empiezan resolviendo la sesión, invitaba justo a ese
// error. Además contesta lo MISMO haya o no acceso, para no convertir el formulario en un oráculo
// que revela quién es cliente de Echegaray.

// ═══ CERTIFICADOS ═════════════════════════════════════════════════════════════════════════════

const idSchema = z.string().trim().uuid('No reconozco ese certificado.')

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
export async function aprobarCertificado(id: string): Promise<Resultado> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }

  const c = await contexto()
  if (!c.ok) return { ok: false, error: c.error }
  if (!c.acceso.puede_aprobar) {
    return { ok: false, error: 'Tu usuario puede ver los certificados pero no aprobarlos. Avisale a quien firma en tu empresa.' }
  }

  const { data: cert, error: errCert } = await c.supabase
    .from('certificado_cliente')
    .select('id, numero, estado, monto')
    .eq('id', parsed.data)
    .maybeSingle()
  if (errCert) return { ok: false, error: faltaLaMigracion(errCert) ? SIN_CAPACIDAD : errCert.message }
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

  revalidatePath(RUTA_PORTAL)
  revalidatePath('/clientes')
  return { ok: true, mensaje: 'Certificado aprobado. Echegaray ya lo ve.' }
}

/**
 * OBSERVA UN CERTIFICADO. No requiere `puede_aprobar`: observar es señalar un problema, y quien mira
 * la obra tiene que poder decir que algo no cierra aunque no sea el que firma. Bloquear la
 * observación empujaría ese reclamo a un canal donde no queda registrado.
 */
export async function observarCertificado(id: string, texto: string): Promise<Resultado> {
  const parsed = observarCertificadoSchema.safeParse({ certificadoId: id, texto })
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }

  const c = await contexto()
  if (!c.ok) return { ok: false, error: c.error }

  const { data: cert, error: errCert } = await c.supabase
    .from('certificado_cliente').select('id, numero').eq('id', parsed.data.certificadoId).maybeSingle()
  if (errCert) return { ok: false, error: faltaLaMigracion(errCert) ? SIN_CAPACIDAD : errCert.message }
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

  revalidatePath(RUTA_PORTAL)
  revalidatePath('/clientes')
  return { ok: true, mensaje: 'Observación registrada. Echegaray ya la ve.' }
}

// ═══ PAGOS Y CONSULTAS ════════════════════════════════════════════════════════════════════════

/**
 * INFORMA UNA TRANSFERENCIA.
 *
 * NO es un cobro y no toca Cobranzas. Nace `informado` y sólo Administración puede pasarlo a
 * `conciliado`, después de verlo en el extracto. Si esto escribiera en el Flujo de Caja, el cliente
 * estaría moviendo la caja de la empresa desde su teléfono.
 */
export async function informarTransferencia(datos: InformeDeTransferencia): Promise<Resultado> {
  const parsed = informarTransferenciaSchema.safeParse(datos)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }
  const v = parsed.data

  const c = await contexto()
  if (!c.ok) return { ok: false, error: c.error }

  // DEL CERTIFICADO A LA FILA DEL ESQUEMA. Los dos representan el mismo cobro y se unen por la
  // fila física de Cobranzas. Si no se puede resolver, el aviso se guarda igual SIN vínculo: es
  // mejor un aviso suelto que Administración concilia a mano que ningún aviso.
  const esquemaPagoId = v.esquemaPagoId ?? await esquemaDelCertificado(c.supabase, v.certificadoId)

  const { error } = await c.supabase.from('pago_informado').insert({
    cliente_id: c.acceso.cliente_id,
    esquema_pago_id: esquemaPagoId,
    monto: v.monto,
    fecha: v.fecha,
    referencia: v.referencia ?? null,
    comprobante_storage_path: v.comprobanteStoragePath ?? null,
    informado_por: c.acceso.id,
    estado: 'informado',
  })
  if (error) return { ok: false, error: faltaLaMigracion(error) ? SIN_CAPACIDAD : error.message }

  await c.supabase.from('cliente_actividad_portal').insert({
    cliente_id: c.acceso.cliente_id, acceso_id: c.acceso.id, tipo: 'informo_transferencia',
    referencia: v.referencia ?? null, detalle: `transferencia informada del ${v.fecha}`, monto: v.monto,
  })

  revalidatePath(RUTA_PORTAL)
  revalidatePath('/clientes')
  return { ok: true, mensaje: 'Aviso recibido. Lo confirmamos cuando lo veamos en el banco.' }
}

/** Deja una consulta por escrito. Responderla y cerrarla es de Administración. */
export async function crearConsulta(datos: ConsultaNueva): Promise<Resultado> {
  const parsed = crearConsultaSchema.safeParse(datos)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }
  const v = parsed.data

  const c = await contexto()
  if (!c.ok) return { ok: false, error: c.error }

  const { error } = await c.supabase.from('consulta_portal').insert({
    cliente_id: c.acceso.cliente_id,
    obra_id: v.obraId ?? null,
    acceso_id: c.acceso.id,
    titulo: v.titulo,
    cuerpo: v.cuerpo,
    estado: 'abierta',
  })
  if (error) return { ok: false, error: faltaLaMigracion(error) ? SIN_CAPACIDAD : error.message }

  await c.supabase.from('cliente_actividad_portal').insert({
    cliente_id: c.acceso.cliente_id, acceso_id: c.acceso.id, tipo: 'consulta',
    referencia: v.titulo, detalle: v.cuerpo.slice(0, 500),
  })

  revalidatePath(RUTA_PORTAL)
  revalidatePath('/clientes')
  return { ok: true, mensaje: 'Consulta enviada. Te respondemos por acá.' }
}

/** Vuelve a leer la pantalla después de una escritura, sin que el navegador recargue. */
export async function refrescarPortal(): Promise<void> {
  revalidatePath(RUTA_PORTAL)
}

/**
 * La fila del esquema que corresponde a un certificado. `null` cuando no hay ninguna — un
 * certificado sin fila en Cobranzas todavía no tiene pago que informar contra él.
 */
async function esquemaDelCertificado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  certificadoId: string | null | undefined,
): Promise<string | null> {
  if (!certificadoId) return null
  const { data: cert } = await supabase
    .from('certificado_cliente').select('cobranza_fila').eq('id', certificadoId).maybeSingle()
  if (cert?.cobranza_fila == null) return null
  const { data: pago } = await supabase
    .from('esquema_pago').select('id').eq('cobranza_fila', cert.cobranza_fila).maybeSingle()
  return pago?.id ?? null
}
