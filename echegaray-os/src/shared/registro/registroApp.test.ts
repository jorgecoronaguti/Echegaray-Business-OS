import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, debeRegistrar, esDeFondo, normalizar, pilaCorta, registrar, uidDeCookies } from './registroApp.ts'

const h = (o: Record<string, string> = {}) => ({ get: (n: string) => o[n] ?? null })
const UID = '543b2008-7540-494f-bfd6-5e30bc601ac8'

const b64url = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (sub: string) => `${b64url('{"alg":"ES256"}')}.${b64url(JSON.stringify({ sub }))}.firma`

test('clasificar: redirección, rechazo, acción y navegación', () => {
  assert.equal(clasificar('GET', 307), 'redireccion')
  assert.equal(clasificar('GET', 308), 'redireccion')
  assert.equal(clasificar('GET', 403), 'rechazo')
  assert.equal(clasificar('POST', 401), 'rechazo')
  assert.equal(clasificar('POST', 200), 'accion')
  assert.equal(clasificar('GET', 200), 'navegacion')
  assert.equal(clasificar('GET', 503), 'navegacion')
})

test('debeRegistrar: fuera prefetch, estáticos, _next y el propio registro de errores', () => {
  assert.equal(debeRegistrar('/obras/hoy', 'GET', h()), true)
  assert.equal(debeRegistrar('/obras/hoy', 'GET', h({ rsc: '1' })), true)
  assert.equal(debeRegistrar('/obras/hoy', 'GET', h({ 'next-router-prefetch': '1' })), false)
  assert.equal(debeRegistrar('/obras/hoy', 'GET', h({ purpose: 'prefetch' })), false)
  assert.equal(debeRegistrar('/obras/hoy', 'GET', h({ 'sec-purpose': 'prefetch;prerender' })), false)
  assert.equal(debeRegistrar('/logo.png', 'GET', h()), false)
  assert.equal(debeRegistrar('/_next/data/x.json', 'GET', h()), false)
  assert.equal(debeRegistrar('/api/registro-error', 'POST', h()), false)
  assert.equal(debeRegistrar('/obras/hoy', 'HEAD', h()), false)
  assert.equal(debeRegistrar('/obras/hoy', 'POST', h()), true)
  assert.equal(debeRegistrar('/api/version', 'GET', h()), false)
})

test('esDeFondo: carga de pantalla entera no, fetch del router sí, sin cabecera no se afirma', () => {
  assert.equal(esDeFondo(h({ 'sec-fetch-dest': 'document' })), false)
  assert.equal(esDeFondo(h({ 'sec-fetch-dest': 'empty' })), true)
  assert.equal(esDeFondo(h()), false)
})

test('uidDeCookies: cookie entera, partida en trozos, en base64 y basura', () => {
  const json = JSON.stringify({ access_token: jwt(UID), refresh_token: 'r' })
  assert.equal(uidDeCookies(`otra=1; sb-abc-auth-token=${encodeURIComponent(json)}`), UID)
  const b = 'base64-' + b64url(json)
  const mitad = Math.floor(b.length / 2)
  assert.equal(uidDeCookies(`sb-abc-auth-token.0=${b.slice(0, mitad)}; sb-abc-auth-token.1=${b.slice(mitad)}; x=y`), UID)
  assert.equal(uidDeCookies('sb-abc-auth-token=basura'), null)
  assert.equal(uidDeCookies(`sb-abc-auth-token=${encodeURIComponent(JSON.stringify({ access_token: jwt('no-es-uuid') }))}`), null)
  assert.equal(uidDeCookies(null), null)
  assert.equal(uidDeCookies('os_rol=x'), null)
})

test('normalizar: recorta textos largos, descarta un perfil que no es uuid y achica el detalle', () => {
  const f = normalizar({ tipo: 'error_cliente', ruta: '/x'.repeat(400), perfil_id: 'nadie', mensaje: 'm'.repeat(5000), detalle: { pila: 'p'.repeat(9000) } })
  assert.equal((f.ruta as string).length, 501)
  assert.equal(f.perfil_id, null)
  assert.equal((f.mensaje as string).length, 1001)
  assert.ok(JSON.stringify(f.detalle).length < 4100)
  assert.equal(normalizar({ tipo: 'navegacion', ruta: '/', perfil_id: UID }).perfil_id, UID)
  assert.equal(normalizar({ tipo: 'navegacion', ruta: '/', consulta: '' }).consulta, null)
})

test('registrar: nunca tira, y sin configuración no llama a nadie', async () => {
  const antes = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  let llamadas = 0
  assert.equal(await registrar({ tipo: 'navegacion', ruta: '/' }, { fetch: (async () => { llamadas++; return new Response() }) as typeof fetch }), false)
  assert.equal(llamadas, 0)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_x'
  let cab: Record<string, string> = {}
  assert.equal(await registrar({ tipo: 'navegacion', ruta: '/' }, { fetch: (async (_u: string, i: RequestInit) => { cab = i.headers as Record<string, string>; return new Response(null, { status: 201 }) }) as typeof fetch }), true)
  assert.equal(cab.authorization, undefined)
  assert.equal(cab.apikey, 'sb_secret_x')
  assert.equal(await registrar({ tipo: 'navegacion', ruta: '/' }, { fetch: (async () => { throw new Error('red caída') }) as typeof fetch }), false)
  if (antes.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = antes.url
  if (antes.k === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = antes.k
})

test('pilaCorta: primeras líneas, recortadas', () => {
  assert.equal(pilaCorta('a\n  b\nc', 2), 'a\nb')
  assert.equal(pilaCorta(null), null)
})
