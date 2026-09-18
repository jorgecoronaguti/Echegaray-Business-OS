import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ahoraDeLaBase, cuentaParaSuperponer, leerLoDecididoEnLaApp, mismoConjunto, repartir, superponerLoDecidido,
} from './compras-superposicion.mjs'
import { aplicarCambiosPendientes } from './obra-destino.mjs'

const DESDE = '2026-09-18T12:00:00.000Z'
const antes = '2026-09-18T11:59:59.000Z'
const despues = '2026-09-18T12:00:01.000Z'

test('un pago en vuelo NO pisa la obra de la fila (defecto 18/09: `valor_nuevo` de un pago es la acción, no una obra)', () => {
  const compras = [{ fila: 981, clave: 'p:neumagom|0002-00004213', obra_celda: 'ES-TAL · Estructura – Taller' }]
  const pago = {
    id: 'p1', fila: 981, clave: 'p:neumagom|0002-00004213', tipo: 'pago', estado: 'pendiente',
    valor_nuevo: 'total', celdas: [], creado_at: despues,
  }
  // La función pura de siempre, con el mismo cambio que le llegaba: tiene que ignorarlo.
  const directo = aplicarCambiosPendientes(compras, [pago])
  assert.equal(directo[0].obra_celda, 'ES-TAL · Estructura – Taller', 'aplicarCambiosPendientes escribió «total» en la obra')
  // Y el reparto nuevo ni siquiera se lo entrega.
  const r = repartir([pago], DESDE)
  assert.equal(r.obras.length, 0)
  assert.equal(r.pagos.length, 1)
})

test('qué cuenta: pendiente y procesando siempre; aplicado sólo si se aplicó después de que el sync empezó a leer', () => {
  assert.equal(cuentaParaSuperponer({ estado: 'pendiente' }, DESDE), true)
  assert.equal(cuentaParaSuperponer({ estado: 'procesando' }, DESDE), true)
  assert.equal(cuentaParaSuperponer({ estado: 'aplicado', aplicado_at: despues }, DESDE), true, 'el worker escribió mientras el sync leía')
  assert.equal(cuentaParaSuperponer({ estado: 'aplicado', aplicado_at: DESDE }, DESDE), true, 'el mismo instante cuenta')
  assert.equal(cuentaParaSuperponer({ estado: 'aplicado', aplicado_at: antes }, DESDE), false, 'ya estaba en la lectura')
  assert.equal(cuentaParaSuperponer({ estado: 'aplicado', aplicado_at: null }, DESDE), false, 'sin fecha no se afirma')
  assert.equal(cuentaParaSuperponer({ estado: 'rechazado' }, DESDE), false, 'el Sheet lo contradijo: manda el Sheet')
  assert.equal(cuentaParaSuperponer({ estado: 'error' }, DESDE), false)
})

test('un cambio aplicado durante la lectura del Sheet se superpone igual (antes se perdía hasta el sync siguiente)', () => {
  const compras = [{ fila: 889, clave: 'c:1|A', obra_celda: 'Sin obra – LA ESTRELLA' }]
  // `valor_anterior` es lo que la pantalla vio, y es lo que el Sheet todavía dice: se superpone.
  const cambio = { id: 'c1', fila: 889, clave: 'c:1|A', tipo: 'obra', estado: 'aplicado', valor_anterior: 'Sin obra – LA ESTRELLA', valor_nuevo: 'OB-0007 · LE - GALPÓN 9', creado_at: antes, aplicado_at: despues }
  const r = superponerLoDecidido(compras, repartir([cambio], DESDE))
  assert.equal(r.compras[0].obra_celda, 'OB-0007 · LE - GALPÓN 9')
  assert.equal(r.obras, 1)
  // El mismo cambio, aplicado antes de la lectura: el Sheet ya lo trae y no se toca lo leído.
  const viejo = superponerLoDecidido(compras, repartir([{ ...cambio, aplicado_at: antes }], DESDE))
  assert.equal(viejo.compras[0].obra_celda, 'Sin obra – LA ESTRELLA')
})

test('los dos cambios de obra de una fila viajan LOS DOS y en orden; las filas sin `tipo` (anteriores a la migración) son de obra', () => {
  const r = repartir([
    { id: 'a', fila: 10, estado: 'pendiente', valor_anterior: null, valor_nuevo: 'OB-0001 · x', creado_at: antes },
    { id: 'b', fila: 10, estado: 'pendiente', valor_anterior: 'OB-0001 · x', valor_nuevo: 'OB-0002 · y', creado_at: despues },
    { id: 'c', fila: 11, estado: 'pendiente', valor_anterior: null, valor_nuevo: 'OB-0003 · z', creado_at: antes, tipo: null },
  ], DESDE)
  // Quedarse con el último (lo que hacía hasta el 18/09) descartaba `a`, y `b` espera lo que dejó `a`:
  // el espejo terminaba SIN OBRA después de dos clics. La cadena entera llega y la pliega `obra-destino`.
  assert.deepEqual(r.obras.map((c) => c.id), ['a', 'b', 'c'])
  assert.deepEqual(r.obras.map((c) => [c.fila, c.valor_nuevo]),
    [[10, 'OB-0001 · x'], [10, 'OB-0002 · y'], [11, 'OB-0003 · z']])
  assert.deepEqual(r.ids, ['a', 'b', 'c'])
})

test('la cadena de dos clics llega hasta el espejo: superponerLoDecidido la pliega y cuenta UNA fila movida', () => {
  const compras = [{ fila: 10, clave: 'c:1|A', obra_celda: null }]
  const cambios = [
    { id: 'a', fila: 10, clave: 'c:1|A', tipo: 'obra', estado: 'pendiente', valor_anterior: null, valor_nuevo: 'OB-0001 · x', creado_at: antes },
    { id: 'b', fila: 10, clave: 'c:1|A', tipo: 'obra', estado: 'pendiente', valor_anterior: 'OB-0001 · x', valor_nuevo: 'OB-0002 · y', creado_at: despues },
  ]
  const r = superponerLoDecidido(compras, repartir(cambios, DESDE))
  assert.equal(r.compras[0].obra_celda, 'OB-0002 · y')
  assert.equal(r.obras, 1, 'dos pedidos sobre la misma fila son UNA fila movida, y el log dice filas')
})

// ═══ EL ORDEN NO ES COSMÉTICA ═══
//
// Los dos plegados —obras y pagos— sólo son correctos si los pedidos llegan en orden de creación, y lo
// único que lo garantiza es el `order by creado_at` de la consulta. Sin esta red, sacarlo o cambiarlo
// por `creado_at desc` compilaría, pasaría todos los demás tests y rompería las dos cadenas en silencio.

test('la consulta ordena por `creado_at` ascendente: de eso depende que las dos cadenas se plieguen bien', async () => {
  let sql = ''
  await leerLoDecididoEnLaApp(async (q) => { sql = q; return { rows: [] } }, { desde: DESDE })
  assert.match(sql, /order by creado_at\s*$/, 'sin este orden, plegar una cadena da otro resultado')
  assert.doesNotMatch(sql, /order by creado_at desc/)
})

test('repartir NO reordena: entrega los pedidos como se los dieron, en los dos lados', () => {
  const cambios = [
    { id: '1', fila: 7, tipo: 'pago', estado: 'pendiente', creado_at: antes },
    { id: '2', fila: 7, tipo: 'obra', estado: 'pendiente', creado_at: antes },
    { id: '3', fila: 7, tipo: 'pago', estado: 'pendiente', creado_at: despues },
    { id: '4', fila: 7, tipo: 'obra', estado: 'pendiente', creado_at: despues },
  ]
  const r = repartir(cambios, DESDE)
  assert.deepEqual(r.pagos.map((c) => c.id), ['1', '3'])
  assert.deepEqual(r.obras.map((c) => c.id), ['2', '4'])
})

test('la lectura pide a la base sólo la pestaña Compras, lo pendiente y lo aplicado desde `desde`, y reparte', async () => {
  const pedidos = []
  const q = async (sql, params) => {
    pedidos.push({ sql, params })
    return { rows: [
      { id: 'o1', fila: 5, clave: 'c:1|A', tipo: 'obra', estado: 'pendiente', valor_nuevo: 'OB-0001 · a', creado_at: antes },
      { id: 'p1', fila: 6, clave: 'c:2|B', tipo: 'pago', estado: 'aplicado', valor_nuevo: 'total', celdas: [], creado_at: antes, aplicado_at: despues },
      { id: 'p0', fila: 7, clave: 'c:3|C', tipo: 'pago', estado: 'aplicado', valor_nuevo: 'total', celdas: [], creado_at: antes, aplicado_at: antes },
    ] }
  }
  const r = await leerLoDecididoEnLaApp(q, { desde: DESDE })
  assert.equal(pedidos.length, 1)
  assert.match(pedidos[0].sql, /'pestana', 'Compras'\) = 'Compras'/)
  assert.match(pedidos[0].sql, /estado in \('pendiente', 'procesando'\) or \(estado = 'aplicado' and aplicado_at >= \$1/)
  // `valor_anterior` VIAJA: sin él, `aplicarCambiosPendientes` no puede saber si el Sheet cambió desde
  // el pedido y superpondría encima de lo que el dueño escribió después.
  assert.match(pedidos[0].sql, /valor_anterior, valor_nuevo/)
  assert.deepEqual(pedidos[0].params, [DESDE])
  assert.deepEqual(r.obras.map((c) => c.id), ['o1'])
  assert.deepEqual(r.pagos.map((c) => c.id), ['p1'], 'el pago aplicado antes de la lectura no cuenta aunque la base lo devuelva')
  assert.deepEqual(r.ids, ['o1', 'p1'])
})

test('mismoConjunto: la segunda vuelta del sync sólo reescribe si apareció un cambio nuevo', () => {
  assert.equal(mismoConjunto(['a', 'b'], ['a', 'b']), true)
  assert.equal(mismoConjunto(['a'], ['a', 'b']), false)
  assert.equal(mismoConjunto([], []), true)
})

// ═══ EL RELOJ (18/09/2026) ═══
//
// `desde` se compara contra `aplicado_at`, que lo escribe Postgres con `now()`. Del reloj de la VM, un
// adelanto mayor que lo que tarda la lectura de Google dejaría afuera un cambio que sí ocurrió durante
// la corrida: justo el agujero que la segunda vuelta existe para tapar.

test('el «desde» sale del reloj de la BASE, no del de la VM', async () => {
  const dicho = []
  const q = async (sql) => { dicho.push(sql); return { rows: [{ t: '2026-09-18T12:00:00.000Z' }] } }
  const t = await ahoraDeLaBase(q)
  assert.deepEqual(dicho, ['select now() as t'])
  assert.equal(t.toISOString(), '2026-09-18T12:00:00.000Z')
})

test('si la base no dice qué hora es, se corta: un «desde» inventado deja pasar el pisotón en silencio', async () => {
  await assert.rejects(() => ahoraDeLaBase(async () => ({ rows: [] })), /qué hora es/)
  await assert.rejects(() => ahoraDeLaBase(async () => ({ rows: [{ t: null }] })), /qué hora es/)
})

test('el sync toma el «desde» de la base antes de leer el Sheet, y no de `new Date()`', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../scripts/sync-compras.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.match(src, /const desde = await ahoraDeLaBase\(query\)\s*\n\s*const leidas = await leerPestana\(\)/)
  assert.doesNotMatch(src, /const desde = new Date\(\)/)
})
