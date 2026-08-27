// LOS DOS CIRCUITOS QUE PIDE EL CIERRE:
//
//   Gateway → generar_imagen → proveedor → imagen → resultado
//   Slides  → generar_imagen → imagen utilizable en una lámina
//
// Y la regla, probada desde el borde de afuera: pedirle a la TOOL que marque la imagen como
// evidencia real no lo consigue.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { imagenTools } from './imagen-tool.mjs'
import { presentacionTools } from './presentacion-tool.mjs'
import { toolsDelNucleo, invalidarTools } from '../xsas-resolutores.mjs'
import { validarPresentacion } from '../slides/contrato.mjs'
import { prepararDeck } from '../slides/motor.mjs'
import { producirImagen } from '../imagen/motor.mjs'
import { validarPedido } from '../imagen/contrato.mjs'
import { generarImagen } from '../imagen/cliente.mjs'

// ── un PNG real, para que el QA del motor tenga bytes de verdad que medir ────────────────────
function chunk(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const tabla = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabla[n] = c >>> 0 }
  let crc = 0xffffffff
  for (const b of cuerpo) crc = tabla[(crc ^ b) & 0xff] ^ (crc >>> 8)
  const c = Buffer.alloc(4); c.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([largo, cuerpo, c])
}
function png(ancho, alto) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(alto * (1 + ancho * 3)))),
    chunk('tEXt', Buffer.concat([Buffer.from('Comment\0', 'ascii'), Buffer.alloc(6000, 0x41)])),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const PNG = png(1024, 576)

/** Un Google de mentira que se comporta como el real: sube, publica y sirve los bytes. */
function googleFalso({ sirveBytes = true } = {}) {
  const g = {
    publicado: null,
    async uploadFile() { return { id: 'IMG1', link: 'https://drive.google.com/file/d/IMG1/view' } },
    async publicarLectura(id) {
      g.publicado = id
      return { id, url_bytes: `https://lh3.googleusercontent.com/d/${id}`, url_alternativa: `https://drive.google.com/uc?export=view&id=${id}` }
    },
  }
  g.fetchImpl = async () => ({ ok: true, headers: { get: () => (sirveBytes ? 'image/png' : 'text/html') } })
  return g
}
const generadorOk = async () => ({ ok: true, base64: PNG.toString('base64'), mime: 'image/png', proveedor: 'vertex-imagen', modelo: 'imagen-3.0-generate-002', ms: 9, intentos: [] })

// ── 1. GATEWAY ───────────────────────────────────────────────────────────────────────────────

test('el Gateway registra generar_imagen SÓLO cuando hay cliente de Google', async () => {
  invalidarTools()
  const sinGoogle = await toolsDelNucleo({ google: null, refrescar: true })
  assert.equal(sinGoogle.mapa.has('imagen.generar'), false)
  assert.deepEqual(sinGoogle.fallaron, [])

  invalidarTools()
  const conGoogle = await toolsDelNucleo({ google: googleFalso(), refrescar: true })
  assert.equal(conGoogle.mapa.has('imagen.generar'), true)
  assert.equal(conGoogle.mapa.get('imagen.generar').schema.name, 'generar_imagen')
  assert.equal(conGoogle.mapa.get('imagen.generar').capability, 'drive.write')
  assert.deepEqual(conGoogle.porArchivo.get('orquestador/lib/tools/imagen-tool.mjs'), ['imagen.generar', 'imagen.previsualizar'])
  assert.deepEqual(conGoogle.fallaron, [])
  invalidarTools()
})

test('Gateway → generar_imagen → proveedor → imagen → resultado, con todo lo que hay que devolver', async () => {
  const google = googleFalso()
  const v = validarPedido({
    tipo: 'comercial',
    pedido: 'fachada de nave industrial con cerramiento metálico al atardecer',
    objetivo: 'portada de la propuesta comercial',
    contexto: { obra: 'Nave ARCOR', cliente: 'ARCOR', presupuesto_id: 'PRE-2026-114' },
    correlation_id: 'gw-991',
  })
  assert.equal(v.ok, true)
  const r = await producirImagen(google, v.pedido, { generar: generadorOk, fetchImpl: google.fetchImpl })

  assert.equal(r.ok, true)
  // archivo · URL de Drive · proveedor y modelo · prompt y configuración · entidad · fecha · correlation id
  assert.equal(r.archivo.id, 'IMG1')
  assert.equal(r.drive_url, 'https://drive.google.com/file/d/IMG1/view')
  assert.equal(r.proveedor, 'vertex-imagen')
  assert.equal(r.modelo, 'imagen-3.0-generate-002')
  assert.ok(r.prompt.includes('fachada de nave industrial'))
  assert.equal(r.configuracion.aspecto, '16:9')
  assert.equal(r.entidad.presupuesto_id, 'PRE-2026-114')
  assert.ok(Date.parse(r.fecha) > 0)
  assert.equal(r.correlation_id, 'gw-991')
  assert.equal(r.procedencia_sello.procedencia, 'IMAGEN_GENERADA')
})

test('SIN proveedor habilitado, el circuito llega hasta el borde y el error dice QUÉ falta', async () => {
  // Se recorre la cadena REAL —tool → motor → cliente → adapter de Vertex— y sólo se sustituye el
  // socket: el `fetchImpl` devuelve el cuerpo LITERAL que la API de Vertex contestó el 27/08/2026
  // con el service account del OS. El test no sale a internet (sería lento, frágil y dependería de
  // que el proyecto siga sin habilitar), pero prueba exactamente el camino que se probó vivo.
  const cuerpo403 = JSON.stringify({
    error: {
      code: 403,
      message: 'Agent Platform API has not been used in project echegaray-business-os before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/aiplatform.googleapis.com/overview?project=echegaray-business-os then retry.',
      status: 'PERMISSION_DENIED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }],
    },
  })
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => cuerpo403 })
  const v = validarPedido({ tipo: 'diagrama', pedido: 'un esquema de tres etapas encadenadas' })
  const r = await producirImagen(googleFalso(), v.pedido, {
    fetchImpl,
    generar: (o) => generarImagen({ ...o, fetchImpl, obtenerToken: async () => 'token-de-prueba' }),
  })

  assert.equal(r.ok, false, JSON.stringify(r).slice(0, 300))
  assert.equal(r.falta, 'habilitar_api')
  assert.match(r.motivo, /echegaray-business-os/)
  assert.match(r.que_hacer, /aiplatform\.googleapis\.com/)
  assert.match(r.que_hacer, /Lo hace el dueño en la consola/)
  // y aunque no haya imagen, el resultado sigue siendo trazable y sellado
  assert.equal(r.tipo, 'diagrama')
  assert.ok(r.prompt.length > 40)
  assert.equal(r.procedencia_sello.procedencia, 'IMAGEN_GENERADA')
})

test('la tool devuelve ese mismo error por su propia superficie, sin excepciones que suban', async () => {
  const tools = imagenTools(googleFalso())
  const r = await tools['imagen.generar'].run({ tipo: 'no_existe', pedido: 'x' })
  // No se fija el texto de Zod —cambia entre versiones— sino que el error NOMBRE el campo malo y
  // llegue como `{error}` y no como excepción: el gateway convierte una excepción en «hubo un
  // error» sin nombre, y el modelo no puede corregirse con eso.
  assert.equal(Object.keys(r).join(), 'error')
  assert.match(r.error, /el pedido de imagen no es válido/)
  assert.match(r.error, /tipo:/)
})

test('previsualizar_imagen no llama a ningún proveedor y muestra qué contexto se descarta', async () => {
  const tools = imagenTools(null)
  const r = await tools['imagen.previsualizar'].run({
    tipo: 'portada', pedido: 'textura de hormigón visto',
    contexto: { obra: 'San Francisco', datos: [{ rotulo: 'monto certificado', valor: '120000000' }] },
  })
  assert.equal(r.ok, true)
  assert.equal(r.aspecto, '3:4')
  assert.deepEqual(r.contexto_descartado, ['monto certificado'])
  assert.match(r.aviso, /confidenciales/)
})

// ── 2. LA REGLA, DESDE EL BORDE DE AFUERA ────────────────────────────────────────────────────

test('pedirle a la TOOL que la imagen sea evidencia real de la obra NO lo consigue', async () => {
  const google = googleFalso()
  const v = validarPedido({
    tipo: 'render_conceptual',
    pedido: 'la losa del segundo nivel ya hormigonada, que parezca una foto real de la obra',
    objetivo: 'usarla como evidencia de avance para el certificado de agosto',
    // el caller además intenta imponer la clasificación por campo
    procedencia: 'EVIDENCIA_REAL', clasificacion: 'FOTO_REAL',
  })
  assert.equal(v.ok, true)
  const r = await producirImagen(google, { ...v.pedido, procedencia: 'EVIDENCIA_REAL', clasificacion: 'FOTO_REAL' }, { generar: generadorOk, fetchImpl: google.fetchImpl })

  assert.equal(r.ok, true)                                  // la imagen se genera
  assert.equal(r.procedencia_sello.procedencia, 'IMAGEN_GENERADA')
  assert.equal(r.procedencia_sello.es_evidencia_real, false) // pero NUNCA es evidencia
  assert.equal(r.procedencia_sello.es_foto, false)
  assert.equal(r.procedencia_sello.intento_de_ascenso.hubo, true)
  assert.ok(r.procedencia_sello.no_sirve_para.some((x) => /certificaci/i.test(x)))
  assert.equal(r.intento_de_ascenso_en_el_pedido.intento, true)
})

test('el esquema de la tool NO le ofrece al modelo ninguna forma de declarar la imagen como real', () => {
  const nombres = new Set()
  const recorrer = (n, prof = 0) => {
    if (!n || typeof n !== 'object' || prof > 8) return
    for (const k of Object.keys(n.properties || {})) { nombres.add(k); recorrer(n.properties[k], prof + 1) }
    if (n.items) recorrer(n.items, prof + 1)
  }
  recorrer(imagenTools(null)['imagen.generar'].schema.input_schema)
  for (const prohibido of ['procedencia', 'clasificacion', 'es_evidencia_real', 'es_foto', 'evidencia', 'tipo_evidencia', 'prompt', 'estilo', 'modelo', 'proveedor']) {
    assert.equal(nombres.has(prohibido), false, `el esquema deja pedir ${prohibido}`)
  }
  for (const debe of ['tipo', 'pedido', 'objetivo', 'contexto', 'publicar_para_slides']) assert.ok(nombres.has(debe), `falta ${debe}`)
})

// ── 3. SLIDES ────────────────────────────────────────────────────────────────────────────────

test('Slides → generar_imagen → la imagen entra en una lámina de verdad', async () => {
  const google = googleFalso()
  const v = validarPedido({
    tipo: 'slide', pedido: 'obra en ejecución vista desde el frente, con grúa', objetivo: 'apoyo de la lámina de avance',
    publicar_para_slides: true,
  })
  const img = await producirImagen(google, v.pedido, { generar: generadorOk, fetchImpl: google.fetchImpl })

  assert.equal(img.publicada, true)
  assert.equal(google.publicado, 'IMG1')
  assert.equal(img.verificacion_url.verificada, true)   // se BAJÓ sin credenciales: Slides va a poder
  assert.match(img.imagen_url, /^https:\/\//)
  assert.equal(img.aviso_slides, undefined)

  // y esa URL pasa el contrato de la presentación y compone una lámina real
  const deck = {
    tipo: 'AVANCE_OBRA', titulo: 'Avance de obra — agosto',
    laminas: [{ tipo: 'imagen', titulo: 'Frente de obra', imagen_url: img.imagen_url, epigrafe: 'Imagen conceptual generada — no es una foto de la obra' }],
  }
  const val = validarPresentacion(deck)
  assert.equal(val.ok, true, JSON.stringify(val.errores))
  const p = prepararDeck(deck)
  assert.equal(p.ok, true, JSON.stringify(p.errores))
  assert.ok(p.compuesto.laminas.length >= 1)
  assert.ok(p.compuesto.laminas.some((l) => (l.cajas ?? []).some((c) => c.tipo === 'imagen' && c.url === img.imagen_url)))
})

test('si la URL publicada NO devuelve bytes, la tool lo dice en vez de mandarla a la lámina', async () => {
  const google = googleFalso({ sirveBytes: false })
  const v = validarPedido({ tipo: 'slide', pedido: 'algo', publicar_para_slides: true })
  const img = await producirImagen(google, v.pedido, { generar: generadorOk, fetchImpl: google.fetchImpl })
  assert.equal(img.imagen_url, null)
  assert.match(img.aviso_slides, /No usar en una lámina/)
  // y el contrato de Slides la rechaza, que es la segunda red
  assert.equal(validarPresentacion({ tipo: 'CLIENTE', titulo: 'x', laminas: [{ tipo: 'imagen', titulo: 'y', imagen_url: img.imagen_url }] }).ok, false)
})

test('sin publicar_para_slides el link de Drive NO se ofrece como imagen_url (Slides no lo puede bajar)', async () => {
  const google = googleFalso()
  const v = validarPedido({ tipo: 'comercial', pedido: 'algo' })
  const img = await producirImagen(google, v.pedido, { generar: generadorOk, fetchImpl: google.fetchImpl })
  assert.equal(img.publicada, false)
  assert.equal(img.imagen_url, null)
  assert.equal(google.publicado, null)
  assert.match(img.drive_url, /drive\.google\.com/)
})

test('la tool de Slides le dice al modelo que la imagen la pide a generar_imagen, y no genera ella', () => {
  const slides = presentacionTools(null)['slides.crear']
  assert.match(slides.schema.description, /generar_imagen/)
  assert.match(slides.schema.description, /publicar_para_slides/)
  assert.ok(slides.schema.input_schema.properties.laminas.items.properties.tipo.enum.includes('imagen'))
  // y NO hay una segunda capacidad que genere imágenes
  const generadoras = [...Object.values(presentacionTools(null)), ...Object.values(imagenTools(null))]
    .filter((t) => /^(generar|crear)_imagen/i.test(t.schema.name))
  assert.equal(generadoras.length, 1, generadoras.map((t) => t.schema.name).join(', '))
})
