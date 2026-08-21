// UNA PESTAÑA OCULTA TIENE QUE VERSE OCULTA — la máscara de `getSheetMeta`.
//
// ═══ POR QUÉ EXISTE (21/08/2026) ═══
//
// Después de ocultar «Cheques Recibidos» en el archivo real, el control que lo verificaba informó
// "VISIBLES: 35 de 35" y dio la pestaña por visible. La escritura había andado perfecto: lo que
// estaba mal era la pregunta. La máscara de `fields` pedía `sheetId,title,gridProperties` y NO
// `hidden`, así que la API —que OMITE `hidden` cuando es falso, y también cuando no se lo piden—
// devolvía la propiedad ausente, `!h.hidden` daba true, y las 35 contaban como visibles.
//
// El modo de fallar de un campo que falta en una máscara no es un error ni una celda vacía: es una
// respuesta tranquilizadora y equivocada, indistinguible de la buena. Por eso se fija acá y no en
// el consumidor: cualquiera que pregunte "¿está oculta?" tiene que recibir la verdad.
//
// Hermético: sin credenciales, sin red.

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

process.env.ORQ_SHEETS_MARCA = path.join(os.tmpdir(), 'no-existe', 'SHEETS-CONGELADOS')
const { makeGoogleClient } = await import('./google.mjs')

/** Un cliente sin red que devuelve `sheets` y recuerda con qué `fields` se lo pidieron. */
function armar(sheets) {
  const pedidas = []
  const fetchImpl = async (url) => {
    pedidas.push(String(url))
    return {
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ sheets }), text: async () => '{}',
    }
  }
  const google = makeGoogleClient({ auth: { getAccessToken: async () => 'tok' }, fetchImpl })
  return { google, pedidas }
}

test('la máscara PIDE hidden — si no, la respuesta miente tranquilizando', async () => {
  const { google, pedidas } = armar([])
  await google.getSheetMeta('archivo')
  const mascara = decodeURIComponent(pedidas[0] ?? '')
  assert.ok(/properties\([^)]*\bhidden\b/.test(mascara),
    `getSheetMeta no pide "hidden"; con esta máscara toda pestaña se lee como visible: ${mascara}`)
})

test('oculta es true, visible es false — nunca undefined', async () => {
  // La API OMITE `hidden` en las visibles. Devolver `undefined` obliga a cada consumidor a
  // distinguir "no está oculta" de "no pregunté", y esa distinción es justo la que ya se perdió.
  const { google } = armar([
    { properties: { sheetId: 1, title: 'Cheques Recibidos', hidden: true, gridProperties: { rowCount: 66, columnCount: 10 } } },
    { properties: { sheetId: 2, title: 'Cheques Emitidos', gridProperties: { rowCount: 415, columnCount: 13 } } },
  ])
  const meta = await google.getSheetMeta('archivo')
  const porNombre = new Map(meta.map((h) => [h.title, h]))
  assert.equal(porNombre.get('Cheques Recibidos').hidden, true)
  assert.equal(porNombre.get('Cheques Emitidos').hidden, false, 'una visible tiene que dar false, no undefined')
  // Y lo de siempre sigue viniendo: quien contaba filas no se entera de este cambio.
  assert.equal(porNombre.get('Cheques Emitidos').rows, 415)
  assert.equal(porNombre.get('Cheques Recibidos').cols, 10)
})
