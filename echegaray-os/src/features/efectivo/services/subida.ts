// EL PAPEL DE CONFORMIDAD VA DEL NAVEGADOR AL BUCKET, Y RECIÉN DESPUÉS LA FIRMA A LA ENTREGA.
//
// Sólo se importa desde un componente cliente (mismo reparto que `comprobanteDePagoSubida.ts`). La ruta es
// `<uid>/conformidad/<uuid>.<ext>`: la carpeta del usuario es la única donde Administración puede escribir en
// `comprobantes` sin una policy nueva (20260825T1000).

import { createClient } from '@/lib/supabase/client'
import { comprobanteEntra } from '@/features/administracion/services/comprobanteDePago'
import { conformidadEnPapelAction } from './acciones'

export async function subirConformidadEnPapel(archivo: File, entrega: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const control = comprobanteEntra(archivo)
  if (!control.ok) return { ok: false, error: control.error }
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { ok: false, error: 'Hace falta entrar con tu usuario.' }
  const ruta = `${data.user.id}/conformidad/${crypto.randomUUID()}.${control.dato.extension}`
  const { error } = await supabase.storage.from('comprobantes').upload(ruta, archivo, { contentType: control.dato.mediaType, upsert: false })
  if (error) return { ok: false, error: `No pude subir «${archivo.name}».` }
  const r = await conformidadEnPapelAction({ entrega, ruta })
  // SIN LA FIRMA REGISTRADA NO HAY CONFORMIDAD: el archivo queda en el bucket pero la entrega sigue sin ella,
  // y eso se dice — «subido» sería archivar un papel que nadie va a encontrar.
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}
