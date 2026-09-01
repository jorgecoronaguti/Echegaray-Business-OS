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
import { olvidarPuerta, resolverPuerta } from '@/shared/xsas/puerta'
import { contextoDelCliente } from '@/shared/xsas/contexto'

export const runtime = 'nodejs'
export const maxDuration = 60

interface EntradaXsas {
  mensaje?: string
  intencion?: string
  contexto?: Record<string, unknown>
  entidad?: { obra_id?: string; cliente_id?: string }
  origen?: string
  correlation_id?: string
  adjuntos?: { nombre?: unknown; contenido?: unknown }[]
}

/** Adjuntos con contenido en texto (un CSV, un extracto pegado). El servidor impone los topes ANTES
 *  de reenviar: el contrato del OS los vuelve a imponer, pero rebotar acá da un error legible. */
function adjuntosValidados(crudos: EntradaXsas['adjuntos']): { nombre: string; contenido: string }[] {
  if (!Array.isArray(crudos)) return []
  return crudos
    .filter((a): a is { nombre?: unknown; contenido?: unknown } => Boolean(a) && typeof a === 'object')
    .slice(0, 10)
    .map((a) => ({ nombre: String(a.nombre ?? 'adjunto').slice(0, 200), contenido: String(a.contenido ?? '') }))
    .filter((a) => a.contenido.length > 0 && a.contenido.length <= 512 * 1024)
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
  // El contexto del navegador entra FILTRADO, no ordenado. Ver `shared/xsas/contexto.ts`.
  const delCliente = contextoDelCliente(entrada.contexto)

  const pedido = {
    actor: { id: user.id, nombre: perfil.nombre ?? null, rol: perfil.rol },
    canal: 'app',
    origen: entrada.origen ?? null,
    mensaje: entrada.mensaje ?? null,
    intencion: entrada.intencion ?? null,
    // ═══ EL CONTEXTO DE ENTIDAD LO PRODUCE EL SERVIDOR, Y SÓLO EL SERVIDOR ═══
    //
    // Primero estuvo al revés —`{...contexto, ...(entrada.contexto ?? {})}`— y el navegador pisaba
    // el nombre que el servidor había leído con la RLS. Invertir el spread tapó ese caso y dejó el
    // otro abierto: un cliente que NO manda `entidad.obra_id` y manda `contexto: {obra: "…"}` no
    // tiene nada que pisar, porque el servidor no verificó nada. La auditoría independiente lo probó
    // contra la puerta viva y sacó el costo real de una obra con un rol que no debía verlo.
    //
    // Ahora el navegador sólo puede aportar dónde está parado. El resto se descarta y se declara.
    contexto: { ...delCliente.permitido, ...contexto },
    entidad,
    // La firma sólo se pone cuando ALGO se verificó de verdad. Sin contexto no hay nada que firmar.
    ...(Object.keys(entidad).length ? { verificado_por: 'app-server' as const } : {}),
    correlation_id: entrada.correlation_id ?? null,
    adjuntos: adjuntosValidados(entrada.adjuntos),
  }

  // La puerta se resuelve DESPUÉS de identificar al usuario: sin sesión no se toca la base por un
  // secreto. Fail-closed y ruidoso — sin puerta no hay a dónde ir, y contestar algo inventado sería
  // peor que decir que falta configuración.
  let puerta = await resolverPuerta()
  if (!puerta) {
    return NextResponse.json({ error: 'XSAS no está publicado ahora mismo (no hay endpoint ni secreto de la puerta)' }, { status: 503 })
  }

  const postear = (destino: { url: string; secreto: string }) => fetch(destino.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xsas-secreto': destino.secreto },
    body: JSON.stringify(pedido),
    signal: AbortSignal.timeout(55_000),
  })

  try {
    let upstream: Response
    try {
      upstream = await postear(puerta)
    } catch (primera) {
      // El túnel rota su URL en cada reinicio. Un fallo de conexión casi siempre significa que la
      // URL que teníamos ya no existe: se olvida, se vuelve a descubrir y se reintenta UNA vez. Sin
      // esto, cada reinicio del túnel dejaba la app contestando 502 hasta el próximo despliegue.
      olvidarPuerta()
      const denuevo = await resolverPuerta()
      if (!denuevo || denuevo.url === puerta.url) throw primera
      puerta = denuevo
      upstream = await postear(puerta)
    }
    const cuerpo = (await upstream.json()) as Record<string, unknown>
    // Lo que la pantalla pidió y no puede ver se DICE. Un contexto ignorado en silencio produce una
    // respuesta que parece de la obra y no lo es.
    if (rechazadas.length) cuerpo.contextoRechazado = rechazadas
    if (delCliente.descartado.length) cuerpo.contextoDescartado = delCliente.descartado
    return NextResponse.json(cuerpo, { status: upstream.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error de conexión'
    return NextResponse.json({ error: `no se pudo alcanzar XSAS: ${msg}` }, { status: 502 })
  }
}
