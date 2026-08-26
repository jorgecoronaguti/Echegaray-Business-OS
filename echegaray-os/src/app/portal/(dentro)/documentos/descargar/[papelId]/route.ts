import { createAdminClient } from '@/lib/supabase/admin'
import { sesionDelPortal } from '../../../../sesion'
import { accesoDelPortal } from '../../../../datos'
import { papelesVisibles } from '../../../../papeles'
import { papelParaDescargar } from '../../datos'

// LA DESCARGA DE VERDAD — el botón que hasta hoy era un icono y no hacía nada.
//
// ═══ POR QUÉ EL ARCHIVO SALE POR ACÁ Y NO POR UNA URL DEL BUCKET ═══
//
// El bucket es PRIVADO: son los papeles de un cliente. Se firma una URL de vida corta en el servidor
// y se devuelven los BYTES, sin que la ruta del objeto llegue nunca al navegador. Si se entregara la
// URL firmada, quedaría en el historial y en cualquier registro intermedio, y con ella el papel se
// abre sin sesión hasta que venza.
//
// ═══ EL PORTERO ES EL MISMO QUE EL DE LA PANTALLA ═══
//
// `papelesVisibles` — la misma función pura, con los mismos tests. Que la pantalla no dibuje un
// enlace no protege nada: el id viaja en la URL y lo edita cualquiera. Acá se vuelve a preguntar
// `puede_ver_obra`, el alcance de obra y `visible_portal`, y las tres tienen que valer.
//
// SIEMPRE 404, NUNCA 403. Un 403 confirma que ese documento existe; un cliente que prueba ids
// aprendería cuántos papeles tiene el de al lado.

const BUCKET = 'documentos-cliente'
const noExiste = () => new Response('No encontramos ese documento.', { status: 404 })

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ papelId: string }> }) {
  const sesion = await sesionDelPortal()
  if (!sesion) return noExiste()
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) return noExiste()

  const { papelId } = await params
  // `id` es uuid: pedirle a PostgREST `id.eq.cualquier-cosa` no devuelve cero filas, devuelve un
  // ERROR de tipo. Se mira la forma antes de consultar.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(papelId)) return noExiste()

  const papel = await papelParaDescargar(papelId)
  if (!papel || papel.clienteId !== acceso.clienteId) return noExiste()
  if (!papelesVisibles([papel], acceso).length) return noExiste()

  const { data, error } = await createAdminClient().storage.from(BUCKET).download(papel.storagePath)
  // El espejo puede no haber subido el archivo todavía, o alguien puede haberlo movido en el
  // respaldo. Se dice; no se devuelve un cuerpo vacío que el navegador guarda como PDF roto.
  if (error || !data) return new Response('No pudimos abrir el archivo ahora.', { status: 503 })

  return new Response(await data.arrayBuffer(), {
    headers: {
      'content-type': papel.mime ?? 'application/octet-stream',
      // `attachment` con el nombre real: el cliente recibe «Contrato de obra.pdf», no un uuid.
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(papel.titulo)}`,
      // Es un papel de un cliente detrás de una sesión: no lo cachea ningún intermediario.
      'cache-control': 'private, no-store',
    },
  })
}
