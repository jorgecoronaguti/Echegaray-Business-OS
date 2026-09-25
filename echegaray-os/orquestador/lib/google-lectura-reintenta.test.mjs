// UNA LECTURA QUE NO RESPONDE SE REINTENTA; UNA ESCRITURA, NO (25/09).
//
// sync-cobranzas falló todas las horas desde las 00:10 del 25/09 porque Google dejó colgada más de 45 s
// la lectura de UNA fila de rótulos y el timeout se tiraba en vez de volver como respuesta. Hermético:
// fetch falso, sin red ni credenciales.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ORQ_GOOGLE_FETCH_TIMEOUT_MS = '30'
const { makeGoogleClient } = await import('./google.mjs')

/** fetch que cuelga las primeras `colgadas` llamadas (hasta el abort) y después contesta. */
function fetchQueCuelga(colgadas, cuerpo) {
  const llamadas = []
  const f = (url, opts = {}) => {
    llamadas.push(opts.method || 'GET')
    if (llamadas.length <= colgadas) {
      return new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))))
    }
    return Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 200 }))
  }
  f.llamadas = llamadas
  return f
}

const cliente = (fetchImpl) => makeGoogleClient({ fetchImpl, getToken: async () => 'tok', soloUsuario: true })

test('una lectura colgada una vez se reintenta y devuelve el dato', async () => {
  const f = fetchQueCuelga(1, { values: [['Fecha', 'Cliente']] })
  const v = await cliente(f).readSheetValues('ID', 'Cobranzas!A1:B1')
  assert.deepEqual(v, [['Fecha', 'Cliente']])
  assert.equal(f.llamadas.length, 2)
})

test('una lectura que sigue colgada falla después de los reintentos, con el mensaje de timeout', async () => {
  const f = fetchQueCuelga(99, {})
  await assert.rejects(cliente(f).readSheetValues('ID', 'Cobranzas!A1:B1'), /google api timeout/)
  assert.equal(f.llamadas.length, 3) // 1 + 2 reintentos
})
