#!/usr/bin/env node
// LA IDENTIDAD QUE CREA TIENE QUE SER LA QUE LEE. Hermético: fetch falso, 0 red.
//
// El defecto (31/08): `ownerToken()` saltaba a `ORQ_GOOGLE_IMPERSONATE` aunque el cliente se
// hubiera armado COMO UNA PERSONA. En `interactive-server.mjs` —que arma el cliente con
// `operadorPara(userEmail)`— eso significaba crear el archivo en el Drive de jorge y leerlo como
// el otro usuario: 404 al verificar, y el archivo en la cuenta equivocada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeGoogleClient } from './google.mjs'

/** Devuelve el Bearer con el que se hizo cada llamada. */
function espia(tokens) {
  return async (url, opts = {}) => {
    tokens.push([new URL(url).pathname, String(opts.headers?.Authorization || '').replace('Bearer ', '')])
    const j = { id: 'NEW', name: 'x', parents: [], webViewLink: 'l' }
    return { ok: true, status: 200, async json() { return j }, async text() { return JSON.stringify(j) } }
  }
}

test('un cliente armado como PERSONA crea con SU token, no con el de ORQ_GOOGLE_IMPERSONATE', async () => {
  const previo = process.env.ORQ_GOOGLE_IMPERSONATE
  process.env.ORQ_GOOGLE_IMPERSONATE = 'jorge@ecsas.com.ar'
  try {
    const tokens = []
    const g = makeGoogleClient({ getToken: async () => 'TOKEN-DE-LA-PERSONA', fetchImpl: espia(tokens) })
    await g.createFile({ name: 'x', mimeType: 'application/vnd.google-apps.document' })
    await g.getMeta('NEW')
    const creacion = tokens.find(([p]) => p === '/drive/v3/files')
    const lectura = tokens.find(([p]) => p.includes('/files/NEW'))
    assert.equal(creacion[1], 'TOKEN-DE-LA-PERSONA', 'creó con otra identidad')
    assert.equal(lectura[1], 'TOKEN-DE-LA-PERSONA')
    // LA INVARIANTE: si estas dos difieren, verificar una creación es imposible.
    assert.equal(creacion[1], lectura[1], 'la identidad que crea no es la que lee')
  } finally {
    if (previo === undefined) delete process.env.ORQ_GOOGLE_IMPERSONATE
    else process.env.ORQ_GOOGLE_IMPERSONATE = previo
  }
})

test('renombrar, mover, copiar y archivar usan la MISMA identidad que la lectura', async () => {
  const previo = process.env.ORQ_GOOGLE_IMPERSONATE
  process.env.ORQ_GOOGLE_IMPERSONATE = 'jorge@ecsas.com.ar'
  try {
    const tokens = []
    const g = makeGoogleClient({ getToken: async () => 'MIA', fetchImpl: espia(tokens) })
    await g.renameFile('NEW', 'y')
    await g.moveFile('NEW', 'CARP')
    await g.copyFile('NEW', 'copia')
    await g.trashFile('NEW')
    await g.getMeta('NEW')
    const distintos = tokens.filter(([, t]) => t !== 'MIA')
    assert.deepEqual(distintos, [], `estas llamadas usaron otra identidad: ${JSON.stringify(distintos)}`)
  } finally {
    if (previo === undefined) delete process.env.ORQ_GOOGLE_IMPERSONATE
    else process.env.ORQ_GOOGLE_IMPERSONATE = previo
  }
})
