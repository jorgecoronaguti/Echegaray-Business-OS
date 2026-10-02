// Tests de `_HABERES_PAGADOS_RAW` (lib/haberes-pagados.mjs + su generador). Herméticos: sin red, sin base,
// sin Google. Los datos son de mentira pero con la FORMA de lo que pasó el 02/10/2026 pagando la quincena:
// una marca en la quincena equivocada que se borra y se rehace en la buena, un efectivo que ya tenía carga
// previa a la web, y pruebas de $1 que se deshacen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarPagos, resumen, emparejarAnotacion, saleDe } from './haberes-pagados.mjs'
import { fila, grilla, modoAplicar, leerInsumos, COLUMNAS, COL } from '../scripts/haberes-pagados-raw-pestana.mjs'

const Q1 = 'q-0901', Q2 = 'q-0916'
const linea = (liq, persona, banco, efectivo, extra = {}) => ({
  liquidacion_id: liq, persona_id: persona, pagado_banco: banco, pagado_efectivo: efectivo,
  desde: liq === Q1 ? '2026-09-01' : '2026-09-16', hasta: liq === Q1 ? '2026-09-15' : '2026-09-30',
  grupo: 'obreros', persona: persona.toUpperCase(), ...extra,
})
let n = 0
const cambio = (liq, persona, columna, antes, despues, en, extra = {}) => ({
  id: ++n, liquidacion_id: liq, persona_id: persona, columna, tipo: 'cambio', antes, despues, autor: 'u1',
  en, fecha_cambio: en.slice(0, 10), ...extra,
})
const nombres = new Map([['u1', 'Rodrigo']])

test('banco: una marca por persona da una fila con la fecha del cambio, el autor y un id estable', () => {
  const { pagos } = armarPagos({
    lineas: [linea(Q2, 'ana', 250000, 0)],
    cambios: [cambio(Q2, 'ana', 'pagado_banco', null, 250000, '2026-10-02T16:40:00Z')], nombres,
  })
  assert.equal(pagos.length, 1)
  const p = pagos[0]
  assert.deepEqual([p.fecha, p.fechaSegun, p.medio, p.saleDe, p.importe, p.anoto, p.desde], ['2026-10-02', 'día del cambio', 'banco', 'banco', 250000, 'Rodrigo', '2026-09-16'])
  assert.match(p.id, /^lc:\d+$/)
})

test('efectivo con carga previa a la web: la fila es el DELTA, no el acumulado', () => {
  // El acumulado pasó de 122.200 (cargado antes) a 357.200: hoy salieron 235.000 del cajón.
  const { pagos } = armarPagos({
    lineas: [linea(Q2, 'beto', 0, 357200)],
    cambios: [
      { ...cambio(Q2, 'beto', 'pagado_efectivo', null, 122200, '2026-10-01T03:00:00Z'), tipo: 'base' },
      cambio(Q2, 'beto', 'pagado_efectivo', 122200, 357200, '2026-10-02T16:48:00Z'),
    ],
  })
  assert.deepEqual(pagos.map((p) => [p.medio, p.importe]), [['efectivo', 235000]])
})

test('la marca en la quincena equivocada que se borra NO deja fila; la buena sí', () => {
  const { pagos } = armarPagos({
    lineas: [linea(Q1, 'ana', 0, 0), linea(Q2, 'ana', 1391446.92, 0)],
    cambios: [
      cambio(Q1, 'ana', 'pagado_banco', null, 1391446.92, '2026-10-02T16:33:00Z'),
      cambio(Q1, 'ana', 'pagado_banco', 1391446.92, null, '2026-10-02T16:36:00Z'),
      cambio(Q2, 'ana', 'pagado_banco', null, 1391446.92, '2026-10-02T16:37:00Z'),
    ],
  })
  assert.deepEqual(pagos.map((p) => [p.desde, p.importe]), [['2026-09-16', 1391446.92]])
})

test('pago de $0, prueba de $1 deshecha, acumulado negativo y línea sin pagar: ninguno genera fila', () => {
  const { pagos, avisos } = armarPagos({
    lineas: [linea(Q2, 'cero', 0, 0), linea(Q2, 'uno', 0, 0), linea(Q2, 'neg', -500, 0), linea(Q2, 'nada', 0, 0)],
    cambios: [
      cambio(Q2, 'cero', 'pagado_banco', null, 0, '2026-10-02T16:00:00Z'),
      cambio(Q2, 'uno', 'pagado_efectivo', null, 1, '2026-10-02T16:28:00Z'),
      cambio(Q2, 'uno', 'pagado_efectivo', 1, 0, '2026-10-02T16:28:30Z'),
      cambio(Q2, 'neg', 'pagado_banco', 0, -500, '2026-10-02T16:30:00Z'),
    ],
  })
  assert.deepEqual(pagos, [])
  assert.ok(avisos.some((a) => /NEG.*corrección de 500/.test(a)), 'el negativo sin pago abierto se declara, no se publica')
})

test('una ida y vuelta (sube, baja por debajo de lo previo, vuelve a subir) deja sólo lo neto de la web', () => {
  // 122.200 previo → 741.254 → 122.200 → 619.200: lo pagado desde la web son 497.000.
  const { pagos } = armarPagos({
    lineas: [linea(Q2, 'beto', 0, 619200)],
    cambios: [
      cambio(Q2, 'beto', 'pagado_efectivo', 122200, 741254, '2026-10-02T16:50:00Z'),
      cambio(Q2, 'beto', 'pagado_efectivo', 741254, 122200, '2026-10-02T16:51:00Z'),
      cambio(Q2, 'beto', 'pagado_efectivo', 122200, 619200, '2026-10-02T16:52:00Z'),
    ],
  })
  assert.deepEqual(pagos.map((p) => p.importe), [497000])
})

test('pagos en días distintos son filas distintas; una corrección descuenta del último', () => {
  const { pagos } = armarPagos({
    lineas: [linea(Q2, 'ana', 0, 300000)],
    cambios: [
      cambio(Q2, 'ana', 'pagado_efectivo', 0, 100000, '2026-09-20T15:00:00Z'),
      cambio(Q2, 'ana', 'pagado_efectivo', 100000, 350000, '2026-10-02T15:00:00Z'),
      cambio(Q2, 'ana', 'pagado_efectivo', 350000, 300000, '2026-10-02T15:05:00Z'),
    ],
  })
  assert.deepEqual(pagos.map((p) => [p.fecha, p.importe]), [['2026-09-20', 100000], ['2026-10-02', 200000]])
})

test('el acumulado manda: si quedó por debajo del historial, se recorta y se avisa', () => {
  const { pagos, avisos } = armarPagos({
    lineas: [linea(Q2, 'ana', 100000, 0)],
    cambios: [cambio(Q2, 'ana', 'pagado_banco', 0, 150000, '2026-10-02T15:00:00Z')],
  })
  assert.deepEqual(pagos.map((p) => p.importe), [100000])
  assert.ok(avisos.some((a) => /más que el acumulado/.test(a)))
})

test('fecha del pago: con la migración, la ANOTADA en la web gana a la del cambio, y la entrega a rendir se distingue', () => {
  const c = cambio(Q2, 'ana', 'pagado_efectivo', 0, 80000, '2026-10-02T15:00:00Z')
  const anot = { liquidacion_id: Q2, persona_id: 'ana', fecha: '2026-09-30', importe: '80000.00', origen: 'entrega', registrado_en: '2026-10-02T15:00:01Z', clave: 'linea:1' }
  const siembra = { ...anot, clave: 'siembra:x', fecha: '2026-09-16' }
  const { pagos } = armarPagos({ lineas: [linea(Q2, 'ana', 0, 80000)], cambios: [c], anotaciones: [siembra, anot] })
  assert.deepEqual([pagos[0].fecha, pagos[0].fechaSegun, pagos[0].saleDe], ['2026-09-30', 'anotada en la web', 'entrega a rendir'])
  assert.equal(emparejarAnotacion(c, [siembra], new Set()), null, 'la siembra (carga histórica) nunca se empareja')
  assert.equal(saleDe('efectivo', null), 'caja')
})

test('sin la migración (anotaciones null) arma igual, con la fecha del cambio', () => {
  const { pagos } = armarPagos({
    lineas: [linea(Q2, 'ana', 0, 80000)],
    cambios: [cambio(Q2, 'ana', 'pagado_efectivo', 0, 80000, '2026-10-02T15:00:00Z')], anotaciones: null,
  })
  assert.deepEqual([pagos[0].fecha, pagos[0].fechaSegun, pagos[0].saleDe], ['2026-10-02', 'día del cambio', 'caja'])
})

test('leerInsumos: la tabla de la migración ausente (42P01) da anotaciones null; otro error corta', async () => {
  const falso = (codigo) => async (sql) => {
    if (/liquidacion_pago_efectivo/.test(sql)) throw Object.assign(new Error('x'), { code: codigo })
    return { rows: /perfiles/.test(sql) ? [{ id: 'u1', nombre: 'Rodrigo' }] : [] }
  }
  const r = await leerInsumos(falso('42P01'))
  assert.equal(r.anotaciones, null)
  assert.equal(r.nombres.get('u1'), 'Rodrigo')
  await assert.rejects(leerInsumos(falso('57P01')), 'una base caída no se publica como «sin pagos»')
})

test('idempotente: la misma entrada da la misma grilla, en cualquier orden de llegada de los cambios', () => {
  const lineas = [linea(Q2, 'ana', 1000, 0), linea(Q2, 'beto', 0, 2000)]
  const cambios = [cambio(Q2, 'ana', 'pagado_banco', 0, 1000, '2026-10-02T15:00:00Z'), cambio(Q2, 'beto', 'pagado_efectivo', 0, 2000, '2026-10-02T15:01:00Z')]
  const a = grilla(armarPagos({ lineas, cambios }).pagos, 'corte')
  const b = grilla(armarPagos({ lineas: [...lineas].reverse(), cambios: [...cambios].reverse() }).pagos, 'corte')
  assert.deepEqual(a, b)
  assert.equal(a.length, 3 + 2, 'título, nota, encabezado y una fila por pago')
})

test('fila y grilla: el orden de columnas es contrato, el importe va positivo y el total se dice', () => {
  const { pagos } = armarPagos({ lineas: [linea(Q2, 'ana', 1000, 0)], cambios: [cambio(Q2, 'ana', 'pagado_banco', 0, 1000, '2026-10-02T15:00:00Z')] })
  const f = fila(pagos[0])
  assert.equal(f.length, COLUMNAS.length)
  assert.equal(f[COL.importe.charCodeAt(0) - 65], 1000)
  assert.equal(f[COL.medio.charCodeAt(0) - 65], 'banco')
  assert.equal(typeof f[COL.instante.charCodeAt(0) - 65], 'number', 'el instante va como serial de Sheets')
  assert.match(grilla(pagos, 'c')[1][0], /banco 1\.000,00/)
  assert.deepEqual(resumen(pagos).porQuincena, [{ quincena: '2026-09-16–2026-09-30 obreros', filas: 1, banco: 1000, efectivo: 0 }])
})

test('ensayo por defecto: escribe sólo con --aplicar, y --dry gana', () => {
  assert.equal(modoAplicar(['node', 'x']), false)
  assert.equal(modoAplicar(['node', 'x', '--aplicar']), true)
  assert.equal(modoAplicar(['node', 'x', '--aplicar', '--dry']), false)
})
