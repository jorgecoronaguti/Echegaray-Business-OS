// LA MATRIZ MENSUAL — los defectos que este archivo mantiene muertos.
//
// El más caro es el del presupuesto: comparar contra un presupuesto que nadie cargó y mostrar la
// variación como si fuera un dato. Un mes sin cargar tiene que decir "—", nunca un porcentaje.
//
// El segundo es de contrato: los tres rangos con nombre que esta vista publica los consume el anexo
// de CAJA. Si se publican sobre la geometría anterior no dan error — devuelven otra celda, y el
// control que los lee miente sin un solo #REF!.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaMeses, mesesDelAnio, destinosNombrados, PESTANA_MENSUAL } from './cash-flow-meses.mjs'
import { NOMBRE_MESES } from './cash-flow-lineas.mjs'
import { FOOTPRINT, conceptosDe, colTotal } from './cash-flow-matriz.mjs'
import { auditarPatron } from './patron-pestana.mjs'

const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const armar = (opts = {}) => grillaMeses({ anio: 2026, refs: REFS, ...opts })
const en = (filas, f, c) => String((filas[f - 1] || [])[c] ?? '')
const fueraDeComillas = (s) => String(s).replace(/"[^"]*"/g, '""')

test('doce columnas de mes más TOTAL, y las nueve filas de concepto en orden', () => {
  const { filas, meta } = armar()
  assert.equal(meta.pestana, PESTANA_MENSUAL)
  assert.equal(meta.cab.n, 12)
  assert.equal(meta.cab.colTotal, colTotal('mes'))
  assert.equal(en(filas, meta.cab.fila, 0), 'Concepto')
  assert.equal(en(filas, meta.cab.fila, meta.cab.colTotal), 'TOTAL')
  assert.deepEqual(
    conceptosDe('mes').map((c) => en(filas, meta.fila[c.clave], 0)),
    conceptosDe('mes').map((c) => c.rotulo))
  assert.equal(conceptosDe('mes').length, 9)
})

test('los doce encabezados son SERIALES del primer día de cada mes, nunca texto', () => {
  const { filas, meta } = armar()
  const meses = mesesDelAnio(2026)
  for (let j = 0; j < 12; j++) {
    const v = (filas[meta.cab.fila - 1] || [])[meta.cab.col0 + j]
    assert.equal(typeof v, 'number', `el mes ${j + 1} escribe un texto donde va la fecha — es lo que dejó a diciembre como cadena`)
    assert.equal(v, Math.round((meses[j].getTime() - Date.UTC(1899, 11, 30)) / 86400000))
  }
})

test('la variación contra el presupuesto NO inventa: sin las dos celdas cargadas muestra "—", no un cero', () => {
  const { filas, meta } = armar()
  for (let j = 0; j < 12; j++) {
    const v = en(filas, meta.fila.variacionPresupuesto, meta.cab.col0 + j)
    assert.ok(v.includes('PRESUPUESTO_INGRESOS') && v.includes('PRESUPUESTO_EGRESOS'),
      'la variación tiene que mirar la pestaña de carga, no una constante')
    assert.ok(v.includes('<>0'), 'sin la guarda de "hay presupuesto cargado", un mes vacío se compara contra cero')
    assert.ok(v.includes('"—"'), 'un mes sin cargar dice "—", no un número')
    assert.ok(v.startsWith('=IFERROR('), 'si el rango con nombre todavía no existe, la celda muestra el hueco y no #NAME?')
  }
})

test('la variación contra el mes anterior deja enero en blanco: no hay diciembre de 2025 en el cuadro', () => {
  const { filas, meta } = armar()
  assert.equal(en(filas, meta.fila.variacionMesAnterior, meta.cab.col0), '')
  assert.equal(en(filas, meta.fila.variacionMesAnterior, meta.cab.col0 + 1),
    `=N($C$${meta.fila.resultado})-N($B$${meta.fila.resultado})`)
})

test('el mes que ancla descuenta lo que ya está adentro del saldo declarado', () => {
  const { filas, meta } = armar()
  const f = en(filas, meta.fila.saldoInicial, meta.cab.col0 + 7) // agosto
  assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE'))
  assert.ok(f.includes('CAJA_FECHA_SALDO+1'),
    'sin restar lo ya movido en el mes del corte, el saldo declarado se suma encima de sus propios movimientos')
  // La semántica que el control A5 del anexo de CAJA verifica: total − REAL del mes hasta el corte.
  assert.ok(f.includes('CAJA_TOTAL_DISPONIBLE)-('), f)
})

test('los meses anteriores al corte quedan sin cadena en vez de inventar un saldo', () => {
  const { filas, meta } = armar()
  const f = en(filas, meta.fila.saldoInicial, meta.cab.col0)
  assert.ok(f.startsWith('=IF('), f)
  assert.ok(f.includes('""'), 'un mes anterior al corte no se puede reconstruir: va vacío, no en cero')
  // Y su saldo final tampoco: un cero se leería como "cerró el mes sin plata", que nadie afirmó.
  assert.ok(en(filas, meta.fila.saldoFinal, meta.cab.col0).startsWith('=IF(N($B$8)=0;""'))
})

test('cada mes encadena con el cierre del anterior', () => {
  const { filas, meta } = armar()
  for (let j = 1; j < 12; j++) {
    const anterior = String.fromCharCode(65 + meta.cab.col0 + j - 1)
    assert.ok(en(filas, meta.fila.saldoInicial, meta.cab.col0 + j).includes(`$${anterior}$${meta.fila.saldoFinal}`),
      `el mes ${j + 1} no engancha con el cierre del anterior`)
  }
})

test('cero números pegados en las filas de plata', () => {
  const { filas, meta } = armar()
  const pegados = []
  for (const cc of conceptosDe('mes')) {
    for (let c = meta.cab.col0; c <= meta.cab.colTotal; c++) {
      const v = (filas[meta.fila[cc.clave] - 1] || [])[c]
      if (v === undefined || v === '') continue
      if (typeof v === 'number' || (!String(v).startsWith('=') && v !== '—')) pegados.push(`${cc.rotulo} col ${c + 1}: ${v}`)
    }
  }
  assert.deepEqual(pegados, [])
})

test('el hero sale del propio cuadro: cuatro cifras, ninguna con aritmética propia', () => {
  const { filas, meta } = armar()
  const T = String.fromCharCode(65 + meta.cab.colTotal)
  assert.equal(en(filas, meta.hero.valor, meta.hero.slots[0]), `=N($${T}$${meta.fila.resultado})`)
  assert.equal(en(filas, meta.hero.valor, meta.hero.slots[1]),
    `=N($${T}$${meta.fila.ingresoReal})+N($${T}$${meta.fila.ingresoProyectado})`)
  assert.equal(en(filas, meta.hero.valor, meta.hero.slots[2]),
    `=N($${T}$${meta.fila.egresoReal})+N($${T}$${meta.fila.egresoProyectado})`)
  // El cierre del año es el saldo final de DICIEMBRE, no la suma de los saldos: sumar doce stocks no
  // da un stock, y los meses anteriores al corte van vacíos.
  assert.equal(en(filas, meta.hero.valor, meta.hero.slots[3]), `=N($M$${meta.fila.saldoFinal})`)
  assert.equal(en(filas, meta.hero.rotulo, meta.hero.slots[3]), 'CIERRE PROYECTADO DEL AÑO')
})

test('publica los tres nombres que el resto del archivo necesita, sobre las FILAS de la matriz', () => {
  // CF_MESES lo cuenta la proyección de comisiones; los dos saldos los mira el anexo de CAJA con
  // INDEX(rango;1;MATCH(…)). Publicarlos sobre la geometría anterior no da error: devuelve otra celda.
  const { meta } = armar()
  const d = destinosNombrados(meta)
  assert.deepEqual(d.map((x) => x.name), [NOMBRE_MESES, 'CF_SALDO_INICIO', 'CF_SALDO_CIERRE'])
  assert.deepEqual(d.map((x) => x.fila), [meta.cab.fila, meta.fila.saldoInicial, meta.fila.saldoFinal])
  for (const x of d) {
    assert.equal(x.col, 2, 'arrancan en la columna B')
    assert.equal(x.cols, 12, 'doce meses')
    assert.equal(x.filas, 1, 'son una fila, no una columna: la matriz los tiene en horizontal')
  }
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

test('ninguna fórmula derrama sobre las celdas de abajo', () => {
  const { filas } = armar()
  const derraman = []
  filas.forEach((f, i) => (f || []).forEach((c, j) => {
    const s = String(c ?? '')
    if (s.startsWith('=') && (/\bARRAYFORMULA\(/.test(s) || /^=\s*(FILTER|SORTN|QUERY)\(/.test(s))) {
      derraman.push(`fila ${i + 1} col ${j + 1}`)
    }
  }))
  assert.deepEqual(derraman, [])
})

test('el patrón de la pestaña se cumple, salvo la única excepción declarada: una matriz no tiene secciones', () => {
  const { filas } = armar()
  const render = filas.map((f) => (f || []).map((c) => (typeof c === 'string' && c.startsWith('=') ? 0 : c)))
  const malos = auditarPatron(render, { ancho: FOOTPRINT.mes.cols })
  assert.deepEqual(malos.map((m) => m.regla), ['sin-secciones'], JSON.stringify(malos))
})

test('después de la última variación no hay NADA: el costo financiero vive en Impuestos y Financieros', () => {
  const { filas, meta } = armar()
  assert.equal(meta.filaFin, meta.fila.variacionMesAnterior)
  assert.equal(filas.length, 16)
  const texto = filas.flat().map((c) => String(c ?? '')).join(' ')
  assert.ok(!/descubierto|impuesto al cheque|comisiones/i.test(texto), 'un costo modelado no puede vivir adentro del cuadro')
})
