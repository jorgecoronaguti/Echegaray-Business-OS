// Tests del servidor HTTP: transporte, canje del enlace, sesión y fugas de información.
// Sin red y sin base: el cliente de Google es el fake del fixture estructural.

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearServidorAsistencia } from './servidor.mjs'
import { NOMBRE_COOKIE } from './sesion-web.mjs'
import { BASE, FECHA_HOY, googleQueFalla, levantarServidor as levantar } from './dobles-de-prueba.mjs'

test('sin secreto de firma el servidor no levanta', () => {
  assert.throws(() => crearServidorAsistencia({ api: {}, secreto: '' }), /ORQ_ASISTENCIA_WEB_SECRETO/)
})

test('el enlace se canjea por una sesión y es de UN SOLO USO', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  const r = await s.entrar()
  assert.equal(r.status, 302)
  assert.equal(r.headers.get('location'), BASE)
  assert.match(r.headers.get('set-cookie'), new RegExp(`^${NOMBRE_COOKIE}=`))
  // El token no vuelve a servir: lo consumió el frente C.
  const otra = await s.pedir(`${BASE}?t=token-bueno`)
  assert.equal(otra.status, 401)
  const html = await otra.text()
  assert.match(html, /ya se usó/i)
})

test('un token inválido no deja una pantalla en blanco: dice qué hacer', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  const r = await s.pedir(`${BASE}?t=cualquiera`)
  assert.equal(r.status, 401)
  assert.match(await r.text(), /Escribí \/asistencia en Mattermost/)
})

test('sin sesión no se sirve la pantalla ni la API', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  assert.equal((await s.pedir(BASE)).status, 401)
  const api = await s.pedir(`${BASE}/api/contexto`)
  assert.equal(api.status, 401)
  assert.match((await api.json()).error, /sesión/i)
})

test('con sesión se sirve la pantalla y sus estáticos, con CSP y sin caché', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  await s.entrar()
  const r = await s.pedir(BASE)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal(r.headers.get('cache-control'), 'no-store')
  const html = await r.text()
  assert.match(html, /data-base="\/asistencia"/)
  assert.match(html, /\/asistencia\/pantalla\.css/)
  assert.doesNotMatch(html, /\{\{BASE\}\}/)
  assert.equal((await s.pedir(`${BASE}/pantalla.css`)).status, 200)
  assert.equal((await s.pedir(`${BASE}/pantalla.js`)).status, 200)
})

test('no se puede salir del directorio público', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  await s.entrar()
  for (const ruta of ['/api.mjs', '/../api.mjs', '/publico/pantalla.js', '/.env']) {
    assert.equal((await s.pedir(BASE + ruta)).status, 404, ruta)
  }
})

test('una excepción del núcleo NO filtra stack, rutas ni secretos', async (t) => {
  const s = await levantar({ google: googleQueFalla() })
  t.after(s.cerrar)
  await s.entrar()
  const r = await s.pedir(`${BASE}/api/contexto?fecha=${FECHA_HOY}`)
  assert.equal(r.status, 500)
  const crudo = await r.text()
  assert.equal(JSON.parse(crudo).error, 'No se pudo completar la operación.')
  for (const filtracion of ['ANTHROPIC', 'Bearer', '/home/jorge', 'google.mjs', 'at ']) {
    assert.ok(!crudo.includes(filtracion), `filtró «${filtracion}»`)
  }
})

test('el body del POST tiene tope de tamaño y no rompe el servidor', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  await s.entrar()
  const enorme = JSON.stringify({ fecha: FECHA_HOY, obra: 'x', items: [], relleno: 'a'.repeat(300 * 1024) })
  const r = await s.pedir(`${BASE}/api/registrar`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: enorme,
  })
  assert.ok([400, 413].includes(r.status), `status ${r.status}`)
  assert.match((await r.json()).error, /No se pudo leer la carga/)
})

test('un JSON roto se contesta en castellano, no con un stack de parseo', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  await s.entrar()
  const r = await s.pedir(`${BASE}/api/registrar`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{esto no es json',
  })
  assert.equal(r.status, 400)
  assert.match((await r.json()).error, /No se pudo leer la carga/)
})

test('métodos y rutas desconocidas se cierran', async (t) => {
  const s = await levantar()
  t.after(s.cerrar)
  await s.entrar()
  assert.equal((await s.pedir(BASE, { method: 'POST' })).status, 405)
  assert.equal((await s.pedir(`${BASE}/api/contexto`, { method: 'POST' })).status, 404)
  assert.equal((await s.pedir('/otra-cosa')).status, 404)
})

test('si el catálogo de motivos todavía no existe, se lee pero NO se registra', async (t) => {
  // Sin el módulo del frente A no hay con qué validar un motivo. Antes que inventar la
  // validación, se corta la escritura y se dice por qué: leer sí, escribir no. Esto es
  // exactamente lo que devuelve `dameMotivos` cuando el módulo todavía no está.
  const s = await levantar({
    motivos: { disponible: false, CATALOGO: [], motivosPara: () => [], validarNovedad: () => ({ ok: false, error: 'El catálogo de motivos todavía no está disponible en el sistema.' }) },
  })
  t.after(s.cerrar)
  await s.entrar()
  const ctx = await s.json(`${BASE}/api/contexto?fecha=${FECHA_HOY}`)
  assert.equal(ctx.status, 200)
  assert.deepEqual(ctx.cuerpo.motivos, [], 'la pantalla no inventa una lista de motivos')
  const obra = ctx.cuerpo.obras[0].clave
  const cua = await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)
  assert.equal(cua.status, 200, 'la lectura sigue funcionando')
  const p = cua.cuerpo.personal[0]
  const r = await s.postear({
    fecha: FECHA_HOY, obra, idempotency_key: 'km',
    items: [{ ref: p.ref, nombre: p.nombre, presente: true, horas: p.horas }],
  })
  assert.equal(r.status, 400)
  assert.match(r.cuerpo.error, /catálogo de motivos todavía no está disponible/)
  assert.equal(s.google.escrituras.length, 0)
})

test('en modo estricto, sin base que confirme el permiso no se opera (fail-closed)', async (t) => {
  const previo = process.env.ORQ_ASISTENCIA_PERMISOS
  process.env.ORQ_ASISTENCIA_PERMISOS = 'estricto'
  t.after(() => { if (previo == null) delete process.env.ORQ_ASISTENCIA_PERMISOS; else process.env.ORQ_ASISTENCIA_PERMISOS = previo })
  const s = await levantar()
  t.after(s.cerrar)
  await s.entrar()
  const r = await s.json(`${BASE}/api/contexto?fecha=${FECHA_HOY}`)
  assert.equal(r.status, 403)
  assert.match(r.cuerpo.error, /No tenés habilitada la carga/)
})
