'use server'

// REGISTRAR UN COMPROBANTE YA SUBIDO — la app ENCOLA, no carga, y ahora tampoco transporta.
//
// ═══ EL PEDIDO, TEXTUAL (25/08/2026) ═══
//
// «la carga de comprobantes se debe hacer de la misma manera que se hace vía bot del OS: cargo
// archivo multimedia al canal carga de comprobantes y la carga se debe hacer en app ecsas y en sheet
// flujo de fondos, todo respaldado en BD».
//
// ═══ QUÉ CAMBIÓ Y POR QUÉ (probado en producción el 25/08) ═══
//
// Esta acción recibía el `FormData` con los archivos adentro y los subía ella. Con una foto de
// celular de 4,4 MB devolvía **500 «Body exceeded 1 MB limit»**. Levantar `bodySizeLimit` no lo
// arregla: Vercel corta el cuerpo de la función en 4,5 MB y el techo del comprobante es 5 MB.
//
// Ahora el navegador pone el archivo en el bucket con la sesión del usuario —la policy
// `comprobantes_sube_administracion` lo obliga a escribir en SU carpeta— y acá llega sólo el
// renglón: ruta, nombre, tipo, bytes y lote. Un lote de doce comprobantes son unos pocos cientos de
// bytes de JSON.
//
// ═══ POR QUÉ ESTA ACCIÓN NO LEE NI CARGA NADA ═══
//
// Leer un comprobante es: convertir el HEIC, mirarlo con el modelo de visión, cruzarlo contra el
// padrón de ARCA, contra el extracto bancario y contra la pestaña Compras VIVA del Sheet, y después
// correr `scripts/cargar-comprobantes-compras.mjs` como proceso hijo con su freno de mano. Eso
// necesita las credenciales de Google, el token del razonador y un proceso que puede tardar minutos:
// nada de eso vive —ni puede vivir— en una server action de Vercel. El worker de la VM lo procesa
// con EXACTAMENTE el mismo código que el bot de Mattermost. Una capacidad, una fuente.
//
// ═══ NO ES LA CERRADURA ═══
//
// Quien decide de verdad es Postgres: la policy de `comprobante_entrada` exige `es_administracion()`,
// que la fila nazca a nombre propio, en estado `pendiente` y con `intentos = 0`. Lo que se hace acá
// es validar con Zod lo que manda un cliente que ya no es de confianza —ahora arma la ruta él— y
// traducir el `42501` a una frase útil.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MAX_ARCHIVOS, MAX_BYTES, MEDIA_ACEPTADOS } from './comprobanteEntrada.ts'
import { esRutaDelUsuario, traducirError } from './subidaComprobantes.ts'

const RUTA = '/administracion/compras'

/** El resultado de UN renglón. La ruta es la clave: es `unique` en la tabla. */
export type FilaRegistrada =
  | { storage_path: string; ok: true }
  | { storage_path: string; ok: false; error: string }

export type Registro = { ok: true; filas: FilaRegistrada[] } | { ok: false; error: string }

/**
 * Lo que el navegador manda por archivo. Se valida TODO aunque el cliente ya lo haya validado: el
 * cliente es la comodidad, no el control. `media_type` es un enum cerrado —el mismo que acepta el
 * bucket— y `bytes` tiene el techo del modelo de visión.
 */
const metaSchema = z.object({
  storage_path: z.string().min(3).max(400),
  // El nombre lo escribe la cámara de alguien: se recorta y se limpian los saltos de línea, que en
  // un mensaje del bot romperían el renglón de la rendición.
  nombre_archivo: z.string().trim().min(1).max(160).transform((s) => s.replace(/[\r\n\t]+/g, ' ')),
  media_type: z.enum(MEDIA_ACEPTADOS),
  bytes: z.number().int().positive().max(MAX_BYTES),
})

/**
 * EL LOTE ES EL EQUIVALENTE DE UN POST CON VARIAS FOTOS: el circuito agrupa por tanda y escribe una
 * sola vez. Sin lote, cinco facturas subidas juntas abrirían cinco conversaciones con el Sheet y la
 * misma factura fotografiada dos veces entraría dos veces.
 */
const loteSchema = z.object({
  lote: z.string().uuid(),
  archivos: z.array(metaSchema).min(1).max(MAX_ARCHIVOS),
})

/** Escribe un renglón por archivo ya subido. Devuelve el resultado DE CADA UNO, no uno solo. */
export async function registrarComprobantes(entrada: unknown): Promise<Registro> {
  const leido = loteSchema.safeParse(entrada)
  if (!leido.success) return { ok: false, error: `No pude registrar la carga: ${leido.error.issues[0].message}` }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar y probá otra vez.' }

  // La ruta la arma el navegador, así que acá se vuelve a preguntar lo que preguntó Storage: que el
  // archivo esté en la carpeta de quien firma la fila. Sin esto, un renglón podría apuntar al
  // comprobante de otra persona y el worker lo leería como propio.
  if (leido.data.archivos.some((a) => !esRutaDelUsuario(a.storage_path, user.id))) {
    return { ok: false, error: 'Esa carga no quedó a tu nombre. Recargá la pantalla y probá otra vez.' }
  }

  // UNO POR UNO, NO UN INSERT DE DOCE: si el tercero choca contra el `unique` de `storage_path`, un
  // insert por lote se caería entero y los once buenos quedarían como archivos huérfanos en el
  // bucket que nadie va a leer nunca.
  const filas = await Promise.all(
    leido.data.archivos.map((a) => insertarUna(supabase, { ...a, lote: leido.data.lote, subido_por: user.id })),
  )

  revalidatePath(RUTA)
  return { ok: true, filas }
}

type Cliente = Awaited<ReturnType<typeof createClient>>

/** Un renglón. Nunca lanza: un lote a medias se informa, no se convierte en un 500. */
async function insertarUna(
  supabase: Cliente,
  fila: z.infer<typeof metaSchema> & { lote: string; subido_por: string },
): Promise<FilaRegistrada> {
  // `origen`, `estado` e `intentos` los pone el servidor, NUNCA el cliente: son exactamente los tres
  // valores que la policy de insert exige, y son los que convertirían una fila recién subida en un
  // gasto declarado como ya cargado.
  const { error } = await supabase
    .from('comprobante_entrada')
    .insert({ ...fila, origen: 'web', estado: 'pendiente', intentos: 0 })
  return error
    ? { storage_path: fila.storage_path, ok: false, error: traducirError(error.message) }
    : { storage_path: fila.storage_path, ok: true }
}
