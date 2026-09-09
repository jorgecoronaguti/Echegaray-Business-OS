'use server'

// GUARDAR, BAJAR Y DAR DE BAJA UN DOCUMENTO DE PROVEEDOR.
//
// ═══ POR QUÉ UNA URL FIRMADA Y NO UN BUCKET PÚBLICO ═══
//
// Un contrato de subcontrato trae precios, plazos y penalidades: publicarlo a quien adivine la ruta
// es publicar la posición negociadora de la empresa, para siempre. El bucket es privado y la
// pantalla pide una firma de diez minutos cada vez que alguien abre un papel.
//
// LA FIRMA NO ES LA CERRADURA. Quien decide es Postgres: las policies del bucket y de la tabla
// exigen `es_administracion()`, y el cliente de estas acciones es el del USUARIO, no el de servicio.
// Si alguien sin permiso las llama a mano, Storage y PostgREST le dicen que no. Lo que se hace acá
// es no ofrecer un botón que va a rebotar, y traducir el «no» a castellano.
//
// ═══ LA FIRMA VA CON `download` ═══
//
// El bucket acepta cualquier tipo —el dueño pidió «lo que sea que necesite cargar»—, así que un
// `.html` o un `.svg` subido por error se renderizaría en el origen de Storage si la firma lo
// sirviera inline. Con `download` el navegador guarda el archivo en vez de ejecutarlo, y de paso lo
// baja con el nombre que tenía cuando se subió y no con el uuid del objeto.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIAS, MAX_BYTES, esRutaDelProveedor, traducirError } from './documentosProveedor'

const BUCKET = 'proveedores-documentos'
/** Diez minutos: alcanza para bajar un contrato y no para dejar un enlace vivo en un chat. */
const VIGENCIA = 600

export type Resultado<T = undefined> =
  | { ok: true; dato: T }
  | { ok: false; error: string }

const Id = z.string().uuid()

/**
 * LO QUE LA ACCIÓN ACEPTA. El archivo NO viaja por acá: ya está en el bucket, puesto por el
 * navegador (`subidaDocumentoProveedor.ts`). Lo que llega es el renglón.
 */
const Alta = z.object({
  proveedorId: z.string().uuid(),
  storagePath: z.string().min(3).max(300),
  nombreArchivo: z.string().trim().min(1).max(255),
  tipoMime: z.string().trim().min(3).max(255),
  tamanoBytes: z.number().int().positive().max(MAX_BYTES),
  categoria: z.enum(CATEGORIAS),
  // La descripción es opcional de verdad: obligar a escribir algo para guardar un contrato haría que
  // todos digan «contrato».
  descripcion: z.string().trim().max(400).optional().nullable(),
})
export type AltaDeDocumento = z.infer<typeof Alta>

/**
 * REGISTRAR EL DOCUMENTO QUE YA ESTÁ EN EL BUCKET.
 *
 * El `storage_path` se cruza contra el uid de la sesión y contra el proveedor de la ficha ANTES de
 * escribir: sin ese cruce, esta acción sería un ariete para colgar el contrato de un proveedor
 * dentro de la ficha de otro. La policy de la tabla hace la misma pregunta —ahí está la cerradura—;
 * acá se hace para poder explicar el «no» en vez de mostrar un «violates row-level security».
 */
export async function registrarDocumento(entrada: AltaDeDocumento): Promise<Resultado<string>> {
  const p = Alta.safeParse(entrada)
  if (!p.success) return { ok: false, error: 'Faltan datos del documento o son inválidos.' }

  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return { ok: false, error: 'Tenés que iniciar sesión.' }

  if (!esRutaDelProveedor(p.data.storagePath, usuario.user.id, p.data.proveedorId)) {
    return { ok: false, error: 'Ese archivo no corresponde a este proveedor.' }
  }

  const { data, error } = await supabase.from('proveedor_documento').insert({
    proveedor_id: p.data.proveedorId,
    storage_path: p.data.storagePath,
    nombre_archivo: p.data.nombreArchivo,
    tipo_mime: p.data.tipoMime,
    tamano_bytes: p.data.tamanoBytes,
    categoria: p.data.categoria,
    descripcion: p.data.descripcion?.trim() ? p.data.descripcion.trim() : null,
    subido_por: usuario.user.id,
  }).select('id').single()

  if (error) return { ok: false, error: traducirError(error.message) }
  revalidatePath(`/administracion/proveedores/${p.data.proveedorId}`)
  return { ok: true, dato: String(data.id) }
}

/**
 * UNA URL FIRMADA PARA BAJAR EL ARCHIVO.
 *
 * El `storage_path` NO viaja desde el navegador: se lee de la fila, con el cliente del usuario y por
 * lo tanto pasando por RLS. Si llegara por parámetro, cualquiera podría pedir la firma de un objeto
 * arbitrario del bucket usando esta acción como ariete.
 */
export async function urlDelDocumento(documentoId: string): Promise<Resultado<string>> {
  const id = Id.safeParse(documentoId)
  if (!id.success) return { ok: false, error: 'Ese documento no existe.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proveedor_documento')
    .select('storage_path, nombre_archivo, eliminado_en')
    .eq('id', id.data).maybeSingle()
  if (error) return { ok: false, error: 'No pude leer ese documento.' }
  if (!data?.storage_path) return { ok: false, error: 'Ese documento no existe o no lo podés ver.' }
  // Un documento dado de baja no se baja desde la pantalla: la fila queda para saber que existió y
  // quién lo sacó, no para seguir sirviendo el archivo como si estuviera vigente.
  if (data.eliminado_en) return { ok: false, error: 'Ese documento está dado de baja.' }

  const firma = await supabase.storage.from(BUCKET).createSignedUrl(
    String(data.storage_path), VIGENCIA, { download: String(data.nombre_archivo) },
  )
  if (firma.error || !firma.data?.signedUrl) {
    return { ok: false, error: 'No pude abrir el archivo. Puede haberse movido del respaldo.' }
  }
  return { ok: true, dato: firma.data.signedUrl }
}

/**
 * DAR DE BAJA — LÓGICA. El objeto del bucket queda donde está.
 *
 * Borrar el archivo desde un clic de la pantalla convertiría un error de dedo en la desaparición de
 * la única copia de un contrato firmado. La fila queda diciendo quién lo dio de baja y cuándo; la
 * policy de la tabla obliga a que la firma sea la de quien lo hizo y a que no se pueda revertir.
 */
export async function darDeBajaDocumento(documentoId: string): Promise<Resultado> {
  const id = Id.safeParse(documentoId)
  if (!id.success) return { ok: false, error: 'Ese documento no existe.' }

  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return { ok: false, error: 'Tenés que iniciar sesión.' }

  const { data, error } = await supabase.from('proveedor_documento').update({
    eliminado_en: new Date().toISOString(),
    eliminado_por: usuario.user.id,
  }).eq('id', id.data).is('eliminado_en', null).select('proveedor_id').maybeSingle()

  // `42501` es «permission denied»: la policy dijo que no. Next lo mostraría como un 404 mudo.
  if (error) {
    return { ok: false, error: error.code === '42501' ? 'No tenés permiso para dar de baja documentos.' : 'No pude darlo de baja.' }
  }
  // CERO FILAS NO ES ÉXITO. Un update que no tocó nada —porque ya estaba de baja, porque la policy
  // lo filtró o porque el id no existe— devuelve `error: null`: darlo por hecho sacaría el papel de
  // la pantalla sin haberlo sacado de la base.
  if (!data) return { ok: false, error: 'No se dio de baja: puede que ya lo estuviera.' }

  revalidatePath(`/administracion/proveedores/${String(data.proveedor_id)}`)
  return { ok: true, dato: undefined }
}
