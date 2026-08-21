// PRP-024 — PUERTA DE ENTRADA al consentimiento de Google.
//
// Existe por un defecto real, medido el 21/08/2026: la URL de consentimiento mide ~600
// caracteres y viaja mal. Copiada de un chat o de una terminal llega cortada, Google recibe
// la lista de scopes partida al medio y contesta `Error 400: invalid_scope` — que se lee como
// «te falta un permiso» cuando en verdad falta media URL. Un link de 56 caracteres no se corta.
//
// La URL no se arma acá: se le pide al OS, que es el único que tiene la lista de scopes
// (`OAUTH_SCOPES` en orquestador/lib/google-oauth.mjs). Copiarla en este archivo crearía una
// segunda definición del mismo concepto, y el día que se agregue un scope una de las dos
// quedaría vieja sin avisar. El endpoint del OS se lee del registro público os_runtime, igual
// que hace el callback de al lado.
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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

function aviso(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:24px;text-align:center">` +
      `<div style="font-size:40px">⚠️</div><h2 style="color:#b00020">${title}</h2>` +
      `<p style="color:#444;line-height:1.5">${body}</p></div>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const endpoint = await currentEndpoint()
  if (!endpoint) return aviso('El OS no está publicado', 'No se pudo leer el endpoint del OS. Reintentá en un momento.')

  // `state` sólo viaja de vuelta en el callback: sirve para saber quién arrancó el pedido.
  const state = req.nextUrl.searchParams.get('state') || 'os'
  try {
    const r = await fetch(`${endpoint.replace(/\/$/, '')}/oauth/start?state=${encodeURIComponent(state)}`, {
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    const data = (await r.json()) as { url?: string; error?: string }
    if (!r.ok || !data.url) return aviso('No se pudo armar la autorización', data.error || 'El OS no devolvió la URL de consentimiento.')
    // 302 y no 307: es una navegación del usuario, no el reenvío de un método con cuerpo.
    return NextResponse.redirect(data.url, 302)
  } catch (e) {
    return aviso('Error de conexión', `No se pudo contactar al OS: ${e instanceof Error ? e.message : 'error'}.`)
  }
}
