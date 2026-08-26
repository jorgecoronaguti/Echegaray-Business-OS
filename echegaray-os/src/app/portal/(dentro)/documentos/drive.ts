import 'server-only'
import { clasificar, type ArchivoDrive, type Clasificado } from '../../documentos'

// LA CARPETA DE LA OBRA EN DRIVE — sólo lectura, cacheada, y con la frescura a la vista.
//
// ═══ POR QUÉ HAY CACHE ═══
//
// Drive tarda entre medio segundo y tres por carpeta, y la pantalla la abre cada vez que el cliente
// toca «Documentos». Sin cache, el portal sería lento por una carpeta que cambia una vez por semana.
//
// ═══ POR QUÉ LA FRESCURA SE MUESTRA SIEMPRE ═══
//
// Un cache que no dice cuándo se llenó es indistinguible de un dato que dejó de actualizarse. La
// maqueta pone «Drive · hace 2 h» arriba a propósito: si un día dice «hace 6 d», alguien pregunta.
//
// ═══ LO QUE NO HACE ═══
//
// No escribe en Drive ni borra nada. La cuenta de servicio entra en modo lectura para esta carpeta;
// lo que el cliente sube va por otro camino y a una SUBCARPETA propia.

type Entrada = { al: Date; datos: Clasificado }
const CACHE = new Map<string, Entrada>()
const VIDA_MS = 10 * 60_000

export type LecturaDrive = { datos: Clasificado; al: Date | null; error: string | null }

export async function documentosDeObra(carpetaId: string | null): Promise<LecturaDrive> {
  const vacio: Clasificado = { cotizacion: null, contrato: null, planos: [], certificados: [], otros: [], hojasTotales: null }
  // SIN CARPETA MAPEADA NO SE ADIVINA. Caer en la carpeta del CLIENTE mostraría los papeles de todas
  // sus obras mezclados, incluidos los de obras que este mail no alcanza.
  if (!carpetaId) return { datos: vacio, al: null, error: 'sin_carpeta' }

  const guardado = CACHE.get(carpetaId)
  if (guardado && Date.now() - guardado.al.getTime() < VIDA_MS) return { datos: guardado.datos, al: guardado.al, error: null }

  try {
    type Cliente = { listarCarpeta(id: string, o?: Record<string, unknown>): Promise<ArchivoDrive[]> }
    type Mod = { makeGoogleClient(o: Record<string, unknown>): Cliente; READ_SCOPES?: unknown; WRITE_SCOPES?: unknown }
    const [google, config] = await Promise.all([
      import('../../../../../orquestador/lib/google.mjs') as unknown as Promise<Mod>,
      import('../../../../../orquestador/lib/config.mjs') as unknown as Promise<{ loadConfig(): unknown }>,
    ])
    const g = google.makeGoogleClient({ config: config.loadConfig(), scopes: google.READ_SCOPES ?? google.WRITE_SCOPES })
    const crudos = await g.listarCarpeta(carpetaId, { campos: 'id,name,mimeType,modifiedTime,size' })
    // SE COPIAN LOS CAMPOS, NO EL OBJETO. Lo que devuelve el cliente de Google arrastra estructuras
    // que no cruzan la frontera servidor→cliente de React: la página moría con «ArrayBuffer is not
    // detachable and could not be cloned» y devolvía 500. Quedarse con cuatro strings lo resuelve y
    // además fija qué es lo único que el portal usa de Drive.
    const archivos: ArchivoDrive[] = (crudos ?? []).map((a) => ({
      id: String(a.id),
      name: String(a.name ?? ''),
      mimeType: String(a.mimeType ?? ''),
      modifiedTime: a.modifiedTime ? String(a.modifiedTime) : null,
    }))
    const datos = clasificar(archivos)
    const al = new Date()
    CACHE.set(carpetaId, { al, datos })
    return { datos, al, error: null }
  } catch {
    // SE SIRVE LO VIEJO ANTES QUE NADA — pero se dice que es viejo. Una pantalla en blanco por un
    // error de red hace pensar que la carpeta está vacía.
    if (guardado) return { datos: guardado.datos, al: guardado.al, error: 'sin_conexion' }
    return { datos: vacio, al: null, error: 'sin_conexion' }
  }
}
