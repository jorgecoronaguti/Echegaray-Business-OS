'use server'

// SUBIR UN COMPROBANTE DESDE LA PANTALLA 24 — la app ENCOLA, no carga.
//
// ═══ EL PEDIDO, TEXTUAL (25/08/2026) ═══
//
// «la carga de comprobantes se debe hacer de la misma manera que se hace vía bot del OS: cargo
// archivo multimedia al canal carga de comprobantes y la carga se debe hacer en app ecsas y en sheet
// flujo de fondos, todo respaldado en BD».
//
// ═══ POR QUÉ ESTA ACCIÓN NO LEE NI CARGA NADA ═══
//
// Leer un comprobante es: convertir el HEIC, mirarlo con el modelo de visión, cruzarlo contra el
// padrón de ARCA, contra el extracto bancario y contra la pestaña Compras VIVA del Sheet, y después
// correr `scripts/cargar-comprobantes-compras.mjs` como proceso hijo con su freno de mano. Eso
// necesita las credenciales de Google, el token del razonador y un proceso que pueda tardar minutos:
// nada de eso vive —ni puede vivir— en una server action de Vercel.
//
// Así que acá se hace lo único que corresponde: el archivo va al bucket privado, la fila va a la
// cola, y el worker de la VM lo procesa con EXACTAMENTE el mismo código que el bot de Mattermost
// (`orquestador/comunicacion/comprobantes/circuito.mjs`). Una capacidad, una fuente.
//
// ═══ NO ES LA CERRADURA ═══
//
// Quien decide de verdad es Postgres: la policy de `comprobante_entrada` exige `es_administracion()`,
// que la fila nazca a nombre propio y en estado `pendiente`; la del bucket exige además que el
// archivo caiga en la carpeta del propio usuario. Aunque alguien llame esta acción a mano, la base
// rechaza lo que no le corresponde. Lo que se hace acá es no ofrecer un botón que va a rebotar y
// traducir el `42501` a una frase útil.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { archivoAceptable, extensionDe, MAX_ARCHIVOS } from './comprobanteEntrada'

export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string }

const RUTA = '/administracion/compras'
const BUCKET = 'comprobantes'

/**
 * Lo que se inserta por archivo. Zod valida la FILA, no el `File`: el archivo lo valida
 * `archivoAceptable`, que es puro y tiene su test. Acá se garantiza que nada raro llegue al insert
 * aunque el nombre venga de un teléfono.
 */
const filaSchema = z.object({
  origen: z.literal('web'),
  lote: z.string().uuid(),
  storage_path: z.string().min(3).max(400),
  // El nombre lo escribe la cámara de alguien: se recorta y se limpian los saltos de línea, que en
  // un mensaje del bot romperían el renglón de la rendición.
  nombre_archivo: z.string().trim().min(1).max(160).transform((s) => s.replace(/[\r\n\t]+/g, ' ')),
  media_type: z.string().min(3).max(60),
  bytes: z.number().int().positive(),
  subido_por: z.string().uuid(),
  estado: z.literal('pendiente'),
  intentos: z.literal(0),
})

const SIN_PERMISO = 'Tu usuario no tiene permiso para cargar comprobantes. Si creés que sí debería, avisale a Dirección.'

/** El `42501` de Postgres y la falta de migración no le dicen nada a nadie con un papel en la mano. */
function traducir(mensaje: string): string {
  if (/relation .* does not exist|schema cache/i.test(mensaje)) {
    return 'Todavía no puedo recibir comprobantes por acá: falta aplicar la migración en la base. Avisale a Dirección.'
  }
  if (/permission denied|row-level security|violates row-level/i.test(mensaje)) return SIN_PERMISO
  if (/Bucket not found/i.test(mensaje)) {
    return 'Todavía no está creado el depósito de comprobantes en la base. Avisale a Dirección.'
  }
  if (/duplicate key/i.test(mensaje)) return 'Ese archivo ya estaba en la cola.'
  return mensaje
}

/**
 * Encola uno o varios comprobantes. Todos los del mismo envío comparten `lote`.
 *
 * EL LOTE ES EL EQUIVALENTE DE UN POST CON VARIAS FOTOS: el circuito agrupa por tanda y escribe una
 * sola vez. Sin lote, cinco facturas subidas juntas abrirían cinco conversaciones con el Sheet y la
 * misma factura fotografiada dos veces entraría dos veces.
 */
export async function subirComprobantes(form: FormData): Promise<Resultado> {
  const archivos = form.getAll('archivos').filter((a): a is File => a instanceof File && a.size > 0)
  if (!archivos.length) return { ok: false, error: 'Elegí al menos un archivo.' }
  if (archivos.length > MAX_ARCHIVOS) {
    return { ok: false, error: `Subí hasta ${MAX_ARCHIVOS} comprobantes por vez, así los puedo revisar de a uno.` }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar y probá otra vez.' }

  // LA VALIDACIÓN ES ANTES DE SUBIR NADA: si el tercero de cinco no sirve, no queda un lote a medias
  // con dos archivos huérfanos en el bucket y tres en la cola.
  const revisados = archivos.map((a) => ({ archivo: a, control: archivoAceptable({ name: a.name, type: a.type, size: a.size }) }))
  const malo = revisados.find((r) => !r.control.ok)
  if (malo && !malo.control.ok) return { ok: false, error: malo.control.error }

  const lote = randomUUID()
  const subidos: string[] = []
  for (const { archivo, control } of revisados) {
    if (!control.ok) continue
    // La carpeta es el usuario —lo exige la policy del bucket— y adentro el lote, para poder mirar
    // una carga entera de un vistazo cuando algo salga mal.
    const ruta = `${user.id}/${lote}/${randomUUID()}.${extensionDe(control.mediaType)}`
    const { error: eSubida } = await supabase.storage
      .from(BUCKET).upload(ruta, archivo, { contentType: control.mediaType, upsert: false })
    if (eSubida) {
      await limpiar(supabase, subidos)
      return { ok: false, error: traducir(eSubida.message) }
    }
    subidos.push(ruta)

    const fila = filaSchema.safeParse({
      origen: 'web', lote, storage_path: ruta, nombre_archivo: archivo.name,
      media_type: control.mediaType, bytes: archivo.size, subido_por: user.id,
      estado: 'pendiente', intentos: 0,
    })
    if (!fila.success) {
      await limpiar(supabase, subidos)
      return { ok: false, error: fila.error.issues[0].message }
    }
    const { error } = await supabase.from('comprobante_entrada').insert(fila.data)
    // SI LA FILA NO ENTRA, LOS ARCHIVOS SE BORRAN. Un objeto que nadie apunta es basura en el bucket
    // y, peor, la pantalla diría «subido» sobre algo que el worker no va a mirar nunca.
    if (error) {
      await limpiar(supabase, subidos)
      return { ok: false, error: traducir(error.message) }
    }
  }

  revalidatePath(RUTA)
  return {
    ok: true,
    mensaje: archivos.length === 1
      ? 'Subido. El OS lo lee y lo carga en Compras; el estado aparece acá abajo.'
      : `${archivos.length} comprobantes subidos. El OS los lee y los carga en Compras; el estado aparece acá abajo.`,
  }
}

/** Borra lo que se alcanzó a subir de un lote que no se pudo completar. Nunca lanza. */
async function limpiar(
  supabase: Awaited<ReturnType<typeof createClient>>, rutas: string[],
): Promise<void> {
  if (!rutas.length) return
  try { await supabase.storage.from(BUCKET).remove(rutas) } catch { /* el lote ya falló: no empeorar */ }
}
