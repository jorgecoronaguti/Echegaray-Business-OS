// LA FOTO VA DEL TELÉFONO AL BUCKET, Y RECIÉN DESPUÉS AL CIRCUITO — sólo se importa desde un cliente.
//
// El mismo orden y las mismas reglas que la subida de Compras (`administracion/services/subidaDirecta.ts`):
// el archivo NO pasa por la Server Action (techo de 1 MB en Next, 4,5 MB en Vercel; una foto de
// celular pesa hasta 5 MB), primero el objeto y después la fila (una fila sin objeto dejaría al
// worker reintentando sobre nada), de a tres por vez, y cada foto corre su suerte.
//
// Se REUSAN sus reglas puras —tipos aceptados, techo de 5 MB, HEIC, tope por tanda, traducción de
// errores de Storage— en vez de copiarlas: dos listas de tipos aceptados divergen en la primera
// corrección. Lo único propio es la carpeta: `<uid>/rendicion/…`, la que abre la policy de rendición.

import { enParalelo, revisarLote, traducirError } from '../../administracion/services/subidaComprobantes'
import { rendirComprobantesAction, type ResultadoFoto } from './acciones'
import { rutaDeRendicion } from './logica'

const BUCKET = 'comprobantes'
const EN_VUELO = 3

export interface FotoElegida { id: string; archivo: File }

export interface Envio {
  /** Las que quedaron encoladas para el circuito. */
  entraron: number
  /** Los `id` de esas fotos: la pantalla saca de la tanda lo que ya entró y deja lo que falló. */
  entraronIds: string[]
  /** Una frase por foto que no entró, con el porqué. */
  errores: string[]
}

/** Qué fotos se pueden mandar y cuáles no, antes de tocar la red. */
export function revisar(fotos: readonly FotoElegida[]) {
  return revisarLote(fotos.map((f) => Object.assign(f.archivo, { idFoto: f.id })))
}

export async function mandarFotos(entrega: string, fotos: readonly FotoElegida[]): Promise<Envio> {
  const revision = revisar(fotos)
  // `aviso` ya junta los rechazados y los que sobran del tope, en una frase.
  const errores = revision.aviso ? [revision.aviso] : []
  if (!revision.aceptados.length) return { entraron: 0, entraronIds: [], errores: errores.length ? errores : ['No hay fotos para mandar.'] }

  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { entraron: 0, entraronIds: [], errores: ['Tu sesión venció. Volvé a entrar y probá otra vez.'] }

  const subidas = await enParalelo(revision.aceptados, EN_VUELO, async ({ archivo, mediaType }) => {
    try {
      const ruta = rutaDeRendicion({ uid: user.id, id: archivo.idFoto, mediaType })
      const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: mediaType, upsert: false })
      const base = { id: archivo.idFoto, nombre: archivo.name, mediaType, bytes: archivo.size }
      return error ? { ...base, ruta: null, error: traducirError(error.message) } : { ...base, ruta, error: null }
    } catch (e) {
      const error = traducirError(e instanceof Error ? e.message : String(e))
      return { id: archivo.idFoto, nombre: archivo.name, ruta: null, error, mediaType, bytes: archivo.size }
    }
  })

  for (const s of subidas) if (!s.ruta) errores.push(`«${s.nombre}»: ${s.error}`)
  const puestas = subidas.filter((s): s is typeof s & { ruta: string } => !!s.ruta)
  if (!puestas.length) return { entraron: 0, entraronIds: [], errores }

  const r = await rendirComprobantesAction({
    entrega, lote: crypto.randomUUID(),
    archivos: puestas.map((s) => ({ storage_path: s.ruta, nombre: s.nombre, media_type: s.mediaType, bytes: s.bytes })),
  })
  if (!r.ok) return { entraron: 0, entraronIds: [], errores: [...errores, r.error] }
  const ok = new Set(r.dato.filter((x) => x.ok).map((x) => x.storage_path))
  const entraronIds = puestas.filter((p) => ok.has(p.ruta)).map((p) => p.id)
  return { entraron: entraronIds.length, entraronIds, errores: [...errores, ...fallidas(r.dato, puestas)] }
}

function fallidas(rs: readonly ResultadoFoto[], puestas: readonly { ruta: string; nombre: string }[]): string[] {
  return rs.flatMap((x) => x.ok ? [] : [`«${puestas.find((p) => p.ruta === x.storage_path)?.nombre ?? 'foto'}»: ${x.error}`])
}
