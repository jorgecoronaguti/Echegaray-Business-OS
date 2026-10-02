'use server'

// GUARDAR LA NOTA DE UNA ANOTACIÓN DEL PUNTO AMARILLO (dueño, 02/10/2026).
//
// Tres cerraduras, como el resto de Liquidación: el rol se vuelve a preguntar acá (una server action es un endpoint
// que se invoca sin abrir la pantalla), la RPC `liquidacion_nota_guardar` lo vuelve a preguntar adentro, y la tabla no
// tiene grant de escritura para nadie. La RPC va con la sesión de quien escribe: así `auth.uid()` firma la nota.
//
// SIN LA MIGRACIÓN (20261002T2200) la función no existe: se contesta que todavía no se puede, sin tirar la página.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { nombresDeUsuarios } from '@/shared/personas/nombresDeUsuarios'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { faltaLaMigracion, MENSAJE_SIN_MIGRACION, pedidoDeNota } from './notaDeAnotacion'
import { firmaDeNota } from './detalleDePagoEnEfectivo'

const RUTA = '/administracion/personas'

export type ResultadoNotaDeAnotacion =
  | { ok: true; texto: string | null; por: string | null }
  | { ok: false; error: string }

interface RespuestaRpc { texto: string | null; escrita_por: string | null; escrita_en: string | null }

export async function guardarNotaDeAnotacion(entrada: unknown): Promise<ResultadoNotaDeAnotacion> {
  const v = pedidoDeNota.safeParse(entrada)
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? 'Nota inválida. No se guardó.' }
  const supabase = await createClient()
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }
  const { cambioId, posicion, importe, texto } = v.data
  const { data, error } = await supabase.rpc('liquidacion_nota_guardar', {
    p_cambio_id: cambioId, p_posicion: posicion, p_importe: importe, p_texto: texto ?? '',
  })
  if (error) return { ok: false, error: faltaLaMigracion(error) ? MENSAJE_SIN_MIGRACION : `No se guardó la nota: ${error.message}` }
  const r = data as RespuestaRpc | null
  if (!r?.texto || !r.escrita_en) {
    revalidatePath(RUTA)
    return { ok: true, texto: null, por: null }
  }
  const nombre = r.escrita_por ? (await nombresDeUsuarios(supabase)).get(r.escrita_por) ?? null : null
  revalidatePath(RUTA)
  return { ok: true, texto: r.texto, por: firmaDeNota(nombre, r.escrita_en) }
}
