'use server'

// M05 · RESOLVER UN PEDIDO DE CORRECCIÓN.
//
// ═══ EL EFECTO ES EL DATO EN LA ASISTENCIA, NO EL ESTADO DEL PEDIDO ═══
//
// Aprobar no cambia una columna: ESCRIBE la salida en `asistencia_marca`. Las dos escrituras —la
// marca y el estado del pedido— van adentro de `aprobar_correccion_asistencia()`, en una sola
// transacción de Postgres, y por eso acá hay un `rpc` y no dos llamadas encadenadas: hechas desde
// este archivo, la primera podría entrar y la segunda fallar, dejando una marca que ninguna
// solicitud explica o una bandeja diciendo «resuelto» sobre un día que sigue sin salida.
//
// La función devuelve el id de la marca escrita. Se mira: si volviera vacío, la aprobación NO llegó
// a la asistencia y eso hay que decirlo, no dar por buena la respuesta.
//
// ═══ ESTO NO ES LA CERRADURA ═══
//
// `aprobar_correccion_asistencia` comprueba `es_administracion()` en su primera línea y levanta un
// 42501 si no pasa. Lo de acá es traducir ese error y no ofrecer un botón que va a rebotar.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string }

const resolucionSchema = z.object({
  id: z.string().uuid('Falta saber qué pedido se está resolviendo'),
  nota: z.string().trim().max(300, 'Máximo 300 caracteres').optional().transform((v) => v || null),
})

function traducir(mensaje: string): string {
  if (/permission denied|42501|Sólo Administración/i.test(mensaje)) {
    return 'Tu usuario no puede resolver correcciones de asistencia. Eso es de Administración.'
  }
  if (/ya estaba (aprobada|rechazada)/i.test(mensaje)) {
    return 'Ese pedido ya lo resolvió alguien. Recargá la bandeja para ver cómo quedó.'
  }
  if (/no existe/i.test(mensaje)) return 'Ese pedido ya no existe.'
  if (/function .* does not exist|schema cache/i.test(mensaje)) {
    return 'Falta aplicar la migración de correcciones de asistencia en la base.'
  }
  return mensaje
}

function refrescar(): void {
  revalidatePath('/administracion/asistencia')
  // La pantalla del empleado tiene que dejar de decir «pendiente» y empezar a mostrar la salida.
  revalidatePath('/mi-informacion/asistencia')
  revalidatePath('/hoy')
}

/** APROBAR: escribe la salida propuesta en la asistencia real y marca el pedido, todo junto. */
export async function aprobarCorreccion(form: FormData): Promise<Resultado> {
  const parsed = resolucionSchema.safeParse({ id: form.get('id'), nota: form.get('nota') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('aprobar_correccion_asistencia', {
    p_solicitud: parsed.data.id,
    p_nota: parsed.data.nota,
  })
  if (error) return { ok: false, error: traducir(error.message) }
  // Un `rpc` sin error pero sin id de marca significa que la asistencia NO se escribió. Decir
  // «aprobado» ahí sería la evidencia del intento, no la del efecto.
  if (!data) {
    return { ok: false, error: 'La aprobación no dejó ninguna marca en la asistencia. No se aplicó nada.' }
  }

  refrescar()
  return { ok: true, mensaje: 'Aprobado. La salida ya está escrita en la asistencia de esa persona.' }
}

/** RECHAZAR: no toca la asistencia. El día queda como estaba y la nota explica por qué. */
export async function rechazarCorreccion(form: FormData): Promise<Resultado> {
  const parsed = resolucionSchema.safeParse({ id: form.get('id'), nota: form.get('nota') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('rechazar_correccion_asistencia', {
    p_solicitud: parsed.data.id,
    p_nota: parsed.data.nota,
  })
  if (error) return { ok: false, error: traducir(error.message) }

  refrescar()
  return { ok: true, mensaje: 'Rechazado. El día quedó como estaba: sin salida.' }
}
