'use server'

// EL CICLO DEL RECIBO, DESDE ADMINISTRACIÓN — mandarlo a firmar (D12), archivarlo y observarlo (D13).
//
// Firmar con el dedo y subir el papel NO están acá: eso lo hace la persona desde su teléfono
// (`features/empleado/services/miReciboActions.ts`). Nadie firma por otro, y la separación de archivos es
// para que eso se vea leyendo los nombres.
//
// ═══ TRES CERRADURAS, Y LA QUE VALE ES LA DE LA BASE ═══
//
// Una acción de servidor es un endpoint: se invoca sin abrir la pantalla. Acá se vuelve a preguntar el rol
// contra la cookie, y adentro de la base las funciones `security definer` lo exigen otra vez con
// `liquida_sueldos()` — esa última también alcanza a quien llame por PostgREST sin pasar por Next.
//
// ═══ EL ACUSE NO ES EVIDENCIA ═══
//
// Después de cada RPC se LEE LA FILA de vuelta con el permiso de quien llamó, y el estado que se devuelve es
// el leído, no el pedido. Una RPC que no explota no prueba que la fila cambió («PostgREST: 204 no prueba
// escritura»).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { liquidaSueldos } from '@/features/auth/types/areas'
import type { Resultado } from './personasActions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const idSchema = z.string().regex(UUID, 'No sé de qué recibo se trata.')

/** Lo que se tildó antes de archivar (D13). Rótulos cortos, para que quede con el documento qué se miró. */
const verificacionSchema = z.record(z.string().max(120), z.boolean()).optional()

async function puertaDeSueldos() {
  const supabase = await createClient()
  const { data: perfil, error } = await getPerfilActual(supabase)
  // FALLA CERRADO: sin perfil legible no se sabe quién es.
  if (error) return { supabase, error: 'No pude verificar tu permiso. No cambié nada.' as const }
  if (!liquidaSueldos(perfil?.rol)) {
    return { supabase, error: 'Los recibos los manejan Dirección y Administración.' as const }
  }
  return { supabase, error: null }
}

/** La fila de vuelta. Devuelve el estado LEÍDO, o por qué no se pudo leer. */
async function leerEstado(
  supabase: Awaited<ReturnType<typeof createClient>>, id: string,
): Promise<{ estado: string } | { falla: string }> {
  const { data, error } = await supabase
    .from('recibo_liquidacion').select('id, estado, persona_id').eq('id', id).maybeSingle()
  if (error || !data?.id) return { falla: 'No pude leer el recibo de vuelta: no lo doy por hecho.' }
  return { estado: String(data.estado) }
}

async function refrescarLegajo(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from('recibo_liquidacion').select('persona_id').eq('id', id).maybeSingle()
  if (data?.persona_id) revalidatePath(`/administracion/personas/${data.persona_id}`)
  revalidatePath('/administracion/personas')
}

/** Traduce el error de la base, sin tragárselo: si la migración no está, se dice tal cual. */
function porQueNo(error: { code?: string; message: string }, que: string): string {
  if (error.code === 'PGRST202' || /does not exist/i.test(error.message)) {
    return `Todavía no puedo ${que}: falta aplicar la migración en la base. No cambié nada.`
  }
  return error.message
}

// ── D12 · ENVIAR A FIRMAR ────────────────────────────────────────────────────────────────────────
// Es lo que hace que el recibo aparezca en el teléfono de la persona. Antes de esto el papel existía sólo
// impreso, y de la conformidad no quedaba ningún rastro digital.
export async function enviarReciboAFirmar(reciboId: string): Promise<Resultado> {
  const id = idSchema.safeParse(reciboId)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  const { supabase, error: cerrado } = await puertaDeSueldos()
  if (cerrado) return { ok: false, error: cerrado }

  const { error } = await supabase.rpc('enviar_recibo_a_firmar', { p_recibo: id.data })
  if (error) return { ok: false, error: porQueNo(error, 'mandar el recibo a firmar') }

  const leido = await leerEstado(supabase, id.data)
  if ('falla' in leido) return { ok: false, error: leido.falla }
  if (leido.estado === 'emitido') {
    return { ok: false, error: 'La base aceptó el envío pero el recibo sigue sin enviar. No lo doy por enviado.' }
  }
  await refrescarLegajo(supabase, id.data)
  return { ok: true, id: id.data, mensaje: 'El recibo ya está en el teléfono de la persona, para que lo firme.' }
}

// ── D13 · ARCHIVAR EL FIRMADO ────────────────────────────────────────────────────────────────────
// «El firmado reemplaza al emitido en el legajo. El emitido queda como versión anterior: no se borra» —
// eso último no hace falta programarlo: ninguna emisión se borra nunca, y `es_ultimo` marca cuál rige.
export async function archivarRecibo(
  reciboId: string, verificacion?: Record<string, boolean>,
): Promise<Resultado> {
  const id = idSchema.safeParse(reciboId)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  const v = verificacionSchema.safeParse(verificacion)
  if (!v.success) return { ok: false, error: 'La verificación no está bien formada.' }
  const { supabase, error: cerrado } = await puertaDeSueldos()
  if (cerrado) return { ok: false, error: cerrado }

  const { error } = await supabase.rpc('archivar_recibo_liquidacion', {
    p_recibo: id.data, p_verificacion: v.data ?? null,
  })
  if (error) return { ok: false, error: porQueNo(error, 'archivar el recibo') }

  const leido = await leerEstado(supabase, id.data)
  if ('falla' in leido) return { ok: false, error: leido.falla }
  if (leido.estado !== 'archivado') {
    return { ok: false, error: `La base respondió que sí pero el recibo quedó «${leido.estado}». No lo doy por archivado.` }
  }
  await refrescarLegajo(supabase, id.data)
  return { ok: true, id: id.data, mensaje: 'Archivado en el legajo.' }
}

// ── OBSERVAR Y PEDIR DE NUEVO ────────────────────────────────────────────────────────────────────
// No es un bloqueo (el dueño los sacó): es dejar dicho qué no coincide. Se corrige emitiendo otro recibo, y
// éste queda — la prueba de qué se le llegó a entregar a la persona no se borra.
export async function observarRecibo(reciboId: string, motivo: string): Promise<Resultado> {
  const id = idSchema.safeParse(reciboId)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  const texto = motivo.trim()
  if (!texto) return { ok: false, error: 'Decí qué no coincide: una observación vacía no se puede corregir.' }
  const { supabase, error: cerrado } = await puertaDeSueldos()
  if (cerrado) return { ok: false, error: cerrado }

  const { error } = await supabase.rpc('observar_recibo_liquidacion', { p_recibo: id.data, p_motivo: texto })
  if (error) return { ok: false, error: porQueNo(error, 'observar el recibo') }

  const leido = await leerEstado(supabase, id.data)
  if ('falla' in leido) return { ok: false, error: leido.falla }
  if (leido.estado !== 'observado') {
    return { ok: false, error: 'La base respondió que sí pero el recibo no quedó observado. No lo doy por hecho.' }
  }
  await refrescarLegajo(supabase, id.data)
  return { ok: true, id: id.data, mensaje: 'Queda observado: emitile otro recibo con lo corregido.' }
}
