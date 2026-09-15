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
// LOS ESTADOS SE PRUEBAN SEPARADOS porque confundirlos es el otro defecto:
//   · columna Obra puesta → manda la celda (`obra_celda` / `obra_id` + `destino` de `proveedor_compra`,
//                           migración 20260915T2300), aunque `compra_obra_asignada` diga otra cosa o no
//                           diga nada. Es el caso de Corralón Progreso medido el 15/09/2026: 40 de 226
//                           filas (notas de crédito y ene–abr/26) con la celda puesta y sin asignación
//                           mostraban el texto viejo sin código.
//   · con asignación      → rótulo canónico marcado como inferido; el texto del papel no es la identidad.
//   · sin asignación      → se conserva el texto del papel, NUNCA se inventa una obra.
//   · lectura caída       → todas sin rótulo, y la pantalla sigue mostrando lo que sabe. Una guarda
//                           que falla cerrada acá pintaría de rojo una ficha entera por un timeout.
//   · columna Obra ilegible → `obraEditable: false` y la obra inferida se sigue viendo por la fila.
//
// La asignación se une por `referencia` (`coalesce(sheet_id, fila)`), la MISMA cuenta que Compras y
// que el sync; antes esta ficha la unía por `fila`, una segunda regla.

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
const OBRA = 'fila, clave, sheet_id, destino, obra_id, obra_celda, obra_inconsistencia'
const celda = (fila: number, sheet_id: number | null, destino: string | null, obra_id: string | null, obra_celda: string | null) =>
  ({ fila, clave: `c:1|${fila}`, sheet_id, destino, obra_id, obra_celda, obra_inconsistencia: null })

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

test('la obra inferida sale de compra_obra_asignada por referencia y se rotula «OB-0008 · NOMBRE» como inferida', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: [{ referencia: '7', fila: 7, obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'QUATTROPANI', porque: 'columna K' }], error: null },
  }), PROVEEDOR)
  assert.equal(r.error, null)
  const filas = r.data!.filas
  const f7 = filas.find((f) => f.fila === 7)!
  assert.equal(f7.obra_rotulo, 'OB-0008 · QP - SALÓN COMERCIAL')
  assert.equal(f7.obra.origen, 'inferida')
  assert.equal(f7.obra.celda, null)
  // El texto del papel NO desaparece del modelo: la fila lo sigue teniendo para el `title`. Lo que
  // cambia es quién manda cuando los dos existen.
  assert.equal(f7.obra_texto, 'Quattropani')
  assert.equal(r.data!.obraEditable, true)
})

test('la columna Obra de la fila MANDA sobre la asignación, y vale aunque no haya asignación (Corralón Progreso)', async () => {
  const r = await getComprasConPapel(base({
    [`proveedor_compra|${OBRA}`]: {
      data: [
        // Nota de crédito: celda con obra, sin fila en compra_obra_asignada (no es costo de obra).
        celda(7, 700, 'obra', 'quattropani', 'OB-0008 · QP - SALÓN COMERCIAL'),
        // Estructura elegida en la fila: la asignación vieja decía otra obra.
        celda(9, 900, 'estructura_admin', null, 'ES-ADM · Estructura – Administración'),
      ],
      error: null,
    },
    compra_obra_asignada: { data: [{ referencia: '900', fila: 9, obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'QUATTROPANI', porque: 'columna K' }], error: null },
  }), PROVEEDOR)
  const f7 = r.data!.filas.find((f) => f.fila === 7)!
  assert.equal(f7.obra_rotulo, 'OB-0008 · QP - SALÓN COMERCIAL', 'la celda con obra_id no se rotuló: el texto viejo sin código')
  assert.equal(f7.obra.origen, 'columna')
  assert.equal(f7.obra.celda, 'OB-0008 · QP - SALÓN COMERCIAL')
  const f9 = r.data!.filas.find((f) => f.fila === 9)!
  assert.equal(f9.obra_rotulo, 'ES-ADM · Estructura – Administración', 'la asignación inferida pisó la decisión de la fila')
  assert.equal(f9.obra.origen, 'columna')
})

test('«Sin obra – X» elegido en la fila es una imputación con nombre, no «sin obra imputada»', async () => {
  const r = await getComprasConPapel(base({
    [`proveedor_compra|${OBRA}`]: { data: [celda(9, 900, 'obra', null, 'Sin obra – SAN FRANCISCO')], error: null },
  }), PROVEEDOR)
  const f9 = r.data!.filas.find((f) => f.fila === 9)!
  assert.equal(f9.obra_rotulo, 'Sin obra – SAN FRANCISCO')
  assert.equal(f9.obra.origen, 'columna')
})

test('una compra sin celda ni asignación NO inventa obra: se queda sin rótulo', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: [{ referencia: '7', fila: 7, obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'Q', porque: null }, { referencia: '9', fila: 9, obra_id: null, via: 'sin_obra', cliente: 'Q', porque: null }], error: null },
  }), PROVEEDOR)
  const f9 = r.data!.filas.find((f) => f.fila === 9)!
  assert.equal(f9.obra_rotulo, null)
  assert.equal(f9.obra.origen, 'sin_obra')
})

test('si la columna Obra no se puede leer (migración sin aplicar), no se edita y la inferida se sigue viendo por fila', async () => {
  const r = await getComprasConPapel(base({
    [`proveedor_compra|${OBRA}`]: { data: null, error: { message: 'column proveedor_compra.obra_celda does not exist' } },
    // Sin la columna no se conoce sheet_id: la referencia real (700) no sirve; se une por fila.
    compra_obra_asignada: { data: [{ referencia: '700', fila: 7, obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'Q', porque: null }], error: null },
  }), PROVEEDOR)
  assert.equal(r.error, null)
  assert.equal(r.data!.obraEditable, false)
  assert.equal(r.data!.filas.find((f) => f.fila === 7)!.obra_rotulo, 'OB-0008 · QP - SALÓN COMERCIAL')
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
    compra_obra_asignada: { data: [{ referencia: '7', fila: 7, obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'Q', porque: null }], error: null },
    'obra_canonica|id, nombre': { data: [{ id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL' }], error: null },
    // La migración del código todavía no aplicada.
    'obra_canonica|id, codigo': { data: [], error: null },
  }), PROVEEDOR)
  assert.equal(r.data!.filas[0].obra_rotulo, 'QP - SALÓN COMERCIAL')
})
