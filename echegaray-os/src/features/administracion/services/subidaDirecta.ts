// EL ARCHIVO VA DEL NAVEGADOR AL BUCKET, Y RECIÉN DESPUÉS LA FILA A LA COLA.
//
// Las reglas puras están en `subidaComprobantes.ts` y se prueban con `node --test`. Acá vive lo que
// toca la red: el `upload()` de Storage con la sesión del usuario y la llamada a la Server Action
// con los metadatos. Este módulo SÓLO se importa desde un componente cliente.
//
// ═══ PRIMERO EL ARCHIVO, DESPUÉS LA FILA — y no al revés ═══
//
// Si la fila naciera antes, una subida cortada dejaría un renglón «En cola» apuntando a un objeto
// que no existe: la pantalla afirmaría que el comprobante está esperando y el worker se quedaría
// reintentando sobre nada. Al revés, lo que queda es un objeto que nadie apunta —basura invisible en
// el bucket— y la persona ve el fallo del archivo que falló. Se elige la basura antes que la
// mentira.
//
// ═══ LO QUE FALLA ES UN ARCHIVO, NO EL LOTE ═══
//
// La versión anterior borraba todo el lote ante el primer error. Además de perder cuatro subidas
// buenas por una mala, el borrado NUNCA funcionó: el bucket `comprobantes` no tiene policy de
// delete, así que ese `remove()` rebotaba en silencio y el objeto quedaba igual. Ahora cada archivo
// corre su suerte y la pantalla dice cuál no entró y por qué.

import { createClient } from '@/lib/supabase/client'
import { registrarComprobantes } from './comprobanteEntradaActions.ts'
import {
  enParalelo, repartirResultados, rutaDeComprobante, traducirError,
  type Reparto, type ResultadoDeArchivo,
} from './subidaComprobantes.ts'

const BUCKET = 'comprobantes'

/** Cuántos archivos viajan a la vez. Ver el porqué en `enParalelo`. */
const EN_VUELO = 3

export type EstadoArchivo = 'en cola' | 'subiendo' | 'subido' | 'falló'

export interface ArchivoParaSubir {
  /** El uuid del archivo en esta pantalla. Es también el nombre del objeto en el bucket. */
  id: string
  archivo: File
  mediaType: string
}

/** Se llama en cada cambio de un archivo: es el progreso que ve la persona. */
export type AlCambiar = (id: string, estado: EstadoArchivo, error?: string) => void

interface Subida {
  item: ArchivoParaSubir
  ruta: string | null
  error: string | null
}

export async function subirLote(
  archivos: readonly ArchivoParaSubir[], alCambiar: AlCambiar,
): Promise<{ resultados: ResultadoDeArchivo[]; reparto: Reparto }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return cerrar(archivos.map((a) => fallar(a, 'Tu sesión venció. Volvé a entrar y probá otra vez.', alCambiar)))

  const lote = crypto.randomUUID()
  const subidas = await enParalelo(archivos, EN_VUELO, (a) => subirUno(supabase, a, { uid: user.id, lote }, alCambiar))

  const puestos = subidas.filter((s): s is Subida & { ruta: string } => s.ruta !== null)
  const registro = puestos.length
    ? await registrarComprobantes({
        lote,
        archivos: puestos.map((s) => ({
          storage_path: s.ruta, nombre_archivo: s.item.archivo.name,
          media_type: s.item.mediaType, bytes: s.item.archivo.size,
        })),
      })
    : ({ ok: true, filas: [] } satisfies Registro)

  return cerrar(subidas.map((s) => juzgar(s, registro, alCambiar)))
}

function cerrar(resultados: ResultadoDeArchivo[]): { resultados: ResultadoDeArchivo[]; reparto: Reparto } {
  return { resultados, reparto: repartirResultados(resultados) }
}

type Registro = Awaited<ReturnType<typeof registrarComprobantes>>

/** Cómo quedó un archivo: primero su propia subida, después el renglón que le tocaba. */
function juzgar(s: Subida, registro: Registro, alCambiar: AlCambiar): ResultadoDeArchivo {
  if (s.ruta === null) return fallar(s.item, s.error ?? 'No se pudo subir.', alCambiar)
  if (!registro.ok) return fallar(s.item, registro.error, alCambiar)
  const fila = registro.filas.find((f) => f.storage_path === s.ruta)
  // Sin renglón no hay cola: el archivo está en el bucket pero nadie lo va a mirar. Decirlo «subido»
  // sería el peor de los finales — el papel se archiva y el gasto nunca aparece.
  if (!fila) return fallar(s.item, 'Subió el archivo pero no quedó en la cola. Probá de nuevo.', alCambiar)
  if (!fila.ok) return fallar(s.item, fila.error, alCambiar)
  alCambiar(s.item.id, 'subido')
  return { id: s.item.id, nombre: s.item.archivo.name, ok: true }
}

function fallar(item: ArchivoParaSubir, error: string, alCambiar: AlCambiar): ResultadoDeArchivo {
  alCambiar(item.id, 'falló', error)
  return { id: item.id, nombre: item.archivo.name, ok: false, error }
}

type Cliente = ReturnType<typeof createClient>

/** Un archivo al bucket. NUNCA rechaza: es el contrato de `enParalelo`. */
async function subirUno(
  supabase: Cliente, item: ArchivoParaSubir, ctx: { uid: string; lote: string }, alCambiar: AlCambiar,
): Promise<Subida> {
  alCambiar(item.id, 'subiendo')
  try {
    const ruta = rutaDeComprobante({ uid: ctx.uid, lote: ctx.lote, id: item.id, mediaType: item.mediaType })
    // `contentType` explícito: el HEIC del iPhone llega con `type` vacío y el bucket sólo acepta la
    // lista de tipos que el circuito sabe mirar. Sin esto, la foto más común del dueño rebota.
    // `upsert: false`: el nombre es un uuid nuevo, así que un choque sería una señal, no un reemplazo.
    const { error } = await supabase.storage
      .from(BUCKET).upload(ruta, item.archivo, { contentType: item.mediaType, upsert: false })
    if (error) return { item, ruta: null, error: traducirError(error.message) }
    return { item, ruta, error: null }
  } catch (e) {
    return { item, ruta: null, error: traducirError(e instanceof Error ? e.message : String(e)) }
  }
}
