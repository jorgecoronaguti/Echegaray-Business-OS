// La capacidad vista desde el motor de tools, y la frontera con el modelo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { presentacionTools } from './presentacion-tool.mjs'
import { slidesPdfTools } from './slides-pdf-tool.mjs'
import { webSearchTools } from './web.mjs'

const tools = presentacionTools(null)

test('la capacidad canónica se llama crear_presentacion_google_slides y crea en Drive', () => {
  assert.equal(tools['slides.crear'].schema.name, 'crear_presentacion_google_slides')
  assert.equal(tools['slides.crear'].capability, 'drive.write')
  assert.match(tools['slides.crear'].schema.description, /GOOGLE SLIDES/)
  assert.match(tools['slides.crear'].schema.description, /link/)
})

test('NO hay dos tools que creen presentaciones (la vieja se fue, no convive)', () => {
  const creadoras = [...Object.values(slidesPdfTools(null)), ...Object.values(presentacionTools(null))]
    .filter((t) => /^crear_.*presentacion/i.test(t.schema.name))
  assert.equal(creadoras.length, 1, creadoras.map((t) => t.schema.name).join(', '))
  assert.equal(Object.hasOwn(slidesPdfTools(null), 'drive.create_slides'), false)
})

test('el esquema NO le ofrece al modelo una sola forma de pedir diseño', () => {
  // Se miran los NOMBRES de propiedad, no el texto: las descripciones nombran colores y medidas
  // para explicar por qué no se piden, y eso está bien.
  const nombres = new Set()
  const recorrer = (n, prof = 0) => {
    if (!n || typeof n !== 'object' || prof > 8) return
    for (const k of Object.keys(n.properties || {})) { nombres.add(k); recorrer(n.properties[k], prof + 1) }
    if (n.items) recorrer(n.items, prof + 1)
  }
  recorrer(tools['slides.crear'].schema.input_schema)
  for (const prohibido of ['x', 'y', 'color', 'fontSize', 'fontFamily', 'tamano', 'margen', 'ancho', 'alto', 'posicion', 'estilo', 'layout', 'plantilla']) {
    assert.equal(nombres.has(prohibido), false, `el esquema deja pedir ${prohibido}`)
  }
  // y sí ofrece lo que es contenido
  for (const debe of ['titulo', 'puntos', 'indicadores', 'origen', 'fuentes']) assert.ok(nombres.has(debe), `falta ${debe}`)
})

test('la previsualización no toca Google y avisa qué no entra', async () => {
  // `google` es null: si esta tool intentara escribir, reventaría.
  const r = await tools['slides.previsualizar'].run({
    tipo: 'AVANCE_OBRA', titulo: 'Avance de obra', laminas: [{ tipo: 'puntos', titulo: 'Estado', puntos: ['x'] }],
  })
  assert.equal(r.ok, true)
  assert.equal(r.control_de_calidad.bloqueantes, 0)
  const malo = await tools['slides.previsualizar'].run({ tipo: 'NO_EXISTE', titulo: 'x', laminas: [] })
  assert.equal(malo.ok, false)
  assert.ok(malo.errores.length)
})

test('sin cuenta de Google la creación falla claro, no con un stack', async () => {
  const r = await tools['slides.crear'].run({ tipo: 'CLIENTE', titulo: 'x', laminas: [{ tipo: 'puntos', titulo: 't', puntos: ['a'] }] })
  assert.match(r.error, /cuenta de Google/)
})

test('la descripción manda a buscar en la web y a marcar lo externo', () => {
  const d = tools['slides.crear'].schema.description
  assert.match(d, /origen:"EXTERNO"|origen: ?"EXTERNO"/)
  assert.match(d, /web_search/)
  assert.match(d, /nunca inventes/i)
  // y las tools de web existen para poder cumplirlo
  assert.ok(webSearchTools()['web.read'])
})
