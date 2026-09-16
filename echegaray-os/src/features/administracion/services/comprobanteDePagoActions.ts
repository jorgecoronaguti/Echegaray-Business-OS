'use server'

// EL COMPROBANTE DE UN PAGO: registrarlo, listarlo y abrirlo.
//
// El ARCHIVO lo sube el navegador directo a Storage (`comprobanteDePagoSubida.ts`): pasarlo por el
// servidor obligaría a que 25 MB viajen dos veces y a levantar el techo del body de las server
// actions. Lo que sí pasa por acá es la FILA, porque `compra_adjunto` no le concede INSERT a nadie:
// la migración que la creó lo dice —«poder insertar una fila acá sería poder afirmar que existe un
// respaldo que nadie subió»— y eso no cambia. La puerta es una RPC `security definer` que chequea el
// rol, que la fila de Compras exista, que la ruta sea la de ESA fila, y que anota quién y cuándo.
//
// PRIMERO EL ARCHIVO, DESPUÉS LA FILA — la misma decisión que `subidaAlBucket.ts`: una subida
// cortada deja un objeto que nadie apunta (basura invisible) en vez de una ficha que lista un papel
// que no está en ningún lado. Se elige la basura antes que la mentira.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TIPOS_PAGO } from './comprobanteDePago'

const BUCKET = 'comprobantes'
/** Diez minutos: alcanza para mirar un papel y no para dejar un enlace vivo en un chat. */
const VIGENCIA = 600

export type Resultado<T = undefined> = { ok: true; dato: T } | { ok: false; error: string }

export interface ComprobanteDePago {
  id: string
  fila_compras: number
  pago_cambio_id: string | null
  nombre: string
  media_type: string
  bytes: number
  subido_at: string | null
  /** Quién lo subió, ya resuelto a un nombre. `null` = la cuenta ya no está. */
  subido_por: string | null
}

const Alta = z.object({
  fila: z.number().int().min(4),
  cambioId: z.string().uuid().nullish(),
  // La ruta se valida por FORMA y la base la vuelve a exigir contra la fila: acá no se confía.
  storagePath: z.string().trim().regex(/^pagos\/\d+\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i),
  nombre: z.string().trim().min(1).max(300),
  mediaType: z.enum(TIPOS_PAGO),
  bytes: z.number().int().positive().max(25 * 1024 * 1024),
})

/** Registrar el comprobante YA SUBIDO. Sin esta fila, el archivo existe y nadie lo va a encontrar. */
export async function registrarComprobanteDePago(p: z.input<typeof Alta>): Promise<Resultado<string>> {
  const v = Alta.safeParse(p)
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? 'Ese archivo no se puede registrar.' }
  if (!v.data.storagePath.startsWith(`pagos/${v.data.fila}/`)) {
    return { ok: false, error: 'La ruta del archivo no corresponde a esta compra.' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('compra_pago_comprobante_registrar', {
    p_fila: v.data.fila, p_cambio_id: v.data.cambioId ?? null, p_storage_path: v.data.storagePath,
    p_nombre: v.data.nombre, p_media_type: v.data.mediaType, p_bytes: v.data.bytes,
  })
  if (error) {
    const falta = error.code === 'PGRST202' || /compra_pago_comprobante_registrar/.test(error.message ?? '')
    return {
      ok: false,
      error: falta
        ? 'La base todavía no sabe guardar comprobantes de pago (migración 20260916T1800 sin aplicar). El archivo se subió pero no quedó registrado.'
        : 'No pude registrar el comprobante.',
    }
  }
  const r = data as { ok?: boolean; error?: string; adjunto_id?: string } | null
  if (!r?.ok) return { ok: false, error: r?.error ?? 'La base rechazó el comprobante.' }
  revalidatePath('/administracion/compras')
  revalidatePath('/administracion/proveedores')
  return { ok: true, dato: r.adjunto_id ?? '' }
}

/**
 * LOS COMPROBANTES DE PAGO DE UNAS FILAS.
 *
 * Se piden por `fila_compras` y no por `compra_clave` porque 219 de las 960 filas de Compras no
 * tienen número de comprobante —subcontratistas, efectivo, sueldos, impuestos— y son justamente las
 * que más se pagan por transferencia. Es una POSICIÓN, con el límite que eso trae y que la migración
 * 20260916T1800 declara: si alguien inserta una fila arriba en el Sheet, el papel queda apuntando a
 * la de al lado.
 */
export async function comprobantesDePago(filas: number[]): Promise<Resultado<Map<number, ComprobanteDePago[]>>> {
  const v = z.array(z.number().int().min(4)).max(3000).safeParse(filas)
  if (!v.success) return { ok: false, error: 'No pude buscar los comprobantes.' }
  if (!v.data.length) return { ok: true, dato: new Map() }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compra_adjunto')
    .select('id, fila_compras, pago_cambio_id, nombre, media_type, bytes, subido_at, vinculado_por_usuario')
    .eq('tipo', 'pago').in('fila_compras', v.data)
    .order('subido_at', { ascending: false, nullsFirst: false })
  if (error) return { ok: false, error: 'No pude leer los comprobantes de pago.' }
  const filasCrudas = (data ?? []) as unknown as (ComprobanteDePago & { vinculado_por_usuario: string | null })[]
  const nombres = await nombresDe(supabase, filasCrudas.map((f) => f.vinculado_por_usuario))
  const out = new Map<number, ComprobanteDePago[]>()
  for (const f of filasCrudas) {
    const lista = out.get(f.fila_compras) ?? []
    lista.push({ ...f, subido_por: nombres.get(f.vinculado_por_usuario ?? '') ?? null })
    out.set(f.fila_compras, lista)
  }
  return { ok: true, dato: out }
}

/** uuid → nombre. Un id sin perfil se deja en `null`: «lo subió alguien» es más honesto que un uuid. */
async function nombresDe(
  supabase: Awaited<ReturnType<typeof createClient>>, ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => Boolean(x)))]
  if (!unicos.length) return new Map()
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', unicos)
  return new Map(((data ?? []) as { id: string; nombre: string | null }[])
    .filter((p) => p.nombre)
    .map((p) => [p.id, p.nombre as string]))
}

/**
 * Una URL firmada para ver el comprobante. El `storage_path` NO viaja desde el navegador: se lee de
 * la fila con el cliente del USUARIO y por lo tanto pasando por RLS. Si llegara por parámetro,
 * cualquiera podría pedir la firma de un objeto arbitrario del bucket usando esta acción de ariete.
 */
export async function urlDelComprobanteDePago(adjuntoId: string): Promise<Resultado<string>> {
  const id = z.string().uuid().safeParse(adjuntoId)
  if (!id.success) return { ok: false, error: 'Ese comprobante no existe.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compra_adjunto').select('storage_path').eq('id', id.data).eq('tipo', 'pago').maybeSingle()
  if (error) return { ok: false, error: 'No pude leer ese comprobante.' }
  if (!data?.storage_path) return { ok: false, error: 'Ese comprobante no existe o no lo podés ver.' }
  const firma = await supabase.storage.from(BUCKET).createSignedUrl(String(data.storage_path), VIGENCIA)
  if (firma.error || !firma.data?.signedUrl) {
    return { ok: false, error: 'No pude abrir el archivo. Puede haberse movido del respaldo.' }
  }
  return { ok: true, dato: firma.data.signedUrl }
}
