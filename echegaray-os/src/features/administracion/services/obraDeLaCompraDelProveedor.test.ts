// EL DEFECTO QUE ATRAPA: que la ficha del proveedor vuelva a decir que la obra de una compra es
// «Quattropani» —el texto que una persona escribió en la columna del Sheet— en vez de la obra que
// la BASE dice que pagó ese gasto.
//
// El dueño, 15/09/2026: «si hemos creado todo un circuito de id de obra sigue diciendo cualquier
// cosa». El circuito existe (`obra_canonica.codigo`, `OB-0008`) y la asignación existe
// (`compra_obra_asignada`, que escribe `sync-compras.mjs`): lo que faltaba era que esta pantalla las
// leyera. Dos clientes pueden escribir «Mamposteria» en la columna y ninguna de las dos cadenas
// identifica una obra; `OB-0023 · SF - MAMPOSTERÍA` sí.
//
// LOS TRES ESTADOS SE PRUEBAN SEPARADOS porque confundirlos es el otro defecto:
//   · con asignación   → rótulo canónico, y el texto del papel deja de ser la identidad.
//   · sin asignación   → se conserva el texto del papel, NUNCA se inventa una obra.
//   · lectura caída    → todas sin rótulo, y la pantalla sigue mostrando lo que sabe. Una guarda que
//                        falla cerrada acá pintaría de rojo una ficha entera por un timeout.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getComprasConPapel } from './comprobantesProveedorService.ts'

const PROVEEDOR = '11111111-1111-1111-1111-111111111111'

interface Resp { data: unknown[] | null; error: { message: string } | null }
interface Consulta extends PromiseLike<Resp> {
  eq: () => Consulta
  in: () => Consulta
  order: () => Consulta
  limit: () => Consulta
}

const compra = (fila: number, obra_texto: string | null) => ({
  proveedor_id: PROVEEDOR, via: 'cuit', fila, clave: `c:1|${fila}`, fecha: '2026-09-01',
  tipo: 'FA', comprobante: `0001-0000${fila}`, concepto: 'Cemento', obra_texto,
  total: 100, estado: null, estado_pago: null, saldo_pendiente: null, anulada: false,
})

/** PostgREST de mentira. La clave es `tabla` o `tabla|columnas` cuando la misma tabla se pide dos
 *  veces con `select` distintos — `obra_canonica` se lee para el nombre y para el código. */
function fake(respuestas: Record<string, Resp>) {
  const consulta = (r: Resp): Consulta => {
    const c: Consulta = {
      eq: () => c, in: () => c, order: () => c, limit: () => c,
      then: (ok, err) => Promise.resolve(r).then(ok, err),
    }
    return c
  }
  return {
    from: (tabla: string) => ({
      select: (cols: string) =>
        consulta(respuestas[`${tabla}|${cols}`] ?? respuestas[tabla] ?? { data: [], error: null }),
    }),
  } as unknown as SupabaseClient
}

const OK = { data: [], error: null }
const base = (extra: Record<string, Resp>) => fake({
  proveedor_compra: { data: [compra(7, 'Quattropani'), compra(9, 'Mamposteria')], error: null },
  compra_adjunto: OK,
  'obra_canonica|id, nombre': { data: [{ id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL' }], error: null },
  'obra_canonica|id, codigo': { data: [{ id: 'quattropani', codigo: 'OB-0008' }], error: null },
  ...extra,
})

test('la obra de la compra sale de compra_obra_asignada y se rotula «OB-0008 · NOMBRE»', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: [{ fila: 7, obra_id: 'quattropani' }], error: null },
  }), PROVEEDOR)
  assert.equal(r.error, null)
  const filas = r.data!.filas
  assert.equal(filas.find((f) => f.fila === 7)!.obra_rotulo, 'OB-0008 · QP - SALÓN COMERCIAL')
  // El texto del papel NO desaparece del modelo: la fila lo sigue teniendo para el `title`. Lo que
  // cambia es quién manda cuando los dos existen.
  assert.equal(filas.find((f) => f.fila === 7)!.obra_texto, 'Quattropani')
})

test('una compra sin asignación NO inventa obra: se queda sin rótulo', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: [{ fila: 7, obra_id: 'quattropani' }, { fila: 9, obra_id: null }], error: null },
  }), PROVEEDOR)
  assert.equal(r.data!.filas.find((f) => f.fila === 9)!.obra_rotulo, null)
})

test('si la asignación no se puede leer, ninguna fila afirma una obra y la ficha igual se dibuja', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: null, error: { message: 'timeout' } },
  }), PROVEEDOR)
  assert.equal(r.error, null)
  assert.deepEqual(r.data!.filas.map((f) => f.obra_rotulo), [null, null])
})

test('sin el código de obra el rótulo es el nombre solo, nunca el id interno', async () => {
  const r = await getComprasConPapel(fake({
    proveedor_compra: { data: [compra(7, 'Quattropani')], error: null },
    compra_adjunto: OK,
    compra_obra_asignada: { data: [{ fila: 7, obra_id: 'quattropani' }], error: null },
    'obra_canonica|id, nombre': { data: [{ id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL' }], error: null },
    // La migración del código todavía no aplicada.
    'obra_canonica|id, codigo': { data: [], error: null },
  }), PROVEEDOR)
  assert.equal(r.data!.filas[0].obra_rotulo, 'QP - SALÓN COMERCIAL')
})
