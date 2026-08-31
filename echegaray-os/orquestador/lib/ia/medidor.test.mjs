// EL TEST QUE LE EXIGE AL CONTADOR PODER DECIR QUE SÍ.
//
// Un contador de llamadas al modelo que sólo se prueba con cero llamadas no está probado: está
// confirmando un cableado. Los dos casos que importan viven acá juntos a propósito —el que da cero
// y el que da más de cero— porque cualquiera de los dos solo se puede satisfacer con una constante.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  crearMedidorLLM, medirLlamadasLLM, esUrlDeModelo, conciliarLLM, hostsDeModelo,
} from './medidor.mjs'

/** Una respuesta con la forma REAL de la API de mensajes: el medidor lee `usage` y `model` de acá,
 *  y si la forma cambiara el test lo notaría antes que producción. */
const respuestaDeModelo = (usage = { input_tokens: 1200, output_tokens: 340 }) =>
  new Response(JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text: '{"ok":true}' }],
    usage,
  }), { status: 200, headers: { 'content-type': 'application/json' } })

test('MEDIDOR · una corrida que NO llama al modelo mide cero', async () => {
  // El transporte se sustituye para que el test no dependa de internet: lo que se prueba es que una
  // petición a un host que NO es un modelo no toca el contador, y eso no necesita salir de la VM.
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('<html>ficha técnica</html>', { status: 200 })
  try {
    const { medicion } = await medirLlamadasLLM(async () => {
      await fetch('https://www.acindar.com.ar/malla-q188')
      return 'listo'
    }, { medidor: crearMedidorLLM() })

    assert.equal(medicion.total, 0, 'una página web no es una llamada al modelo')
    assert.equal(medicion.tokens, 0)
    assert.equal(medicion.usd, 0)
  } finally { globalThis.fetch = original }
})

// ═══ EL TEST NEGATIVO OBLIGATORIO ═══
// Si esto no pasara a > 0, el contador sería la constante que el §13 vino a denunciar. Se corre con
// un `fetch` sustituido —no se gasta un token para probar que el contador cuenta— pero lo que se
// sustituye es el TRANSPORTE, no el contador: la petición se arma entera y sale por la misma vía.
test('MEDIDOR · una corrida que SÍ llama al modelo mide más de cero — el contador PUEDE subir', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => respuestaDeModelo()
  try {
    const { medicion } = await medirLlamadasLLM(async () => {
      await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', body: JSON.stringify({ model: 'claude-haiku-4-5', messages: [] }),
      })
    }, { medidor: crearMedidorLLM() })

    assert.equal(medicion.total, 1, 'la llamada salió por la red y el contador la vio')
    assert.equal(medicion.tokens, 1540, 'los tokens salen del `usage` del proveedor, no de una estimación')
    assert.ok(medicion.usd > 0, `el costo tiene que ser positivo y fue ${medicion.usd}`)
    // claude-haiku-4-5 = $1/1M in, $5/1M out → 1200/1e6*1 + 340/1e6*5 = 0.0029
    assert.equal(medicion.usd, 0.0029, 'el precio sale de la tabla del repo, no de una copia')
    assert.equal(medicion.sinPrecio, 0, 'el sufijo de versión del modelo no puede dejar el costo en null')
  } finally { globalThis.fetch = original }
})

test('MEDIDOR · cuenta las llamadas que FALLAN: una llamada fallida igual consumió cuota', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('{"error":{"message":"credit balance is too low"}}', { status: 400 })
  try {
    const { medicion } = await medirLlamadasLLM(async () => {
      await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' })
    }, { medidor: crearMedidorLLM() })

    assert.equal(medicion.total, 1)
    assert.equal(medicion.fallidas, 1)
    assert.equal(medicion.tokens, 0, 'un 400 no trae usage y no se inventan tokens')
  } finally { globalThis.fetch = original }
})

test('MEDIDOR · una llamada que ni siquiera llega a salir se cuenta, y el error sigue subiendo', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED api.anthropic.com:443') }
  const medidor = crearMedidorLLM()
  try {
    await assert.rejects(
      () => medirLlamadasLLM(async () => {
        await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' })
      }, { medidor }),
      /ECONNREFUSED/,
      'tapar el error para devolver la medición sería medir una corrida que no pasó',
    )
    assert.equal(medidor.instantanea().total, 1, 'el intento quedó anotado igual')
  } finally { globalThis.fetch = original }
})

test('MEDIDOR · no rompe el cuerpo de la respuesta que mide', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => respuestaDeModelo()
  try {
    const { resultado } = await medirLlamadasLLM(async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' })
      return await r.json()
    }, { medidor: crearMedidorLLM() })
    assert.equal(resultado.content[0].text, '{"ok":true}', 'el llamador tiene que poder leer su propia respuesta')
  } finally { globalThis.fetch = original }
})

test('MEDIDOR · el `fetch` global vuelve a su lugar aunque la corrida tire', async () => {
  const antes = globalThis.fetch
  await assert.rejects(() => medirLlamadasLLM(async () => { throw new Error('se cayó la corrida') }))
  assert.equal(globalThis.fetch, antes, 'dejar el fetch parcheado contaminaría todo lo que siga en el proceso')
})

test('MEDIDOR · reconoce el host, no la forma de la URL', () => {
  assert.equal(esUrlDeModelo('https://api.anthropic.com/v1/messages'), true)
  assert.equal(esUrlDeModelo('https://api.openai.com/v1/chat/completions'), true)
  // El defecto que esto evita: contar como LLM cualquier servicio interno con un `/v1/messages`.
  assert.equal(esUrlDeModelo('https://mattermost.ecsas.com.ar/api/v4/messages'), false)
  assert.equal(esUrlDeModelo('no es una url'), false)
})

test('MEDIDOR · un host alternativo configurado por entorno también se cuenta', () => {
  const previo = process.env.ORQ_IA_ALT_BASE_URL
  process.env.ORQ_IA_ALT_BASE_URL = 'https://modelo-alternativo.example.com/v1'
  try {
    assert.ok(hostsDeModelo().includes('modelo-alternativo.example.com'))
    assert.equal(esUrlDeModelo('https://modelo-alternativo.example.com/v1/chat'), true,
      'cambiar de host no puede apagar el contador en silencio')
  } finally {
    if (previo === undefined) delete process.env.ORQ_IA_ALT_BASE_URL
    else process.env.ORQ_IA_ALT_BASE_URL = previo
  }
})

// ═══ EL CRUCE: DECLARAR DE MENOS NO SIRVE DE NADA ═══

test('CONCILIACIÓN · una llamada que salió y nadie declaró se publica como no declarada', () => {
  const c = conciliarLLM({ declaradas: 0, medidas: 2 })
  assert.equal(c.noDeclaradas, 2)
  assert.equal(c.total, 2, 'el total informado es el mayor: un contador de gasto sólo se equivoca para arriba')
  assert.equal(c.cuadra, false)
  assert.match(c.porQue, /NADIE declaró/)
})

test('CONCILIACIÓN · declarar de más tampoco se esconde, pero no baja el total', () => {
  const c = conciliarLLM({ declaradas: 3, medidas: 1 })
  assert.equal(c.noDeclaradas, 0)
  assert.equal(c.total, 3)
  assert.equal(c.cuadra, false)
})

test('CONCILIACIÓN · cero y cero cuadra, y lo dice', () => {
  const c = conciliarLLM({ declaradas: 0, medidas: 0 })
  assert.equal(c.cuadra, true)
  assert.equal(c.total, 0)
})
