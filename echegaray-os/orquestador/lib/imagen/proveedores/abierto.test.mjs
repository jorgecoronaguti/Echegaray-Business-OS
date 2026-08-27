// EL PROVEEDOR SIN CREDENCIAL. Cada test acá prueba un modo de falla real, no que el código exista.
import test from 'node:test'
import assert from 'node:assert/strict'
import { imagenAbierta, medidaDe, promptCorto, semillaDe, urlDePedido } from './abierto.mjs'

const respuesta = (bytes, { status = 200, tipo = 'image/jpeg' } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? tipo : null) },
  arrayBuffer: async () => bytes,
})

test('16:9 pide una medida 16:9 de verdad', () => {
  const { width, height } = medidaDe('16:9')
  assert.ok(Math.abs(width / height - 16 / 9) < 0.01)
})

test('un aspecto desconocido no rompe: cae en cuadrado', () => {
  assert.deepEqual(medidaDe('banana'), { width: 1024, height: 1024 })
})

test('el mismo prompt da la misma semilla — una lámina regenerada no cambia de imagen', () => {
  assert.equal(semillaDe('obra en ejecución'), semillaDe('obra en ejecución'))
  assert.notEqual(semillaDe('obra en ejecución'), semillaDe('obra terminada'))
})

test('el prompt viaja escapado: un espacio o un acento no parten la URL', () => {
  const u = urlDePedido({ prompt: 'planificación de obra, sol de mañana', aspecto: '16:9', base: 'https://x.test' })
  assert.ok(u.startsWith('https://x.test/prompt/'))
  assert.ok(!/\s/.test(u))
  assert.ok(u.includes("width=1280"))
  assert.ok(u.includes('nologo=true'))
})

test('devuelve la imagen en base64 con su tipo', async () => {
  const bytes = Buffer.alloc(4096, 7)
  const r = await imagenAbierta.generar({ prompt: 'una obra', fetchImpl: async () => respuesta(bytes) })
  assert.equal(r.proveedor, 'imagenes-abierto')
  assert.equal(r.imagenes[0].mime, 'image/jpeg')
  assert.equal(Buffer.from(r.imagenes[0].base64, 'base64').length, 4096)
})

test('UN 200 QUE NO ES UNA IMAGEN NO PASA — un servicio público puede devolver una página de error', async () => {
  await assert.rejects(
    () => imagenAbierta.generar({ prompt: 'x', fetchImpl: async () => respuesta(Buffer.alloc(9000), { tipo: 'text/html' }) }),
    (e) => e.falta === 'proveedor' && /no una imagen/.test(e.message),
  )
})

test('una imagen de 12 bytes tampoco pasa', async () => {
  await assert.rejects(
    () => imagenAbierta.generar({ prompt: 'x', fetchImpl: async () => respuesta(Buffer.alloc(12)) }),
    (e) => e.falta === 'proveedor',
  )
})

test('el 429 se distingue: es cuota, no un proveedor roto', async () => {
  await assert.rejects(
    () => imagenAbierta.generar({ prompt: 'x', fetchImpl: async () => respuesta(Buffer.alloc(0), { status: 429 }) }),
    (e) => e.falta === 'cuota' && e.status === 429,
  )
})

test('sin prompt no se pide nada al proveedor', async () => {
  let pedidos = 0
  await assert.rejects(
    () => imagenAbierta.generar({ prompt: '   ', fetchImpl: async () => { pedidos++; return respuesta(Buffer.alloc(4096)) } }),
    (e) => e.falta === 'prompt',
  )
  assert.equal(pedidos, 0)
})

test('se puede apagar con una variable, y apagado el cliente lo salta', () => {
  const previo = process.env.ORQ_IMG_ABIERTO
  try {
    process.env.ORQ_IMG_ABIERTO = 'off'
    assert.equal(imagenAbierta.configurado(), false)
    process.env.ORQ_IMG_ABIERTO = 'on'
    assert.equal(imagenAbierta.configurado(), true)
    delete process.env.ORQ_IMG_ABIERTO
    assert.equal(imagenAbierta.configurado(), true, 'encendido por defecto: es el único que no pide configuración')
  } finally {
    if (previo === undefined) delete process.env.ORQ_IMG_ABIERTO
    else process.env.ORQ_IMG_ABIERTO = previo
  }
})

test('del prompt estructurado del motor sale el SUJETO, no el bloque entero', () => {
  const largo = [
    'SUJETO: un equipo de obra revisando un plano al pie de una estructura de hormigón',
    'PARA QUÉ: apoyar la lámina de planificación',
    'DIRECCIÓN DE ARTE: sujeto descentrado, fondo simple',
    'COLOR: gris grafito #30302F y blanco',
  ].join('\n')
  const corto = promptCorto(largo)
  assert.ok(corto.startsWith('un equipo de obra revisando un plano'))
  assert.ok(!corto.includes('DIRECCIÓN DE ARTE'))
  assert.ok(!corto.includes('#30302F'))
  assert.ok(/documentary photograph/.test(corto), 'la cola fotográfica va siempre')
})

test('un prompt sin rótulos se usa igual, no se pierde', () => {
  assert.ok(promptCorto('una excavadora moviendo tierra').startsWith('una excavadora moviendo tierra'))
})

test('la semilla se calcula sobre el prompt ORIGINAL: dos pedidos distintos no colisionan al acortarse', () => {
  assert.notEqual(semillaDe('SUJETO: x\nPARA QUÉ: a'), semillaDe('SUJETO: x\nPARA QUÉ: b'))
})
