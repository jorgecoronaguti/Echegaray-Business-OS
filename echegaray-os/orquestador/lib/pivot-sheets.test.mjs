import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pivot, filtroValores, valoresNoCubiertos, plantar, borrar, filtrosQueSeCongelan, RESUMEN } from './pivot-sheets.mjs'

const base = { sheetId: 7, desdeFila: 3, hastaFila: 800, columnas: 32 }

test('un filtro NO se puede construir sin el dominio completo de la columna', () => {
  // Sin saber qué valores existen hoy no se puede saber qué está quedando afuera, y un filtro que
  // esconde sin decir qué esconde es cómo se pierde plata en un cuadro.
  assert.throws(() => filtroValores(['Pendiente']), /dominio completo/)
  assert.throws(() => filtroValores(['Pendiente'], []), /dominio completo/)
})

test('el filtro sólo deja pasar valores que existen hoy', () => {
  const dominio = ['Pagado', 'Pendiente', 'Proyectado']
  assert.deepEqual(filtroValores(['Pendiente'], dominio), { visibleValues: ['Pendiente'] })
  // Si el valor pedido ya no existe, el cuadro saldría vacío y parecería que no hay deuda.
  assert.throws(() => filtroValores(['Cancelado'], dominio), /saldría vacío/)
})

test('un estado nuevo en Compras se ve, no desaparece del cuadro', () => {
  // El control que reemplaza a la condición que la API de pivots no soporta.
  const dominio = ['Pagado', 'Pendiente', 'Proyectado', 'En gestión']
  assert.deepEqual(valoresNoCubiertos(dominio, ['Pendiente'], ['Pagado', 'Proyectado']), ['En gestión'])
  assert.deepEqual(valoresNoCubiertos(['Pagado', 'Pendiente'], ['Pendiente'], ['Pagado']), [])
})

test('un pivot sin agrupación es una lista, y se rechaza', () => {
  assert.throws(() => pivot({ ...base, valores: [{ col: 14 }] }), /es una lista/)
  assert.throws(() => pivot({ ...base, filas: [{ col: 4 }] }), /no muestra nada/)
})

test('el nivel de arriba se puede ordenar POR VALOR, no alfabéticamente', () => {
  // Es lo que hace que el cuadro conteste "a quién le debo más" sin que nadie ordene a mano.
  const p = pivot({ ...base, filas: [{ col: 4, orden: 'DESC', ordenarPorValor: 0 }], valores: [{ col: 14 }] })
  assert.deepEqual(p.rows[0].valueBucket, { valuesIndex: 0 })
  assert.equal(p.rows[0].sortOrder, 'DESCENDING')
})

test('los subtotales se pueden apagar en los niveles internos', () => {
  const p = pivot({ ...base, filas: [{ col: 4 }, { col: 2, totales: false }], valores: [{ col: 14 }] })
  assert.equal(p.rows[0].showTotals, true)
  assert.equal(p.rows[1].showTotals, false, 'subtotalar cada fecha es ruido, no información')
})

test('el rango origen incluye el encabezado y es un RANGO, no un resultado', () => {
  const p = pivot({ ...base, filas: [{ col: 4 }], valores: [{ col: 14 }] })
  assert.deepEqual(p.source, { sheetId: 7, startRowIndex: 3, endRowIndex: 800, startColumnIndex: 0, endColumnIndex: 32 })
})

test('la función de resumen por defecto es la suma', () => {
  const p = pivot({ ...base, filas: [{ col: 4 }], valores: [{ col: 14 }, { col: 0, resumen: RESUMEN.cuenta }] })
  assert.equal(p.values[0].summarizeFunction, 'SUM')
  assert.equal(p.values[1].summarizeFunction, 'COUNTA')
})

test('plantar ocupa UNA celda: el pivot se derrama solo', () => {
  const r = plantar(7, 10, 0, { x: 1 })
  assert.equal(r.updateCells.range.endRowIndex - r.updateCells.range.startRowIndex, 1)
  assert.equal(r.updateCells.fields, 'pivotTable')
})

test('borrar deja la celda sin pivot, no la borra', () => {
  // Un pivot no se pisa: si el nuevo ocupa menos filas que el viejo, quedan restos derramados. Y
  // esta pestaña la rehace un agente cada dos horas.
  const r = borrar(7, 10, 0)
  assert.deepEqual(r.updateCells.rows, [{ values: [{}] }])
  assert.equal(r.updateCells.fields, 'pivotTable')
})

test('el control detecta un filtro que se va a congelar', () => {
  // Exactamente la forma del pivot de RESUMEN que NO hay que copiar.
  const deResumen = {
    filterSpecs: [{ columnOffsetIndex: 16, filterCriteria: { visibleValues: ['16/7/2026', '17/7/2026'] } }],
    criteria: { 3: { visibleValues: ['jul-26', 'jun-26'] } },
  }
  const f = filtrosQueSeCongelan(deResumen)
  assert.equal(f.length, 2)
  assert.deepEqual(f.map((x) => x.col).sort((a, b) => a - b), [3, 16])
})

test('el inventario incluye los filtros propios: hay que regenerarlos en cada corrida', () => {
  // La API de pivots NO acepta condiciones —probado contra el Sheet real: devuelve cero filas— así
  // que la enumeración es inevitable. Lo que la salva de congelarse es que se rehace cada 2 horas
  // desde el dominio real, y este inventario dice cuáles son.
  const p = pivot({ ...base, filas: [{ col: 4 }], valores: [{ col: 14 }], filtros: [{ col: 23, criterio: filtroValores(['Pendiente'], ['Pagado', 'Pendiente']) }] })
  assert.deepEqual(filtrosQueSeCongelan(p), [{ col: 23, valores: 1 }])
})
