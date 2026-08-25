'use server'

// LO QUE EL CLIENTE HACE DESDE EL PORTAL — aprobar, observar, avisar que pagó, preguntar, entrar.
//
// ═══ QUÉ ESTÁ VIVO Y QUÉ ES STUB ═══
//
// `pedirLinkPortal` está ENTERA: valida el mail, comprueba contra `cliente_acceso` que esté
// habilitado y no revocado, y recién ahí le pide a Supabase el enlace. Mientras la tabla no exista
// —la crea `back-28-32`— la comprobación falla cerrada y NO SE MANDA NINGÚN CORREO. Eso no es una
// limitación accidental: mandar un magic link a una casilla que nadie habilitó es abrirle la puerta
// del portal a quien escriba una dirección en un formulario público.
//
// Las otras cuatro validan su entrada de verdad (Zod, como toda entrada de usuario del repo) y
// devuelven el motivo honesto en lugar de escribir. Cuando el back aterrice, lo único que cambia es
// el bloque marcado `// STUB hasta que aterrice back-28-32`.
//
// ═══ APROBAR UN CERTIFICADO ES UN ACTO CONTRACTUAL ═══
//
// No es un «me gusta». La aprobación del cliente es lo que habilita a facturar y arranca el plazo de
// pago, así que cuando esto escriba de verdad tiene que quedar en `cliente_actividad_portal` con
// quién, cuándo y desde qué acceso — la trazabilidad es del contrato, no del sistema. Por eso
// tampoco puede escribirla el cliente sin `puede_aprobar`: el portero va en la base, no acá.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { faltaLaMigracion } from '@/features/mi-cuenta/services/miCuentaService'
import { urlDeRecuperacion } from '@/features/auth/services/recuperacion'
import { siteUrl } from '@/lib/site-url'
import { MIGRACION_PORTAL } from './portalService'
import { RUTA_PORTAL } from '../rutas'

export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string }

const SIN_CAPACIDAD =
  `Esto todavía no se puede hacer desde el portal: falta aplicar en la base la migración ${MIGRACION_PORTAL}. `
  + 'Escribinos y lo resolvemos por el canal de siempre.'

/** El mensaje de un Zod que falló, sin el objeto entero: la pantalla muestra una línea. */
const primerError = (e: z.ZodError): string => e.issues[0]?.message ?? 'Revisá los datos.'

// ═══ INGRESO ══════════════════════════════════════════════════════════════════════════════════

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Escribí tu mail.')
  .email('Ese mail no parece válido.')

/**
 * `30 · Portal Cliente Mobile.dc.html`: «Con el mail que Echegaray habilitó. Le llega un link y
 * queda dentro. Sin contraseña.»
 *
 * `shouldCreateUser: false` es la segunda cerradura: aunque alguien saltee la comprobación de
 * `cliente_acceso`, Supabase no da de alta un usuario nuevo desde este formulario.
 */
export async function pedirLinkPortal(email: string): Promise<Resultado> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }
  const mail = parsed.data

  const supabase = await createClient()

  // FALLA CERRADA. Si la tabla de habilitados no existe todavía, no hay contra qué comprobar, y
  // «no puedo comprobar» nunca se resuelve como «entonces sí».
  const { data: acceso, error } = await supabase
    .from('cliente_acceso')
    .select('id, revocado_at')
    .eq('email', mail)
    .maybeSingle()

  if (error) {
    if (faltaLaMigracion(error)) return { ok: false, error: SIN_CAPACIDAD }
    return { ok: false, error: 'No pudimos verificar el acceso. Probá de nuevo en un momento.' }
  }
  if (!acceso || acceso.revocado_at) {
    return {
      ok: false,
      error: 'Ese mail no está habilitado para el portal. Pedile a Echegaray que lo habilite.',
    }
  }

  const { error: envio } = await supabase.auth.signInWithOtp({
    email: mail,
    options: { shouldCreateUser: false, emailRedirectTo: urlDeRecuperacion(siteUrl(), RUTA_PORTAL) },
  })
  if (envio) return { ok: false, error: 'No pudimos enviar el link. Probá de nuevo en un momento.' }

  return { ok: true, mensaje: `Te mandamos el link a ${mail}. Abrilo desde este teléfono.` }
}

// ═══ CERTIFICADOS ═════════════════════════════════════════════════════════════════════════════

const idSchema = z.string().trim().uuid('No reconozco ese certificado.')

/** El cliente aprueba el certificado que estaba esperando su conformidad (`29`). */
export async function aprobarCertificado(id: string): Promise<Resultado> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }
  // STUB hasta que aterrice back-28-32
  return { ok: false, error: SIN_CAPACIDAD }
}

const observacionSchema = z
  .string()
  .trim()
  .min(10, 'Contanos qué observás: con menos de diez caracteres no podemos revisarlo.')
  .max(2000, 'Es demasiado largo para este campo — mandalo por mail.')

/** El cliente observa el certificado: no lo rechaza, lo devuelve con un motivo escrito. */
export async function observarCertificado(id: string, texto: string): Promise<Resultado> {
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false, error: primerError(parsedId.error) }
  const parsed = observacionSchema.safeParse(texto)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }
  // STUB hasta que aterrice back-28-32
  return { ok: false, error: SIN_CAPACIDAD }
}

// ═══ PAGOS ════════════════════════════════════════════════════════════════════════════════════

const transferenciaSchema = z.object({
  certificado_id: z.string().trim().uuid().nullable(),
  monto: z.coerce.number().positive('El monto tiene que ser mayor a cero.'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Poné la fecha de la transferencia.'),
  referencia: z.string().trim().min(1, 'Poné el número o la referencia de la transferencia.').max(120),
})

export type InformeDeTransferencia = z.infer<typeof transferenciaSchema>

/**
 * «Informar transferencia» del panel A pagar ahora (`29:623`).
 *
 * INFORMAR NO ES COBRAR. Lo que el cliente carga acá queda `informado` y espera la conciliación
 * contra el banco: la caja de la empresa la mueve el extracto, nunca el aviso de la contraparte.
 */
export async function informarTransferencia(datos: unknown): Promise<Resultado> {
  const parsed = transferenciaSchema.safeParse(datos)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }
  // STUB hasta que aterrice back-28-32
  return { ok: false, error: SIN_CAPACIDAD }
}

// ═══ CONSULTAS ════════════════════════════════════════════════════════════════════════════════

const consultaSchema = z.object({
  titulo: z.string().trim().min(4, 'Ponele un título a la consulta.').max(160),
  cuerpo: z.string().trim().min(10, 'Contanos un poco más para poder responderte.').max(4000),
  obra_id: z.string().trim().uuid().nullable().optional(),
})

export type NuevaConsulta = z.infer<typeof consultaSchema>

/** El «+» del bloque Consultas del `29`. */
export async function crearConsulta(datos: unknown): Promise<Resultado> {
  const parsed = consultaSchema.safeParse(datos)
  if (!parsed.success) return { ok: false, error: primerError(parsed.error) }
  // STUB hasta que aterrice back-28-32
  return { ok: false, error: SIN_CAPACIDAD }
}

/** Cuando las cuatro de arriba escriban de verdad, esto es lo que refresca la pantalla en el lugar. */
export async function refrescarPortal(): Promise<void> {
  revalidatePath(RUTA_PORTAL)
}
