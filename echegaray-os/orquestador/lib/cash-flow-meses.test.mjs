// EL CUADRO MENSUAL — los defectos que este archivo mantiene muertos.
//
// El más caro de todos es el del presupuesto: comparar contra un presupuesto que nadie cargó y mostrar
// la variación como si fuera un dato. Un mes sin cargar tiene que decir '—', nunca un porcentaje.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaMeses, mesesDelAnio, destinosNombrados } from './cash-flow-meses.mjs'
import { NOMBRE_MESES } from './cash-flow-lineas.mjs'
import { auditarPatron } from './patron-pestana.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5))
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const armar = (opts = {}) => grillaMeses({ anio: 2026, refs: REFS, hoy: HOY, ...opts })
const fueraDeComillas = (s) => String(s).replace(/"[^"]*"/g, '""')

test('doce bloques, uno por mes del ejercicio, en orden', () => {
  const { meta } = armar()
  assert.equal(meta.meses.length, 12)
  const meses = mesesDelAnio(2026)
  meta.meses.forEach((b, i) => assert.equal(b.mes.getTime(), meses[i].getTime()))
})

test('la variación contra el presupuesto NO inventa: sin las dos celdas cargadas, no muestra porcentaje', () => {
  const { filas, meta } = armar()
  for (const b of meta.meses) {
    const importe = String(filas[b.filaVsPresup - 1][1])
    const chip = String(filas[b.filaVsPresup - 1][2])
    assert.ok(importe.includes('PRESUPUESTO_INGRESOS') && importe.includes('PRESUPUESTO_EGRESOS'),
      'la variación tiene que mirar la pestaña de carga, no una constante')
    assert.ok(importe.includes("<>0"), 'sin la guarda de "hay presupuesto cargado", un mes vacío se compara contra cero')
    assert.ok(chip.includes('sin presupuesto cargado'), 'el chip tiene que decir que falta el dato, no un porcentaje')
    assert.ok(importe.startsWith('=IFERROR('), 'si el rango con nombre todavía no existe, la celda muestra el hueco y no #NAME?')
  }
})

test('el mes que ancla descuenta lo que ya está adentro del saldo declarado', () => {
  const { filas, meta } = armar()
  const f = String(filas[meta.meses[7].filaInicio - 1][1])
  assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE'))
  assert.ok(f.includes("CAJA_FECHA_SALDO+1"),
    'sin restar lo ya movido en el mes del corte, el saldo declarado se suma encima de sus propios movimientos')
})

test('los meses anteriores al saldo declarado quedan sin cadena en vez de inventar un saldo', () => {
  const { filas, meta } = armar()
  const f = String(filas[meta.meses[0].filaInicio - 1][1])
  assert.ok(f.startsWith("=IF("), f)
  assert.ok(f.includes("\"\""), 'un mes anterior al corte no se puede reconstruir: va vacío, no en cero')
})

test('cero números pegados en la columna de plata', () => {
  const { filas } = armar()
  const pegados = []
  filas.forEach((f, i) => {
    const v = (f || [])[1]
    if (v === undefined || v === null || v === '') return
    if (typeof v === 'number' || (!String(v).startsWith('=') && /[0-9]/.test(String(v)))) pegados.push(`fila ${i + 1}: ${v}`)
  })
  assert.deepEqual(pegados, [])
})

test('es-AR: ninguna fórmula usa la coma como separador de argumentos', () => {
  const { filas } = armar()
  const malas = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (s.startsWith('=') && fueraDeComillas(s).includes(',')) malas.push(`fila ${i + 1} col ${j + 1}`)
  }))
  assert.deepEqual(malas, [])
})

test('ninguna fila tiene números sin decir qué son, y el patrón de la pestaña se cumple', () => {
  const { filas } = armar()
  const render = filas.map((f) => (f || []).map((c) => (typeof c === 'string' && c.startsWith('=') ? 0 : c)))
  const malos = auditarPatron(render, { ancho: 3 })
    .filter((m) => ['fila-sin-concepto', 'sin-titulo', 'titulo-versalita', 'sin-subtitulo', 'seccion-desordenada', 'seccion-repetida', 'sin-secciones'].includes(m.regla))
  assert.deepEqual(malos, [])
})

test('publica los tres nombres que el resto del archivo necesita, sobre doce filas cada uno', () => {
  // CF_MESES lo cuenta la proyección de comisiones; los dos saldos los mira el anexo de CAJA, que
  // hasta hoy ubicaba estas filas por los rótulos de la matriz vieja y sus doce columnas B..M.
  const { meta } = armar()
  const d = destinosNombrados(meta)
  assert.deepEqual(d.map((x) => x.name), [NOMBRE_MESES, 'CF_SALDO_INICIO', 'CF_SALDO_CIERRE'])
  for (const x of d) {
    assert.equal(x.fila, meta.aux.fila0)
    assert.equal(x.filas, 12)
  }
  assert.equal(d[0].col, meta.aux.col.fecha + 1)
  assert.equal(d[1].col, meta.aux.col.inicio + 1)
  assert.equal(d[2].col, meta.aux.col.saldo + 1)
})

test('el saldo del año sale del último mes con cadena, no de sumar los saldos', () => {
  const { filas, meta } = armar()
  const f = String(filas[meta.hero.cierre - 1][1])
  assert.ok(f.includes('INDEX(') && f.includes('COUNT('), f)
  assert.ok(!f.startsWith('=SUM('), 'sumar los saldos de cierre de los doce meses no es el saldo del año')
})
