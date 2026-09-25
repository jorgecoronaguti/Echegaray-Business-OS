// LECTURAS DE `public.mail_saliente` PARA LA FICHA DEL CLIENTE (31 y 32). Ver `mailCola.ts`.
//
// La RLS de la tabla deja leer sólo a Administración; es la misma gente que ve estas pantallas. Si la
// lectura falla, se devuelve «no sé» (null / vacío) y la pantalla no dibuja un estado: callar sobre
// el mail es menos malo que afirmar uno que no se leyó.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COLUMNAS_MAIL, SIN_CUENTA, mailsDeLaUltimaPublicacion, remitenteAnda, ultimoPorDestinatario,
  type MailCola,
} from './mailCola.ts'

/** ¿Hay evidencia de que la cuenta que envía anda? Ver «SE DEDUCE DE LA MISMA COLA» en mailCola.ts. */
export async function laCuentaQueEnviaAnda(supabase: SupabaseClient): Promise<boolean> {
  const [enviado, trabado] = await Promise.all([
    supabase.from('mail_saliente').select('enviado_at').eq('estado', 'enviado')
      .order('enviado_at', { ascending: false }).limit(1),
    supabase.from('mail_saliente').select('pedido_at').in('estado', ['pendiente', 'procesando'])
      .like('error', `${SIN_CUENTA}%`).limit(1),
  ])
  // Sin poder leer no hay evidencia: se dice lo prudente («cuando esté conectada»).
  if (enviado.error || trabado.error) return false
  const ultimo = (enviado.data?.[0]?.enviado_at as string | undefined) ?? null
  return remitenteAnda(ultimo, (trabado.data?.length ?? 0) > 0)
}

/** El último mail de habilitación de cada destinatario de este cliente. */
export async function ultimosMailsDeAcceso(
  supabase: SupabaseClient, clienteId: string,
): Promise<Map<string, MailCola> | null> {
  const { data, error } = await supabase.from('mail_saliente').select(COLUMNAS_MAIL)
    .eq('cliente_id', clienteId).eq('plantilla', 'habilitacion_portal')
    .order('pedido_at', { ascending: false }).limit(200)
  if (error) return null
  return ultimoPorDestinatario((data ?? []) as unknown as MailCola[])
}

/** Los mails de la última publicación del esquema de este cliente. */
export async function mailsDeLaUltimaPublicacionDe(
  supabase: SupabaseClient, clienteId: string,
): Promise<MailCola[] | null> {
  const { data, error } = await supabase.from('mail_saliente').select(COLUMNAS_MAIL)
    .eq('cliente_id', clienteId).eq('plantilla', 'esquema_publicado')
    .order('pedido_at', { ascending: false }).limit(50)
  if (error) return null
  return mailsDeLaUltimaPublicacion((data ?? []) as unknown as MailCola[])
}
