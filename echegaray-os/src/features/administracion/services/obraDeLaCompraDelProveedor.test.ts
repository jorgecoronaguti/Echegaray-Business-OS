// EL DEFECTO QUE ATRAPA: que la ficha del proveedor diga una obra y la pantalla de Compras diga otra
// sobre LA MISMA FILA.
//
// El dueño, 15/09/2026: «si hemos creado todo un circuito de id de obra sigue diciendo cualquier
// cosa», y «compras imputadas al centavo a cada obra en app.ecsas.com.ar y también en Proveedores».
//
// Hay DOS fuentes para la obra de una compra y no dicen lo mismo:
//   · `compra_sheet.obra_celda`   → la obra que una persona ELIGIÓ en la columna «Obra». Manda.
//   · `compra_obra_asignada`      → la que el sync INFIRIÓ de las columnas J y K.
// La ficha leía sólo la segunda mientras Compras mostraba la primera: medido el 15/09, 40 de las 226
// filas de Corralón Progreso mostraban obras distintas en dos pantallas del mismo sistema. Las dos
// pasan ahora por `obraDeLaCompra`, que es la única definición de ese orden.
//
// LOS ESTADOS SE PRUEBAN SEPARADOS porque confundirlos es el otro defecto:
//   · celda elegida    → esa obra, marcada como decidida.
//   · sólo inferencia  → la obra del sync, marcada COMO inferida.
//   · ninguna de las dos → sin rótulo. NUNCA se inventa una obra con el texto del papel.
//   · lectura caída    → sin rótulo y la pantalla sigue mostrando lo que sabe. Una guarda que falla
//                        cerrada acá pintaría de rojo una ficha entera por un timeout.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COLUMNAS_BASE, COLUMNAS_OBRA, getComprasConPapel } from './comprobantesProveedorService.ts'

const PROVEEDOR = '11111111-1111-1111-1111-111111111111'

interface Resp { data: unknown[] | null; error: { message: string } | null }
interface Consulta extends PromiseLike<Resp> {
  eq: () => Consulta
  in: () => Consulta
  order: () => Consulta
  limit: () => Consulta
}

const compra = (fila: number, obra_texto: string | null, celda: Partial<Record<string, unknown>> = {}) => ({
  proveedor_id: PROVEEDOR, via: 'cuit', fila, clave: `c:1|${fila}`, fecha: '2026-09-01',
  tipo: 'FA', comprobante: `0001-0000${fila}`, concepto: 'Cemento', obra_texto,
  total: 100, estado: null, estado_pago: null, saldo_pendiente: null, anulada: false,
  destino: null, obra_id: null, obra_celda: null, obra_inconsistencia: null, ...celda,
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
const CON_OBRA = [...COLUMNAS_BASE, ...COLUMNAS_OBRA].join(', ')
const SOLO_BASE = COLUMNAS_BASE.join(', ')

const base = (extra: Record<string, Resp>) => fake({
  proveedor_compra: { data: [compra(7, 'Quattropani'), compra(9, 'Mamposteria')], error: null },
  compra_adjunto: OK,
  'obra_canonica|id, nombre': {
    data: [{ id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL' }, { id: 'sf-mamposteria', nombre: 'SF - MAMPOSTERÍA' }],
    error: null,
  },
  'obra_canonica|id, codigo': {
    data: [{ id: 'quattropani', codigo: 'OB-0008' }, { id: 'sf-mamposteria', codigo: 'OB-0023' }],
    error: null,
  },
  ...extra,
})

test('la obra de la compra sale de compra_obra_asignada y se rotula «OB-0008 · NOMBRE»', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: [{ fila: 7, referencia: '7', obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'QUATTROPANI', porque: 'columna K' }], error: null },
  }), PROVEEDOR)
  assert.equal(r.error, null)
  const filas = r.data!.filas
  const siete = filas.find((f) => f.fila === 7)!
  assert.equal(siete.obra.rotulo, 'OB-0008 · QP - SALÓN COMERCIAL')
  // Y SE DICE QUE ES INFERIDA: una obra adivinada dibujada igual que una decidida es la confusión
  // que la columna «Obra» vino a sacar.
  assert.equal(siete.obra.origen, 'inferida')
  // El texto del papel NO desaparece del modelo: la fila lo sigue teniendo para el `title`. Lo que
  // cambia es quién manda cuando los dos existen.
  assert.equal(siete.obra_texto, 'Quattropani')
})

test('la celda «Obra» de la fila le GANA a la inferencia del sync, y se marca como decidida', async () => {
  // ═══ EL DEFECTO QUE ATRAPA, y es el que reportó el dueño ═══
  //
  // La fila 9 dice «Mamposteria» en el papel y el sync infirió Quattropani. Alguien ya eligió
  // OB-0023 en la columna «Obra». Si la ficha sigue leyendo sólo la asignación, muestra Quattropani
  // mientras Compras muestra OB-0023: la misma factura imputada a dos obras según qué pantalla se
  // mire, y ninguna de las dos avisa.
  const r = await getComprasConPapel(fake({
    [`proveedor_compra|${CON_OBRA}`]: {
      data: [compra(9, 'Mamposteria', { destino: 'obra', obra_id: 'sf-mamposteria', obra_celda: 'OB-0023 · SF - MAMPOSTERÍA' })],
      error: null,
    },
    compra_adjunto: OK,
    compra_obra_asignada: { data: [{ fila: 9, referencia: '9', obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'QUATTROPANI', porque: 'columna K «Mamposteria»' }], error: null },
    'obra_canonica|id, nombre': { data: [{ id: 'sf-mamposteria', nombre: 'SF - MAMPOSTERÍA' }, { id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL' }], error: null },
    'obra_canonica|id, codigo': { data: [{ id: 'sf-mamposteria', codigo: 'OB-0023' }, { id: 'quattropani', codigo: 'OB-0008' }], error: null },
  }), PROVEEDOR)
  const nueve = r.data!.filas[0]
  assert.equal(nueve.obra.rotulo, 'OB-0023 · SF - MAMPOSTERÍA', 'la ficha volvió a mostrar la obra inferida por encima de la elegida')
  assert.equal(nueve.obra.origen, 'columna')
  // Y la celda viaja tal cual: es el `esperado` del control optimista de la base.
  assert.equal(nueve.obra.celda, 'OB-0023 · SF - MAMPOSTERÍA')
  assert.equal(r.data!.obraEditable, true)
})

test('una compra sin asignación NO inventa obra: se queda sin rótulo', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: [{ fila: 7, referencia: '7', obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'Q', porque: null }, { fila: 9, referencia: '9', obra_id: null, via: 'sin_obra', cliente: 'Q', porque: null }], error: null },
  }), PROVEEDOR)
  const nueve = r.data!.filas.find((f) => f.fila === 9)!
  assert.equal(nueve.obra.rotulo, null)
  assert.equal(nueve.obra.origen, 'sin_obra')
})

test('si la asignación no se puede leer, ninguna fila afirma una obra y la ficha igual se dibuja', async () => {
  const r = await getComprasConPapel(base({
    compra_obra_asignada: { data: null, error: { message: 'timeout' } },
  }), PROVEEDOR)
  assert.equal(r.error, null)
  assert.deepEqual(r.data!.filas.map((f) => f.obra.rotulo), [null, null])
})

test('sin el código de obra el rótulo es el nombre solo, nunca el id interno', async () => {
  const r = await getComprasConPapel(fake({
    proveedor_compra: { data: [compra(7, 'Quattropani')], error: null },
    compra_adjunto: OK,
    compra_obra_asignada: { data: [{ fila: 7, referencia: '7', obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'Q', porque: null }], error: null },
    'obra_canonica|id, nombre': { data: [{ id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL' }], error: null },
    // La migración del código todavía no aplicada.
    'obra_canonica|id, codigo': { data: [], error: null },
  }), PROVEEDOR)
  assert.equal(r.data!.filas[0].obra.rotulo, 'QP - SALÓN COMERCIAL')
})

test('si la vista todavía no publica la columna «Obra», la ficha se dibuja igual y no se puede editar', async () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // La migración 20260915T2300 se aplica a mano y no viaja con el deploy. PostgREST NO ignora una
  // columna que no existe: devuelve error y, sin este respaldo, un deploy adelantado dejaría la
  // solapa entera en «no pude leer las compras de este proveedor».
  const r = await getComprasConPapel(fake({
    [`proveedor_compra|${CON_OBRA}`]: { data: null, error: { message: 'column proveedor_compra.obra_celda does not exist' } },
    [`proveedor_compra|${SOLO_BASE}`]: { data: [compra(7, 'Quattropani')], error: null },
    compra_adjunto: OK,
    compra_obra_asignada: { data: [{ fila: 7, referencia: '7', obra_id: 'quattropani', via: 'obra_por_alias', cliente: 'Q', porque: null }], error: null },
    'obra_canonica|id, nombre': { data: [{ id: 'quattropani', nombre: 'QP - SALÓN COMERCIAL' }], error: null },
    'obra_canonica|id, codigo': { data: [{ id: 'quattropani', codigo: 'OB-0008' }], error: null },
  }), PROVEEDOR)
  assert.equal(r.error, null, 'un deploy anterior a la migración deja la ficha del proveedor sin compras')
  assert.equal(r.data!.filas.length, 1)
  assert.equal(r.data!.obraEditable, false, 'se ofrece elegir obra contra una base que no la sabe guardar')
  // Y la inferencia se sigue viendo: lo que se pierde es poder CAMBIARLA, no saber qué obra es.
  assert.equal(r.data!.filas[0].obra.rotulo, 'OB-0008 · QP - SALÓN COMERCIAL')
})

test('las dos lecturas fallan: la ficha dice que no pudo leer, no que no hay compras', async () => {
  const r = await getComprasConPapel(fake({
    proveedor_compra: { data: null, error: { message: 'permission denied for view proveedor_compra' } },
    compra_adjunto: OK,
  }), PROVEEDOR)
  assert.equal(r.data, null)
  assert.match(r.error!, /permission denied/)
})
