// PRP-024 — RETORNO de Google tras el consentimiento del usuario ("Permitir"). Google
// redirige acá (URL estable de Vercel) con ?code=. Reenviamos el code al OS (que tiene el
// client_secret y la DB) para que canjee y guarde el refresh_token, y mostramos una página
// simple de resultado. El endpoint del OS se lee del registro público os_runtime (igual
// que el proxy). Runtime nodejs; sin auth (el code de Google es de un solo uso).
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

function page(title: string, body: string, ok: boolean): NextResponse {
  const color = ok ? '#0a7d32' : '#b00020'
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:24px;text-align:center">` +
      `<div style="font-size:40px">${ok ? '✅' : '⚠️'}</div>` +
      `<h2 style="color:${color}">${title}</h2><p style="color:#444;line-height:1.5">${body}</p>` +
      `<p style="color:#888;font-size:13px">Ya podés cerrar esta pestaña y volver al chat del OS.</p></div>`,
    { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get('code')
  const err = req.nextUrl.searchParams.get('error')
  if (err) return page('No se autorizó', `Google devolvió: ${err}. Volvé a intentar el enlace de autorización.`, false)
  if (!code) return page('Falta el código', 'El retorno de Google no trajo el código de autorización.', false)

  const endpoint = await currentEndpoint()
  if (!endpoint) return page('El OS no está disponible', 'El sistema no está publicado ahora mismo (túnel abajo). Reintentá en un momento.', false)

  try {
    const r = await fetch(`${endpoint.replace(/\/$/, '')}/oauth/exchange?code=${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(20_000),
    })
    const data = (await r.json()) as { ok?: boolean; email?: string; error?: string }
    if (r.ok && data.ok) {
      return page('¡Listo! El OS ya puede actuar como vos', `Autorizaste la cuenta <b>${data.email}</b>. El OS ahora puede leer y crear archivos en tu Drive, y leer Gmail/Calendar — siempre con tu aprobación para cualquier envío.`, true)
    }
    return page('No se pudo completar', `El OS no pudo canjear la autorización: ${data.error || 'error desconocido'}.`, false)
  } catch (e) {
    return page('Error de conexión', `No se pudo contactar al OS: ${e instanceof Error ? e.message : 'error'}.`, false)
  }
}
