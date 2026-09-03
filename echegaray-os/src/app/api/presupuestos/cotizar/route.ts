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
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EntradaCotizarSchema, adjuntosConHash, clasificarErrorRpc } from '@/features/presupuestos/services/cotizarEntrada'

export const runtime = 'nodejs'
export const maxDuration = 15

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

  const entrada = EntradaCotizarSchema.safeParse(crudo)
  if (!entrada.success) {
    return NextResponse.json({ error: entrada.error.issues[0]?.message ?? 'entrada inválida' }, { status: 400 })
  }

  // El hash es la identidad real del contenido — se calcula ACÁ, del lado del servidor, con el
  // mismo criterio que `hashDe()` en `orquestador/lib/xsas-archivos.mjs`. El RPC valida que tenga
  // forma de sha256 pero no lo recalcula (no tiene `pgcrypto` garantizado en su `search_path`).
  const p_adjuntos = adjuntosConHash(entrada.data.adjuntos)

  const { data, error } = await supabase
    .rpc('cotizacion_encolar_lectura', { p_mensaje: entrada.data.mensaje ?? null, p_adjuntos })

  if (error) {
    // 400 si el RPC lo rechazó a propósito (`raise exception`, ese texto ya es legible para una
    // persona); 500/502 si falló la base o la conexión — ver `clasificarErrorRpc`.
    const { status, motivo } = clasificarErrorRpc(error)
    return NextResponse.json({ error: motivo }, { status })
  }
  // La función devuelve UNA fila de `public.cotizacion_lectura` (no `setof`): PostgREST la entrega
  // como objeto, no como array. Sin tipos generados de Supabase en este repo, se valida la forma
  // mínima que se necesita en vez de confiar a ciegas en un `any`.
  const fila = data as LecturaFila | null
  if (!fila?.id) return NextResponse.json({ error: 'no se pudo encolar la lectura' }, { status: 500 })

  return NextResponse.json({ id: fila.id }, { status: 202 })
}
