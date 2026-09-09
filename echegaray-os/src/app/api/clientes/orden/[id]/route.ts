import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// EL PDF DE UNA ORDEN DEL CLIENTE — el OS lo sirve con su credencial, después de preguntar la puerta.
//
// ═══ POR QUÉ NO ES UN ENLACE AL BUCKET ═══
//
// `obras-documentos` es PRIVADO y su policy de lectura directa es `es_administracion()`: un jefe de
// obra que tocara el objeto recibiría un 400 del storage aunque la orden sea de SU obra. La regla
// que sabe de obras vive en la tabla, no en el bucket. Por eso acá se pregunta primero la FILA con
// la sesión de quien pide —la RLS de `cliente_orden` es la cerradura— y recién con la fila en la
// mano se baja el objeto con la credencial de servicio.
//
// LA PANTALLA NO AUTORIZA NADA: que el panel haya dibujado el enlace no prueba que quien tipea la
// URL pueda verlo. Cualquier condición que falle devuelve 404 y no 403 — un 403 confirmaría que esa
// orden existe.

export const dynamic = 'force-dynamic'

const noHay = () => new Response('No encontrado', { status: 404 })

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // `id` es uuid: pedirle a PostgREST un texto cualquiera devuelve un ERROR de tipo, no cero filas.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return noHay()

  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return noHay()

  const { data } = await supabase
    .from('cliente_orden')
    .select('archivo_path, nombre_archivo, tipo_mime')
    .eq('id', id)
    .is('eliminado_en', null)
    .maybeSingle()
  const fila = data as { archivo_path: string; nombre_archivo: string; tipo_mime: string | null } | null
  if (!fila) return noHay()

  const { data: blob, error } = await createAdminClient()
    .storage.from('obras-documentos').download(fila.archivo_path)
  // EL OBJETO PUEDE NO ESTAR aunque la fila exista: la baja del bucket y la de la tabla son dos
  // hechos distintos. Se dice 404, no un archivo vacío que el navegador abriría como un PDF roto.
  if (error || !blob) return noHay()

  const bytes = new Uint8Array(await blob.arrayBuffer())
  return new Response(bytes, {
    headers: {
      'Content-Type': fila.tipo_mime || 'application/pdf',
      'Content-Length': String(bytes.length),
      // `inline`: una orden se mira antes de guardarla. El nombre va entre comillas porque puede
      // llevar espacios, y se le sacan las comillas al original para no cortar el encabezado.
      'Content-Disposition': `inline; filename="${fila.nombre_archivo.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
