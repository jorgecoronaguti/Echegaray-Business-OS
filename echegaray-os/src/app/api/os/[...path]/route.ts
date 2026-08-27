// Frente HTTPS estable del OS interactivo.
//
// La extensión (contexto seguro chrome-extension://) no puede hablar por HTTP plano, y el motor
// interactivo escucha en loopback: desde afuera no hay puerto al que llegar. (Este comentario decía
// «el server no acepta tráfico entrante salvo SSH» y era FALSO hasta el 27/08/2026 — :8790 escuchaba
// en 0.0.0.0 y contestaba desde la IP pública. Ahora es cierto porque se cerró el bind.)
// Este proxy en Vercel es la URL fija y pública: descubre dónde está hoy el OS (túnel saliente, cuya URL
// se publica en `os_runtime`) y reenvía la directiva. Así la extensión apunta
// siempre al frente estable `/api/os/*` — hoy `https://echegaray-business-os.vercel.app`
// y, tras la migración de dominio, también `https://app.ecsas.com.ar` (Vercel sirve
// ambos), pase lo que pase con el túnel saliente.
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
}

/** URL actual del OS, leída del registro público (os_runtime). */
async function currentEndpoint(): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/os_runtime?key=eq.interactive_endpoint&select=value`,
    { headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${SUPABASE_ANON}` }, cache: 'no-store' },
  )
  if (!r.ok) return null
  const rows = (await r.json()) as Array<{ value: string }>
  return rows[0]?.value ?? null
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
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

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(req, (await params).path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<NextResponse> {
  return proxy(req, (await params).path)
}
