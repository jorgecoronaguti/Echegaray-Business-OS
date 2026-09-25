// Frente HTTPS estable del OS interactivo.
//
// La extensión (contexto seguro chrome-extension://) no puede hablar por HTTP plano, y el motor
// interactivo escucha en loopback: desde afuera no hay puerto al que llegar. (Este comentario decía
// «el server no acepta tráfico entrante salvo SSH». Lo que filtra es un cortafuegos delante de la
// VM, no el server, y hasta el 27/08/2026 :8790 escuchaba igual en 0.0.0.0 detrás de él. Ahora el
// bind cierra el borde por su cuenta.)
// Este proxy en Vercel es la URL fija y pública: descubre dónde está hoy el OS (túnel saliente, cuya URL
// se publica en `os_runtime`) y reenvía la directiva. Así la extensión apunta
// siempre al frente estable `/api/os/*` — hoy `https://echegaray-business-os.vercel.app`
// y, tras la migración de dominio, también `https://app.ecsas.com.ar` (Vercel sirve
// ambos), pase lo que pase con el túnel saliente.
import { NextRequest, NextResponse } from 'next/server'
import { endpointInteractivo } from '@/lib/os/endpointInteractivo'
import { decidirProxy, origenPermitido } from '@/lib/os/reglasDelProxy'

export const runtime = 'nodejs'
export const maxDuration = 60


// CORS sólo para el origen de la app (auditoría 25/09/2026; antes `*`). Ver lib/os/reglasDelProxy.ts.
function cors(req: NextRequest): Record<string, string> {
  const origen = origenPermitido(req.headers.get('origin'))
  return origen
    ? { 'access-control-allow-origin': origen, vary: 'origin', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' }
    : { vary: 'origin' }
}

/** URL actual del OS (os_runtime, leída con la clave de servicio: ver lib/os/endpointInteractivo). */
const currentEndpoint = endpointInteractivo

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const CORS = cors(req)
  // El proxy decide ANTES de salir a la red: abiertas, protegidas con credencial, y el resto 404.
  const decision = decidirProxy(path, req.headers.get('authorization'))
  if (!decision.pasa) return NextResponse.json({ error: decision.error }, { status: decision.status, headers: CORS })
  // El túnel se lee de `os_runtime` en CADA pedido (también /health): la URL cambia cada vez que el
  // túnel se reinicia. Se lee con la clave de servicio, del lado del servidor.
  const endpoint = await currentEndpoint()
  if (!endpoint) {
    return NextResponse.json({ error: 'el OS no está publicado ahora mismo (túnel abajo)' }, { status: 503, headers: CORS })
  }
  // Preservar el query string (?id=…): la extensión lo usa en /progress y
  // /operation-status. Sin esto llegaban sin parámetros al OS.
  const target = `${endpoint.replace(/\/$/, '')}/${path.join('/')}${req.nextUrl.search}`
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const auth = req.headers.get('authorization')
  if (auth) headers.authorization = auth

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? await req.text() : undefined,
      signal: AbortSignal.timeout(55_000),
    })
    // Pasar los BYTES CRUDOS (no text()): leer como texto rompe cualquier binario —
    // el .zip de la extensión llegaba corrupto ("formato no compatible") porque UTF-8
    // re-encodeaba los bytes. arrayBuffer preserva JSON y binario por igual.
    const body = await upstream.arrayBuffer()
    const outHeaders: Record<string, string> = {
      ...CORS,
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    }
    const cd = upstream.headers.get('content-disposition')
    if (cd) outHeaders['content-disposition'] = cd
    return new NextResponse(body, { status: upstream.status, headers: outHeaders })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error de conexión con el OS'
    return NextResponse.json({ error: `no se pudo alcanzar el OS: ${msg}` }, { status: 502, headers: CORS })
  }
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: cors(req) })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(req, (await params).path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(req, (await params).path)
}
