import test from 'node:test'
import assert from 'node:assert/strict'
import { credencialDelEntorno } from './google.mjs'

// LA CREDENCIAL DE GOOGLE POR ENTORNO.
//
// Hasta el 26/08/2026 sólo se leía de un ARCHIVO, y eso ataba el OS a la VM: en Vercel —donde corre
// la web— no hay disco donde ponerlo, así que el portal del cliente NUNCA pudo leer Drive y su
// pantalla de Documentos decía «no pudimos leer la carpeta ahora», siempre, sin decir por qué.

const KEY = JSON.stringify({ client_email: 'os@ecsas.iam.gserviceaccount.com', private_key: '-----A\\nB-----' })

test('sin la variable no se inventa nada: se cae al archivo', () => {
  assert.equal(credencialDelEntorno({}), null)
  assert.equal(credencialDelEntorno({ GOOGLE_SA_KEY_JSON: '   ' }), null)
})

test('acepta el JSON crudo y también en base64', () => {
  // Pegar un JSON multilínea en un panel de variables de entorno rompe en la mitad de los paneles.
  assert.equal(credencialDelEntorno({ GOOGLE_SA_KEY_JSON: KEY }).client_email, 'os@ecsas.iam.gserviceaccount.com')
  assert.equal(
    credencialDelEntorno({ GOOGLE_SA_KEY_JSON_B64: Buffer.from(KEY).toString('base64') }).client_email,
    'os@ecsas.iam.gserviceaccount.com',
  )
})

test('los saltos de línea escapados se desescapan: si no, la clave no firma', () => {
  // Los paneles guardan `\n` literal. Sin esto la clave parece correcta y falla al firmar el token,
  // que es el peor modo de falla: no da error al arrancar, da 401 recién al primer pedido.
  assert.ok(credencialDelEntorno({ GOOGLE_SA_KEY_JSON: KEY }).private_key.includes('\n'))
})

test('una credencial mal pegada GRITA en vez de caerse al archivo en silencio', () => {
  assert.throws(() => credencialDelEntorno({ GOOGLE_SA_KEY_JSON: 'no-es-json' }), /no es un JSON válido/)
  assert.throws(
    () => credencialDelEntorno({ GOOGLE_SA_KEY_JSON: '{"client_email":"a@b.c"}' }),
    /no es el key de un service account/,
  )
})
