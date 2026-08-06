// EL VOCABULARIO DE LA MATRIZ — lo que este archivo impide que vuelva a pasar.
//
// Cada test nombra un defecto concreto: una ventana con un hueco (un movimiento que no cae en ninguna
// columna), un encabezado escrito como texto en vez de serial (CF_MESES prometiendo doce fechas y
// entregando once y una cadena), un "mayor movimiento" sin filtro de estado (la glosa contradiciendo
// al importe de al lado), o un footprint declarado que no es el que la grilla produce.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONCEPTOS, FILA, COL, FOOTPRINT, ESTADOS_PENDIENTES, MEDIDAS,
  conceptosDe, filaDeConcepto, colTotal, columnasDeTiempo, filaGraficos,
  ventanas, ventanasDiarias, particionExacta, expresionVentana,
  formulaMayorImporte, formulaMayorContraparte, serialDeFecha, lunesDe, letra,
} from './cash-flow-matriz.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5)) // miércoles 5 de agosto de 2026

test('las trece semanas arrancan en el lunes de la semana corriente y no se saltean ninguna', () => {
  const v = ventanas('semana', { hoy: HOY })
  assert.equal(v.length, 13)
  assert.equal(v[0].desde.getTime(), lunesDe(HOY).getTime())
  assert.equal(v[0].desde.getUTCDay(), 1, 'la semana arranca el lunes')
  const r = particionExacta(v, v[0].desde, v[12].hasta)
  assert.deepEqual(r.huecos, [], 'un hueco entre dos semanas es un movimiento que no cae en ninguna columna')
})

test('los doce meses del ejercicio parten el año exacto, con EOMONTH y no con +30', () => {
  const v = ventanas('mes', { anio: 2026 })
  assert.equal(v.length, 12)
  const r = particionExacta(v, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2027, 0, 1)))
  assert.deepEqual(r.huecos, [])
  assert.equal(v[1].hasta.getUTCDate(), 1, 'febrero termina el 1/3, no el 3/3')
  assert.ok(expresionVentana('$B$7', 'mes').hasta.includes('EOMONTH'))
  assert.equal(expresionVentana('$B$7', 'semana').hasta, '$B$7+7')
})

test('PARTICIÓN COHERENTE: una semana y un mes son uniones de las MISMAS ventanas diarias', () => {
  // Lo que hace imposible que las dos vistas se contradigan no es que las semanas sumen el mes —una
  // semana cruza el fin de mes y cae a los dos lados—, sino que las dos se construyen sobre la misma
  // unidad atómica con el mismo filtro. Eso es lo que se prueba.
  for (const s of ventanas('semana', { hoy: HOY })) {
    const dias = ventanasDiarias(s.desde, s.hasta)
    assert.equal(dias.length, 7)
    assert.deepEqual(particionExacta(dias, s.desde, s.hasta).huecos, [])
  }
  for (const m of ventanas('mes', { anio: 2026 })) {
    const dias = ventanasDiarias(m.desde, m.hasta)
    assert.deepEqual(particionExacta(dias, m.desde, m.hasta).huecos, [])
  }
})

test('la partición detecta un hueco: si un día se cae, el test se pone rojo', () => {
  const m = ventanas('mes', { anio: 2026 })[7]
  const dias = ventanasDiarias(m.desde, m.hasta).filter((d) => d.desde.getUTCDate() !== 15)
  const r = particionExacta(dias, m.desde, m.hasta)
  assert.equal(r.ok, false)
  assert.equal(r.huecos.length, 1)
})

test('la geometría es la misma en las dos vistas, y las filas están en el orden que pidió el dueño', () => {
  assert.deepEqual(conceptosDe('semana').map((c) => c.rotulo), [
    'Saldo inicial', 'Ingresos reales', 'Ingresos proyectados', 'Egresos reales', 'Egresos proyectados',
    'Resultado', 'Saldo final',
  ])
  assert.deepEqual(conceptosDe('mes').map((c) => c.rotulo).slice(7), [
    'Variación vs presupuesto', 'Variación vs mes anterior',
  ])
  assert.equal(FILA.cabecera, 7)
  assert.equal(filaDeConcepto('semana', 'saldoInicial'), 8)
  assert.equal(filaDeConcepto('semana', 'saldoFinal'), 14)
  assert.equal(filaDeConcepto('mes', 'saldoFinal'), 14, 'las dos vistas tienen el saldo final en la misma fila')
  assert.equal(filaDeConcepto('mes', 'variacionMesAnterior'), 16)
})

test('el footprint declarado es el que la matriz ocupa de verdad: ni una columna de más', () => {
  for (const tipo of ['semana', 'mes']) {
    const cols = 1 + columnasDeTiempo(tipo) + 1 // concepto + tiempo + TOTAL
    assert.equal(FOOTPRINT[tipo].cols, cols)
    assert.equal(colTotal(tipo), cols - 1)
    // El alto tiene que alojar el cuadro Y el ancla de los gráficos: `anchorCell` es una celda real y
    // si la hoja no llega, la API devuelve 400 y se cae el lote entero.
    assert.ok(FOOTPRINT[tipo].filas > filaGraficos(tipo), `${tipo}: el gráfico se ancla fuera de la hoja`)
    assert.ok(FOOTPRINT[tipo].filas <= 50, `${tipo}: 220 filas para un cuadro de 16 es lo que se vino a sacar`)
  }
  assert.equal(COL.tiempo0, 1)
})

test('el encabezado de tiempo es un SERIAL: el texto "1/12/2026" ya dejó CF_MESES con una cadena adentro', () => {
  assert.equal(serialDeFecha(new Date(Date.UTC(2026, 0, 1))), 46023)
  assert.equal(typeof serialDeFecha(new Date(Date.UTC(2026, 11, 1))), 'number')
})

test('un "mayor movimiento" SIN filtro de estado no se puede construir', () => {
  // El defecto que esto mata: la glosa decía "Mayor pago: ARCOR · $12.500.000" al lado de un "Pagado
  // —". Las dos celdas eran correctas por separado y juntas mentían.
  assert.throws(() => formulaMayorImporte('TODAY()', 'TODAY()+7', -1), /filtro de estado/)
  assert.throws(() => formulaMayorImporte('TODAY()', 'TODAY()+7', -1, []), /filtro de estado/)
})

test('el mayor pago y su contraparte llevan EXACTAMENTE el mismo filtro', () => {
  const est = [...ESTADOS_PENDIENTES]
  const imp = formulaMayorImporte('TODAY()', 'TODAY()+7', -1, est)
  const quien = formulaMayorContraparte('TODAY()', 'TODAY()+7', -1, est, '$H$5')
  for (const e of est) {
    assert.ok(imp.includes(`="${e}"`), `el importe no filtra ${e}`)
    assert.ok(quien.includes(`="${e}"`), `la contraparte no filtra ${e}`)
  }
  assert.ok(imp.includes('$B$2:$B=-1') && quien.includes('$B$2:$B=-1'), 'los dos miran el mismo signo')
  assert.ok(quien.includes('$H$5'), 'la contraparte se busca por el importe que ya calculó la celda de al lado')
})

test('las cuatro medidas son una partición del flujo: real y pendiente, sin superponerse', () => {
  assert.deepEqual(MEDIDAS.map((m) => m.estados.join('|')), [
    'REAL', 'PROYECTADO|VENCIDO|COMPROMETIDO', 'REAL', 'PROYECTADO|VENCIDO|COMPROMETIDO',
  ], 'un estado en dos medidas del mismo signo se contaría dos veces; uno en ninguna desaparece')
  assert.deepEqual(MEDIDAS.map((m) => m.signo), [1, 1, -1, -1])
  // Cada medida tiene su fila, y cada fila su medida: una medida sin fila no se muestra en ningún lado.
  const conMedida = CONCEPTOS.filter((c) => c.medida !== undefined).map((c) => c.medida)
  assert.deepEqual(conMedida, [0, 1, 2, 3])
})

test('letra() nombra las columnas igual que el resto del repo', () => {
  assert.equal(letra(0), 'A')
  assert.equal(letra(13), 'N')
  assert.equal(letra(14), 'O')
})
