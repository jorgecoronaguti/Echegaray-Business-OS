// Las tools de internet vistas desde AFUERA: lo que devuelven al motor, no lo que hacen adentro.
import test from 'node:test'
import assert from 'node:assert/strict'
import { webSearchTools } from './web.mjs'

const tools = webSearchTools()

test('las tres capacidades de internet están declaradas, y cada una nombra su efecto', () => {
  for (const clave of ['web.search', 'web.read', 'web.browser']) {
    assert.ok(tools[clave], `falta ${clave}`)
    assert.ok(tools[clave].schema.name)
    assert.ok(tools[clave].schema.description.length > 80)
  }
  // Buscar y leer bajan una página: son lectura.
  assert.equal(tools['web.search'].capability, 'drive.read')
  assert.equal(tools['web.read'].capability, 'drive.read')
  // ═══ NAVEGAR NO (28/08/2026, auditoría) ═══
  //
  // `web.browser` declaraba `drive.read`, que además no describe nada: no lee Drive. Y hace
  // `chromium.launch`: levanta un navegador en la VM y sale a internet desde la IP de la empresa.
  // Es el mismo argumento por el que `tesoreria.analisis_inversion` dejó de ser `os.read` — un
  // efecto sobre un sistema de un tercero no es una lectura del OS aunque no escriba una fila.
  assert.equal(tools['web.browser'].capability, 'externo.navegar')
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
