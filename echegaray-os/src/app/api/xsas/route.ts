// app.ecsas → XSAS. El cockpit humano del OS, no un chatbot pegado a la web.
//
// ═══ QUÉ HACE ESTA RUTA Y QUÉ NO ═══
//
// Tres cosas y ninguna más: identifica al usuario contra Supabase, VERIFICA que el contexto de
// pantalla que dice tener es suyo de verdad, y reenvía el pedido a la puerta única del OS. No rutea,
// no elige capacidades, no habla con un modelo: eso es del Core, que vive en el orquestador y no
// puede acoplarse a Next.
//
// ═══ POR QUÉ EL CONTEXTO SE VERIFICA EN EL SERVIDOR ═══
//
// El valor de esto es que estando dentro de una obra, «¿por qué estamos atrasados?» no obligue a
// escribir el nombre de la obra. Para eso el `obra_id` de la pantalla viaja con el pedido — y ahí
// está el riesgo: si se creyera lo que manda el navegador, cualquiera pediría el contexto de una
// obra que no puede ver. Por eso la obra se lee ACÁ, con la sesión del usuario, o sea pasando por
// la RLS: si la consulta no la devuelve, la obra no existe PARA ÉL y el contexto no viaja.
//
// El OS, del otro lado, deriva los permisos del ROL. Esta ruta no los manda: si los mandara, sería
// el navegador diciendo qué puede hacer.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const GATEWAY_URL = process.env.XSAS_GATEWAY_URL
const GATEWAY_SECRETO = process.env.XSAS_GATEWAY_SECRET

interface EntradaXsas {
  mensaje?: string
  intencion?: string
  contexto?: Record<string, unknown>
  entidad?: { obra_id?: string; cliente_id?: string }
  origen?: string
  correlation_id?: string
}

/** El contexto de entidad que el usuario PUEDE ver, leído con su propia sesión (o sea, con RLS). */
async function entidadAutorizada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pedida: EntradaXsas['entidad'],
): Promise<{ entidad: Record<string, string>; contexto: Record<string, string>; rechazadas: string[] }> {
  const entidad: Record<string, string> = {}
  const contexto: Record<string, string> = {}
  const rechazadas: string[] = []
  if (pedida?.obra_id) {
    // `maybeSingle` con la sesión del usuario: la RLS ya decide. Un `null` acá NO es un error de
    // la consulta, es la respuesta correcta a «esta obra no es tuya».
    const { data } = await supabase.from('obras').select('id, nombre').eq('id', pedida.obra_id).maybeSingle()
    if (data?.id) {
      entidad.obra_id = data.id
      // El NOMBRE también viaja: las tools del OS reciben la obra por nombre, y el id de la
      // pantalla no les sirve. Sale de la base, nunca del navegador.
      if (data.nombre) contexto.obra = data.nombre
    } else {
      rechazadas.push('obra_id')
    }
  }
  if (pedida?.cliente_id) {
    const { data } = await supabase.from('clientes').select('id').eq('id', pedida.cliente_id).maybeSingle()
    if (data?.id) entidad.cliente_id = data.id
    else rechazadas.push('cliente_id')
  }
  return { entidad, contexto, rechazadas }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!GATEWAY_URL || !GATEWAY_SECRETO) {
    // Fail-closed y RUIDOSO. Sin la puerta configurada no hay a dónde ir; contestar algo inventado
    // sería peor que decir que falta configuración.
    return NextResponse.json({ error: 'XSAS no está configurado en este entorno (falta XSAS_GATEWAY_URL/SECRET)' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data: perfil } = await supabase.from('perfiles').select('rol, nombre').eq('id', user.id).maybeSingle()
  if (!perfil?.rol) return NextResponse.json({ error: 'la cuenta no tiene perfil' }, { status: 403 })

  let entrada: EntradaXsas
  try {
    entrada = (await req.json()) as EntradaXsas
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 })
  }

  const { entidad, contexto, rechazadas } = await entidadAutorizada(supabase, entrada.entidad)

  const pedido = {
    actor: { id: user.id, nombre: perfil.nombre ?? null, rol: perfil.rol },
    canal: 'app',
    origen: entrada.origen ?? null,
    mensaje: entrada.mensaje ?? null,
    intencion: entrada.intencion ?? null,
    contexto: { ...contexto, ...(entrada.contexto ?? {}) },
    entidad,
    // La firma sólo se pone cuando ALGO se verificó de verdad. Sin contexto no hay nada que firmar.
    ...(Object.keys(entidad).length ? { verificado_por: 'app-server' as const } : {}),
    correlation_id: entrada.correlation_id ?? null,
  }

  try {
    const upstream = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-xsas-secreto': GATEWAY_SECRETO },
      body: JSON.stringify(pedido),
      signal: AbortSignal.timeout(55_000),
    })
    const cuerpo = (await upstream.json()) as Record<string, unknown>
    // Lo que la pantalla pidió y no puede ver se DICE. Un contexto ignorado en silencio produce una
    // respuesta que parece de la obra y no lo es.
    if (rechazadas.length) cuerpo.contextoRechazado = rechazadas
    return NextResponse.json(cuerpo, { status: upstream.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error de conexión'
    return NextResponse.json({ error: `no se pudo alcanzar XSAS: ${msg}` }, { status: 502 })
  }
}
