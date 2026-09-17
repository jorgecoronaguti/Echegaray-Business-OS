import test from 'node:test'
import assert from 'node:assert/strict'
import { leerPaginado, type PedirPagina } from './paginar.ts'

/** Un PostgREST falso con el corte real: nunca devuelve más de 1.000 filas por pedido. */
const servidor = (total: number, fallaEn: number | null = null): { pedir: PedirPagina; pedidos: number[] } => {
  const pedidos: number[] = []
  return {
    pedidos,
    pedir: async (desde, hasta) => {
      pedidos.push(desde)
      if (fallaEn != null && desde >= fallaEn) return { data: null, error: new Error('timeout') }
      const fin = Math.min(hasta + 1, desde + 1000, total)
      return { data: Array.from({ length: Math.max(0, fin - desde) }, (_, i) => desde + i), error: null }
    },
  }
}

test('D6 · con más de 1.000 filas se leen todas, no las primeras 1.000', async () => {
  const s = servidor(2350)
  const filas = await leerPaginado(s.pedir)
  assert.equal(filas?.length, 2350)
  assert.deepEqual(s.pedidos, [0, 1000, 2000])
})

test('D6 · justo 1.000 filas pide una página más para saber que terminó', async () => {
  const s = servidor(1000)
  assert.equal((await leerPaginado(s.pedir))?.length, 1000)
  assert.deepEqual(s.pedidos, [0, 1000])
})

test('D6 · si falla una página, null: no se publica un total a medias', async () => {
  assert.equal(await leerPaginado(servidor(2350, 1000).pedir), null)
})
