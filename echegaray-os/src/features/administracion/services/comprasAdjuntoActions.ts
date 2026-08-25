'use server'

// ABRIR EL PAPEL DE UNA COMPRA, Y COLGAR EL QUE QUEDÓ SUELTO.
//
// ═══ POR QUÉ UNA URL FIRMADA Y NO UN BUCKET PÚBLICO ═══
//
// Una factura trae CUIT, razón social, importes y a veces la obra del cliente. El bucket
// `comprobantes` es privado (`20260824T1100`, «los comprobantes no son públicos») y lo sigue siendo:
// la pantalla pide una firma de 10 minutos cada vez que alguien abre un papel. Una URL pública sería
// publicar la cuenta corriente de la empresa a quien adivine la ruta, para siempre.
//
// LA FIRMA NO ES LA CERRADURA. Quien decide es Postgres: la policy del bucket exige
// `es_administracion()` y el cliente de esta acción es el del USUARIO, no el de servicio. Si alguien
// sin permiso llama esta acción a mano, Storage le niega la firma. Lo que se hace acá es no ofrecer
// un botón que va a rebotar.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const RUTA = '/administracion/compras'
const BUCKET = 'comprobantes'
/** Diez minutos: alcanza para mirar un papel y no para dejar un enlace vivo en un chat. */
const VIGENCIA = 600

export type Resultado<T = undefined> =
  | { ok: true; dato: T }
  | { ok: false; error: string }

const Id = z.string().uuid()
/** La clave de una compra: `c:<cuit>|<nº>` o `p:<proveedor>|<nº>`. Se valida la FORMA, no el contenido. */
const Clave = z.string().trim().min(3).max(200).regex(/^[cp]:/)

/**
 * Una URL firmada para ver el archivo de un adjunto.
 *
 * El `storage_path` NO viaja desde el navegador: se lee de la fila, con el cliente del usuario y por
 * lo tanto pasando por RLS. Si llegara por parámetro, cualquiera podría pedir la firma de un objeto
 * arbitrario del bucket usando esta acción como ariete.
 */
export async function urlDelAdjunto(adjuntoId: string): Promise<Resultado<string>> {
  const id = Id.safeParse(adjuntoId)
  if (!id.success) return { ok: false, error: 'Ese comprobante no existe.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compra_adjunto').select('storage_path').eq('id', id.data).maybeSingle()
  if (error) return { ok: false, error: 'No pude leer ese comprobante.' }
  if (!data?.storage_path) return { ok: false, error: 'Ese comprobante no existe o no lo podés ver.' }

  const firma = await supabase.storage.from(BUCKET)
    .createSignedUrl(String(data.storage_path), VIGENCIA)
  if (firma.error || !firma.data?.signedUrl) {
    return { ok: false, error: 'No pude abrir el archivo. Puede haberse movido del respaldo.' }
  }
  return { ok: true, dato: firma.data.signedUrl }
}

/**
 * COLGAR UN COMPROBANTE SUELTO DE SU FILA. Es lo que hace la sub-vista «sin vincular».
 *
 * ═══ POR QUÉ QUEDA MARCADO COMO `match_manual` Y NO COMO `registro` ═══
 *
 * Las tres maneras de saber de qué compra es un papel no valen lo mismo, y la pantalla tiene que
 * poder mostrarlo. `registro` es un hecho (el bot lo cargó), `match_numero` es un cálculo con su
 * confianza, y esto es la decisión de una persona — que le gana a las dos, pero es una decisión.
 * La policy de la tabla obliga a que sea así: un update que se declare `registro` rebota.
 *
 * `fila_compras` se guarda como PISTA de posición. El vínculo es la clave.
 */
export async function vincularAdjunto(
  adjuntoId: string, compraClave: string,
): Promise<Resultado> {
  const id = Id.safeParse(adjuntoId)
  const clave = Clave.safeParse(compraClave)
  if (!id.success) return { ok: false, error: 'Ese comprobante no existe.' }
  if (!clave.success) return { ok: false, error: 'Esa compra no tiene un número con el que identificarla.' }

  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return { ok: false, error: 'Tenés que iniciar sesión.' }

  // LA FILA DE DESTINO TIENE QUE EXISTIR. Sin esto se podría colgar un papel de una clave inventada
  // y el adjunto desaparecería de «sin vincular» sin haber llegado a ninguna compra: peor que antes,
  // porque deja de pedir trabajo.
  const destino = await supabase
    .from('compra_sheet').select('fila').eq('clave', clave.data).limit(2)
  if (destino.error) return { ok: false, error: 'No pude buscar esa compra.' }
  if (!destino.data?.length) return { ok: false, error: 'No hay ninguna compra con ese comprobante.' }
  if (destino.data.length > 1) {
    return { ok: false, error: 'Ese comprobante está cargado en más de una fila de Compras. Resolvé el duplicado primero.' }
  }

  const { error } = await supabase.from('compra_adjunto').update({
    compra_clave: clave.data,
    fila_compras: destino.data[0].fila as number,
    vinculado_por: 'match_manual',
    vinculado_por_usuario: usuario.user.id,
    vinculado_at: new Date().toISOString(),
  }).eq('id', id.data)

  // `42501` es «permission denied»: la policy dijo que no. Next lo mostraría como un 404 mudo.
  if (error) {
    return { ok: false, error: error.code === '42501' ? 'No tenés permiso para vincular comprobantes.' : 'No pude vincularlo.' }
  }
  revalidatePath(RUTA)
  return { ok: true, dato: undefined }
}

export interface CompraCandidata {
  fila: number
  clave: string
  proveedor: string | null
  comprobante: string | null
  fecha: string | null
  total: number | null
}

/**
 * LAS COMPRAS A LAS QUE SE PUEDE COLGAR UN PAPEL SUELTO.
 *
 * Sólo devuelve filas CON CLAVE: colgar un adjunto de una fila sin número de comprobante lo ataría a
 * una identidad que no existe, y al siguiente sync el vínculo apuntaría a cualquier lado. Las 212
 * filas sin número (sueldos, impuestos, anticipos) no son destino válido, y eso es correcto: no
 * tienen comprobante que respaldar.
 */
export async function buscarCompras(texto: string): Promise<Resultado<CompraCandidata[]>> {
  const q = z.string().trim().min(2).max(80).safeParse(texto)
  if (!q.success) return { ok: false, error: 'Escribí al menos dos caracteres.' }
  // Las comas, los paréntesis y el `*` son la sintaxis del `or` de PostgREST y el `%` su comodín:
  // dejarlos pasar convierte lo que alguien tipeó en parte de la consulta.
  const seguro = q.data.replace(/[,()*%]/g, ' ').trim()
  if (!seguro) return { ok: false, error: 'Escribí algo que se pueda buscar.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compra_sheet')
    .select('fila, clave, proveedor, comprobante, fecha, total')
    .not('clave', 'is', null)
    .eq('anulada', false)
    .or(`comprobante.ilike.%${seguro}%,proveedor.ilike.%${seguro}%`)
    .order('fecha', { ascending: false, nullsFirst: false })
    .limit(8)
  if (error) return { ok: false, error: 'No pude buscar.' }
  return { ok: true, dato: (data ?? []) as unknown as CompraCandidata[] }
}
