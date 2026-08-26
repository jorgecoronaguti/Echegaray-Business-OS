import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { alcanzaLaObra, type AccesoDelPortal } from '../../permisos'

// LOS PAPELES DE PLATA DEL CLIENTE — facturas y recibos, servidos DESDE EL OS.
//
// ═══ POR QUÉ NO SE LEEN DE `recibo_cliente` NI DE DRIVE (26/08/2026) ═══
//
// La primera versión guardaba los recibos en `recibo_cliente` con el id del archivo en Drive, y la
// ruta de descarga se lo pedía a Google EN EL MOMENTO. Desde Vercel eso falla, la excepción quedaba
// tapada en el `catch` y el cliente recibía «No encontrado» en los veintitrés. El dueño lo vio así:
// «no encontrado dice cada uno de los recibos, están todos mal».
//
// El espejo ya resolvió ese problema para Documentos: el OS baja los archivos UNA vez desde la VM
// —donde la credencial existe— y los guarda. Facturas y recibos salen de la MISMA tabla y por la
// MISMA ruta: una sola manera de servir un papel, no dos, y ninguna que dependa de que Google
// conteste mientras el cliente mira la pantalla.

export type PapelDePlata = {
  id: string
  titulo: string
  categoria: 'factura' | 'recibo'
  /** ISO. `null` = el archivo no la declara y no se deduce del nombre. */
  fecha: string | null
  obraId: string | null
  bytes: number | null
  /** Se abre acá; con `?descargar=1` se baja. */
  verEn: string
}

type Fila = {
  id: string
  titulo: string
  categoria: string
  fecha: string | null
  obra_id: string | null
  bytes: number | null
  storage_path: string | null
  visible_portal: boolean
}

/**
 * Las facturas y los recibos que este acceso puede ver.
 *
 * `visible_portal` y el alcance de obra se comprueban acá Y en la ruta que sirve el archivo: la URL
 * lleva el id y se puede tipear, así que la lista no es la cerradura.
 */
export async function papelesDePlata(acceso: AccesoDelPortal): Promise<PapelDePlata[]> {
  const { data } = await createAdminClient()
    .from('documento_cliente')
    .select('id, titulo, categoria, fecha, obra_id, bytes, storage_path, visible_portal')
    .eq('cliente_id', acceso.clienteId)
    .in('categoria', ['factura', 'recibo'])

  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.visible_portal === true)
    // Sin archivo en el espejo no se ofrece: un enlace que no abre nada es peor que no ofrecerlo.
    .filter((f) => Boolean(f.storage_path))
    .filter((f) => alcanzaLaObra(acceso.obras, f.obra_id))
    .map((f) => ({
      id: String(f.id),
      titulo: String(f.titulo),
      categoria: f.categoria === 'factura' ? 'factura' as const : 'recibo' as const,
      fecha: f.fecha ?? null,
      obraId: f.obra_id ?? null,
      bytes: f.bytes == null ? null : Number(f.bytes),
      verEn: `/portal/documentos/${f.id}`,
    }))
    // Lo más nuevo primero; lo que no declara fecha va al final, no al principio.
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || a.titulo.localeCompare(b.titulo, 'es'))
}
