'use server'

// LAS ESCRITURAS DEL TELÉFONO — todas por las funciones de la base (migración 20260922T1500).
//
// Nunca un insert/update a `efectivo_*`: las tablas no tienen permiso de escritura para nadie. Acá se
// valida la FORMA (Zod) y se traduce la respuesta; las reglas —el trazo lo pone sólo quien recibió,
// no se rinde una entrega cerrada, la foto tiene que estar en tu carpeta— las hace cumplir la base.
//
// La devolución NO está acá a propósito: `registrar_devolucion_efectivo` exige Administración (la
// registra quien recibe la plata). Una acción que la base siempre rechazaría es un botón que miente.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { faltaMigracion } from '../../herramientas/logica/falta-migracion'
import { esTrazoGuardable } from '@/shared/firma/firma'
import { MIGRACION_EFECTIVO, esRutaDeRendicion } from './logica'

export type Resultado<T = null> = { ok: true; dato: T } | { ok: false; error: string }

/**
 * El error de la base, dicho para la persona. Los P0001 de la migración ya vienen escritos en
 * castellano («ER-0003 ya tiene la conformidad firmada») y se muestran tal cual; los permisos (42501)
 * también traen su frase. Lo que no se reconoce se devuelve literal: taparlo con «hubo un problema»
 * esconde justo el dato que hace falta para arreglarlo.
 */
function traducir(e: { code?: string; message: string }): string {
  if (faltaMigracion(e)) return `Efectivo a rendir todavía no está publicado (falta la migración ${MIGRACION_EFECTIVO}).`
  if (e.code === '42501' && /JWT|logueado/i.test(e.message)) return 'Tu sesión venció. Volvé a entrar y probá otra vez.'
  if (e.code === '23505') return 'Esa foto ya estaba mandada.'
  const m = e.message.trim()
  return m.charAt(0).toUpperCase() + m.slice(1)
}

function refrescar() {
  revalidatePath('/mi-informacion/efectivo', 'layout')
  revalidatePath('/hoy')
  revalidatePath('/mi-informacion')
  revalidatePath('/obra', 'layout')
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<Resultado<T>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(fn, args)
    if (error) return { ok: false, error: traducir(error) }
    return { ok: true, dato: data as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

const uuid = z.string().uuid()

const firmaSchema = z.object({
  entrega: uuid,
  trazo: z.string().refine(esTrazoGuardable, 'Firmá arriba de la línea: el recuadro está vacío.'),
})

/** M02: la conformidad con el dedo. El papel lo sube Administración desde el escritorio. */
export async function firmarConformidadAction(entrada: z.input<typeof firmaSchema>): Promise<Resultado> {
  const p = firmaSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const r = await rpc<null>('firmar_conformidad_entrega', { p_entrega: p.data.entrega, p_trazo: p.data.trazo, p_papel_url: null })
  if (r.ok) refrescar()
  return r.ok ? { ok: true, dato: null } : r
}

const rendirSchema = z.object({
  entrega: uuid,
  lote: uuid,
  archivos: z.array(z.object({
    storage_path: z.string().min(10).max(200),
    nombre: z.string().trim().min(1).max(200),
    media_type: z.string().min(3).max(60),
    bytes: z.number().int().positive(),
  })).min(1, 'No hay fotos para mandar').max(12),
})

export type ResultadoFoto = { storage_path: string; ok: true } | { storage_path: string; ok: false; error: string }

/**
 * M04: las fotos ya están en el bucket; se encola cada una con `rendir_comprobante`.
 *
 * UNA POR UNA y cada una con su resultado, igual que la subida de Compras: si la tercera choca, las
 * otras dos ya entraron y la pantalla tiene que decir cuál no. La tanda comparte `p_lote`, que es lo
 * que el circuito usa para leer cinco fotos del mismo ticket como un solo fajo.
 */
export async function rendirComprobantesAction(entrada: z.input<typeof rendirSchema>): Promise<Resultado<ResultadoFoto[]>> {
  const p = rendirSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar y probá otra vez.' }
  if (p.data.archivos.some((a) => !esRutaDeRendicion(a.storage_path, user.id))) {
    return { ok: false, error: 'La foto no quedó en tu carpeta de rendición. Probá de nuevo.' }
  }
  const salida: ResultadoFoto[] = []
  for (const a of p.data.archivos) {
    const { error } = await supabase.rpc('rendir_comprobante', {
      p_entrega: p.data.entrega, p_storage_path: a.storage_path, p_nombre: a.nombre,
      p_media_type: a.media_type, p_bytes: a.bytes, p_lote: p.data.lote,
    })
    salida.push(error ? { storage_path: a.storage_path, ok: false, error: traducir(error) } : { storage_path: a.storage_path, ok: true })
  }
  if (salida.some((s) => s.ok)) refrescar()
  return { ok: true, dato: salida }
}

const respuestaSchema = z.object({
  ticket: uuid,
  dato: z.string().trim().min(1, 'Escribí el dato que te piden.').max(300, 'Es muy largo: con lo que dice el ticket alcanza.'),
})

/** M07: contestar el dato que falta. Lo toma Administración o el worker en la próxima pasada. */
export async function responderObservacionAction(entrada: z.input<typeof respuestaSchema>): Promise<Resultado> {
  const p = respuestaSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const r = await rpc<null>('responder_observacion_rendicion', { p_comprobante: p.data.ticket, p_dato: p.data.dato })
  if (r.ok) refrescar()
  return r.ok ? { ok: true, dato: null } : r
}

/**
 * M05: «Está bien · enviar». Recién con esto el worker escribe la fila de Compras.
 *
 * No manda lo que se leyó de vuelta: la base no le cree a la pantalla lo que dice el papel. Confirmar
 * es decir «lo miré y es esto», y lo que se carga es la lectura que ya está guardada. Corregir un dato
 * mal leído se hace por donde ya se hacía —M07, el dato que Administración pide— o sacando la foto de
 * nuevo; no se abre un segundo camino de escritura desde el teléfono.
 */
export async function confirmarLecturaAction(ticket: string): Promise<Resultado> {
  const p = uuid.safeParse(ticket)
  if (!p.success) return { ok: false, error: 'Ese ticket no existe.' }
  const r = await rpc<null>('confirmar_lectura_rendicion', { p_comprobante: p.data })
  if (r.ok) refrescar()
  return r.ok ? { ok: true, dato: null } : r
}

/** M05: «Sacar la foto de nuevo». El ticket se descarta y la persona vuelve a la cámara. */
export async function rehacerFotoAction(ticket: string): Promise<Resultado> {
  const p = uuid.safeParse(ticket)
  if (!p.success) return { ok: false, error: 'Ese ticket no existe.' }
  const r = await rpc<null>('rehacer_foto_rendicion', { p_comprobante: p.data })
  if (r.ok) refrescar()
  return r.ok ? { ok: true, dato: null } : r
}

const devolucionSchema = z.object({
  entrega: uuid,
  // En pesos enteros: el teléfono no tiene dónde escribir centavos y la plata en la mano tampoco.
  monto: z.number().int().positive('Escribí cuánto devolvés.').max(99999999),
  trazo: z.string().refine(esTrazoGuardable, 'Firmá arriba de la línea: el recuadro está vacío.'),
  recibidaPor: uuid.nullable().optional(),
})

/**
 * M08: «Devolver y firmar». DECLARA la devolución; no la da por recibida.
 *
 * La plata sigue en la mano de la persona hasta que quien la recibe la cuenta, y por eso esto NO baja el
 * saldo: lo baja `confirmada_en`, que pone quien registra la devolución en Administración. Una pantalla
 * que descontara acá sería una forma de dejar de deber plata sin moverla de lugar.
 */
export async function declararDevolucionAction(entrada: z.input<typeof devolucionSchema>): Promise<Resultado<string>> {
  const p = devolucionSchema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const r = await rpc<string>('declarar_devolucion_efectivo', {
    p_entrega: p.data.entrega, p_monto: p.data.monto, p_trazo: p.data.trazo,
    p_recibida_por: p.data.recibidaPor ?? null,
  })
  if (r.ok) refrescar()
  return r
}
