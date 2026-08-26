import { createAdminClient } from '@/lib/supabase/admin'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { nombreDeDescarga, puedeBajarElRecibo } from '../../recibos'

// EL RECIBO QUE EL CLIENTE SE BAJA — el OS le sirve el archivo con su propia credencial.
//
// ═══ POR QUÉ HACE FALTA UNA RUTA Y NO ALCANZA UN ENLACE ═══
//
// El PDF vive en la carpeta de Drive de la empresa y el cliente NO tiene acceso a Drive: no tiene
// cuenta de Google en el dominio ni la va a tener. Publicar `drive.google.com/file/d/…` le daría un
// «solicitar acceso», que es peor que nada porque parece un error nuestro. Y compartir el archivo
// de Drive con su mail abriría la carpeta entera del cliente, con los papeles internos adentro.
//
// Hasta hoy la pantalla dibujaba un icono de descarga que no bajaba nada. Un botón decorativo es una
// promesa que el sistema no cumple.
//
// ═══ LA PUERTA SE VUELVE A PREGUNTAR ACÁ, ENTERA ═══
//
// Que la pantalla haya dibujado el enlace no autoriza nada: la URL se puede tipear. Se comprueban
// las CINCO condiciones, y cualquiera que falle devuelve 404 —no 403—: un 403 confirmaría que ese
// recibo existe, y quién lo pregunta es alguien de otra empresa.
//
// La sesión se comprueba acá; las otras cuatro las decide `puedeBajarElRecibo`, que es pura y
// tiene test propio — una puerta que sólo se puede probar levantando un servidor no se prueba.

export const dynamic = 'force-dynamic'

/** Ni existe, ni se dice si existe. */
const noHay = () => new Response('No encontrado', { status: 404 })

type FilaMinima = {
  cliente_id: string
  obra_id: string | null
  visible_portal: boolean
  drive_file_id: string
  nombre_archivo: string
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // `id` es uuid: pedirle a PostgREST un texto cualquiera devuelve un ERROR de tipo, no cero filas.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return noHay()

  const bajar = new URL(req.url).searchParams.get('descargar') === '1'
  const sesion = await sesionDelPortal()
  if (!sesion) return noHay()
  const acceso = await accesoDelPortal(sesion)

  const { data } = await createAdminClient()
    .from('recibo_cliente')
    .select('cliente_id, obra_id, visible_portal, drive_file_id, nombre_archivo')
    .eq('id', id).maybeSingle()
  const fila = data as FilaMinima | null
  // El `!fila` va acá y no sólo adentro para que TypeScript sepa que abajo la fila existe.
  if (!fila || !puedeBajarElRecibo(acceso, fila)) return noHay()

  try {
    type Cliente = {
      descargarBytes(id: string): Promise<Buffer>
      fileMeta(id: string): Promise<{ id: string; name: string; mimeType: string }>
    }
    type Mod = { makeGoogleClient(o: Record<string, unknown>): Cliente; READ_SCOPES?: unknown; WRITE_SCOPES?: unknown }
    const [google, config] = await Promise.all([
      import('../../../../../orquestador/lib/google.mjs') as unknown as Promise<Mod>,
      import('../../../../../orquestador/lib/config.mjs') as unknown as Promise<{ loadConfig(): unknown }>,
    ])
    const g = google.makeGoogleClient({ config: config.loadConfig(), scopes: google.READ_SCOPES ?? google.WRITE_SCOPES })
    // `fileMeta` primero: da el tipo real del archivo y falla si fue movido a la papelera —donde se
    // lee vacío y sin error—. Adivinar el tipo por la extensión haría que el navegador abriera un
    // PDF como texto.
    const meta = await g.fileMeta(fila.drive_file_id)
    const bytes = await g.descargarBytes(fila.drive_file_id)
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': meta.mimeType || 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': nombreDeDescarga(fila.nombre_archivo || meta.name, bajar),
        // Es el papel de un cobro de un cliente: no lo cachea ningún intermediario.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    // El archivo dejó de estar (movido, borrado, papelera) o Drive no contestó. 404 y no un 500:
    // para quien pide, el resultado es el mismo y no se filtra en qué estado está nuestra carpeta.
    return noHay()
  }
}
