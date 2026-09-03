// EL CLIENTE DEL JOB — lo que se puede probar sin navegador: qué archivo se rechaza y por qué.

import test from 'node:test'
import assert from 'node:assert/strict'
import { archivoValido, tamanoLegible } from './trabajoCotizarApi.ts'

test('tamanoLegible: bytes en KB, y pasa a MB arriba del megabyte', () => {
  assert.equal(tamanoLegible(2048), '2 KB')
  assert.equal(tamanoLegible(3 * 1024 * 1024), '3.0 MB')
})

test('archivoValido: un PDF de tamaño normal pasa', () => {
  assert.equal(archivoValido({ name: 'B-01.pdf', size: 500_000 }, 0), null)
})

test('archivoValido: rechaza extensión no soportada CON MOTIVO, no en silencio', () => {
  const motivo = archivoValido({ name: 'nota.zip', size: 1000 }, 0)
  assert.match(motivo ?? '', /formato no soportado/)
})

test('archivoValido: rechaza un archivo que pesa más del tope y dice cuánto pesa', () => {
  const motivo = archivoValido({ name: 'plano.dwg', size: 30 * 1024 * 1024 }, 0)
  assert.match(motivo ?? '', /pesa 30\.0 MB/)
})

test('archivoValido: el tope de archivos por trabajo se respeta', () => {
  const motivo = archivoValido({ name: 'otro.pdf', size: 1000 }, 12)
  assert.match(motivo ?? '', /ya hay 12 archivos/)
})

// ═══ CANCELAR — el único camino por el que la pantalla puede FRENAR una corrida que se paga ═════
//
// Se stubbea `fetch` porque lo que se prueba es el CONTRATO con la ruta (método, cuerpo, y qué pasa
// con cada respuesta), no la red. El defecto que atrapan: que cancelar mande cualquier cosa, o que
// un rechazo del servidor se lea en la pantalla como una cancelación exitosa.

import { cancelarLectura } from './trabajoCotizarApi.ts'

type Pedido = { url: string; init: RequestInit | undefined }

function conFetch(respuesta: { ok: boolean; status: number; cuerpo: unknown }, corrida: (p: Pedido[]) => Promise<void>) {
  const pedidos: Pedido[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    pedidos.push({ url: String(url), init })
    return { ok: respuesta.ok, status: respuesta.status, json: async () => respuesta.cuerpo } as Response
  }) as typeof fetch
  return corrida(pedidos).finally(() => { globalThis.fetch = original })
}

test('cancelarLectura: POST al trabajo con la acción explícita, y devuelve la fila ya cancelada', async () => {
  await conFetch({ ok: true, status: 200, cuerpo: { id: 'lec-1', estado: 'CANCELADO', etapa: null } }, async (pedidos) => {
    const t = await cancelarLectura('lec-1')
    assert.equal(pedidos[0].url, '/api/presupuestos/cotizar/lec-1')
    assert.equal(pedidos[0].init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(pedidos[0].init?.body)), { accion: 'cancelar' })
    assert.equal(t.estado, 'CANCELADO')
    assert.deepEqual(t.pasos, [], 'lo que el servidor no manda queda en su default, no se inventa')
  })
})

test('cancelarLectura: si el trabajo ya había terminado, TIRA con el motivo — nunca finge que frenó', async () => {
  await conFetch({ ok: false, status: 409, cuerpo: { error: 'el trabajo ya había terminado (LISTO)' } }, async () => {
    await assert.rejects(() => cancelarLectura('lec-2'), /ya había terminado \(LISTO\)/)
  })
})

test('cancelarLectura: un fallo sin cuerpo legible tampoco pasa por éxito', async () => {
  await conFetch({ ok: false, status: 500, cuerpo: null }, async () => {
    await assert.rejects(() => cancelarLectura('lec-3'), /500/)
  })
})
