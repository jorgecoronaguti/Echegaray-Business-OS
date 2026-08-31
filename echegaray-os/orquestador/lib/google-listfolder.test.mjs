#!/usr/bin/env node
// listFolder PAGINA. Hermético: fetch falso, 0 red.
//
// El defecto (31/08): pedía `pageSize=1000` y devolvía `j.files` sin mirar `nextPageToken`. Una
// carpeta con más de mil hijos se truncaba EN SILENCIO. Lo usan `impuestos-fuentes.mjs` y
// `uocra-ddjj.mjs` sobre carpetas fiscales, donde "faltaba un archivo" no se distingue de
// "no existe". Y getMeta tiene que poder traer parents/trashed: sin eso no se verifica un move.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeGoogleClient } from './google.mjs'

/** Drive de mentira: tres páginas de 1.000, 1.000 y 7. */
function fetchDeTresPaginas(urls) {
  const pagina = (n, token) => ({
    files: Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: `a${i}`, mimeType: 'application/pdf' })),
    ...(token ? { nextPageToken: token } : {}),
  })
  return async (url) => {
    urls.push(url)
    const t = /pageToken=([^&]+)/.exec(url)?.[1]
    const cuerpo = t === 'P2' ? pagina(7) : t === 'P1' ? pagina(1000, 'P2') : pagina(1000, 'P1')
    return { ok: true, status: 200, async json() { return cuerpo }, async text() { return JSON.stringify(cuerpo) } }
  }
}

test('listFolder junta TODAS las páginas, no sólo la primera', async () => {
  const urls = []
  const g = makeGoogleClient({ getToken: async () => 'tok', fetchImpl: fetchDeTresPaginas(urls) })
  const items = await g.listFolder('CARPETA')
  assert.equal(items.length, 2007, 'se truncó: la carpeta tiene 2.007 y devolvió otra cosa')
  assert.equal(urls.length, 3)
  assert.ok(urls[0].includes('nextPageToken'), 'no pidió el token de la próxima página')
  assert.ok(urls[1].includes('pageToken=P1'))
})

test('el tope corta explícito: un Drive gigante no cuelga la tarea', async () => {
  const g = makeGoogleClient({ getToken: async () => 'tok', fetchImpl: fetchDeTresPaginas([]) })
  const items = await g.listFolder('CARPETA', { tope: 1 })
  assert.equal(items.length, 1000, 'con tope 1 tiene que cortar después de la primera página')
})

test('getMeta puede traer parents y trashed, que es con lo que se verifica una operación', async () => {
  const urls = []
  const g = makeGoogleClient({
    getToken: async () => 'tok',
    fetchImpl: async (url) => { urls.push(url); const b = { id: 'X', name: 'n', parents: ['P'], trashed: false }; return { ok: true, status: 200, async json() { return b }, async text() { return '{}' } } },
  })
  const corta = await g.getMeta('X')
  assert.ok(decodeURIComponent(urls[0]).includes('fields=id,name,mimeType,size,webViewLink'), 'el default cambió: se le rompe la respuesta a los llamadores viejos')
  const larga = await g.getMeta('X', { campos: 'id,name,parents,trashed,md5Checksum' })
  assert.ok(decodeURIComponent(urls[1]).includes('parents'), 'no pidió parents')
  assert.ok(decodeURIComponent(urls[1]).includes('trashed'), 'no pidió trashed')
  assert.equal(larga.parents[0], 'P')
  assert.equal(corta.id, 'X')
})
