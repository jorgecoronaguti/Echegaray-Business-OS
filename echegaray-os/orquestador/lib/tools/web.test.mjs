// Las tools de internet vistas desde AFUERA: lo que devuelven al motor, no lo que hacen adentro.
import test from 'node:test'
import assert from 'node:assert/strict'
import { webSearchTools } from './web.mjs'

const tools = webSearchTools()

test('las tres capacidades de internet están declaradas y son de LECTURA', () => {
  for (const clave of ['web.search', 'web.read', 'web.browser']) {
    assert.ok(tools[clave], `falta ${clave}`)
    assert.equal(tools[clave].capability, 'drive.read')
    assert.ok(tools[clave].schema.name)
    assert.ok(tools[clave].schema.description.length > 80)
  }
})

test('web_leer no sale a la red cuando le dan una dirección interna', async () => {
  const r = await tools['web.read'].run({ url: 'http://127.0.0.1:5432/' })
  assert.match(r.error, /red interna|no puedo leer/)
})

test('web_navegar rechaza el guión hostil sin abrir nada', async () => {
  const r = await tools['web.browser'].run({ pasos: [{ accion: 'ir', url: 'https://x.example' }, { accion: 'escribir', selector: '#clave', texto: 'x' }] })
  assert.match(r.error, /credenciales/)
})

test('las tools piden lo mínimo y avisan cuando falta', async () => {
  assert.match((await tools['web.search'].run({})).error, /falta query/)
  assert.match((await tools['web.read'].run({})).error, /falta url/)
  assert.match((await tools['web.browser'].run({})).error, /falta el guión/)
})
