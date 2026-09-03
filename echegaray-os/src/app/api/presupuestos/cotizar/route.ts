// COTIZAR UN PLANO DEJA DE SER UNA LLAMADA HTTP BLOQUEANTE.
//
// ═══ POR QUÉ ESTA RUTA NO CORRE EL PIPELINE ═══
//
// `POST /api/xsas` tiene `maxDuration = 60` y aborta a los 55s (`AbortSignal.timeout`), y el
// pipeline del plano llama al modelo DOS veces por lámina (interpretar + medir): tarda minutos.
// Ningún ajuste del timeout alcanza — el techo es de la conexión HTTP, no del cómputo. Esta ruta
// hace UNA sola cosa rápida: valida la sesión, guarda los adjuntos y ENCOLA una tarea del worker
// (`orq.tasks type='cotizacion.plano'`, que el worker 24×7 ya corriendo procesa). Responde 202 con
// el id de la lectura — la pantalla consulta el progreso con `GET /api/presupuestos/cotizar/[id]`.
//
// ═══ POR QUÉ UN RPC Y NO UN INSERT DIRECTO ═══
//
// `orq.tasks` y `orq.xsas_adjunto` viven en el schema `orq`, que no está expuesto a PostgREST. El
// RPC `cotizacion_encolar_lectura` (SECURITY DEFINER, ver la migración) hace ambas escrituras en
// UNA transacción con la sesión del usuario ya identificada — mismo patrón que
// `public.orq_submit_objective`.
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 15

// Mismos topes que `api/xsas/route.ts`: hasta 10 adjuntos, hasta ~8 MB de archivo cada uno
// (~10,9 MB en base64 — la codificación agrega ~1/3).
const TOPE_ADJUNTOS = 10
const TOPE_BASE64 = 11 * 1024 * 1024

const AdjuntoEntrada = z.object({
  nombre: z.string().trim().min(1).max(200),
  contenido_base64: z.string().min(1).max(TOPE_BASE64),
})

const EntradaSchema = z.object({
  mensaje: z.string().trim().max(2000).optional(),
  adjuntos: z.array(AdjuntoEntrada).min(1, 'necesito al menos un plano adjunto').max(TOPE_ADJUNTOS),
})

type LecturaFila = { id: string }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if (!perfil?.rol) return NextResponse.json({ error: 'la cuenta no tiene perfil' }, { status: 403 })

  let crudo: unknown
  try {
    crudo = await req.json()
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 })
  }

  const entrada = EntradaSchema.safeParse(crudo)
  if (!entrada.success) {
    return NextResponse.json({ error: entrada.error.issues[0]?.message ?? 'entrada inválida' }, { status: 400 })
  }

  // El hash es la identidad real del contenido — se calcula ACÁ, del lado del servidor, con el
  // mismo criterio que `hashDe()` en `orquestador/lib/xsas-archivos.mjs`. El RPC valida que tenga
  // forma de sha256 pero no lo recalcula (no tiene `pgcrypto` garantizado en su `search_path`).
  const adjuntosConHash = entrada.data.adjuntos.map((a) => ({
    nombre: a.nombre,
    hash: createHash('sha256').update(Buffer.from(a.contenido_base64, 'base64')).digest('hex'),
    contenido_base64: a.contenido_base64,
  }))

  const { data, error } = await supabase
    .rpc('cotizacion_encolar_lectura', { p_mensaje: entrada.data.mensaje ?? null, p_adjuntos: adjuntosConHash })

  if (error) {
    // El RPC valida (sesión, cantidad de adjuntos, tamaño, hash) con `raise exception`: ese texto
    // ya es legible para una persona, no un código de Postgres — se reenvía tal cual.
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  // La función devuelve UNA fila de `public.cotizacion_lectura` (no `setof`): PostgREST la entrega
  // como objeto, no como array. Sin tipos generados de Supabase en este repo, se valida la forma
  // mínima que se necesita en vez de confiar a ciegas en un `any`.
  const fila = data as LecturaFila | null
  if (!fila?.id) return NextResponse.json({ error: 'no se pudo encolar la lectura' }, { status: 500 })

  return NextResponse.json({ id: fila.id }, { status: 202 })
}
