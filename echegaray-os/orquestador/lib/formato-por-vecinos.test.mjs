// Los fixtures son celdas REALES de Proveedores leídas el 04/08/2026: el valor sin formato y el valor
// como se ve. Un test contra celdas inventadas prueba mi idea del defecto; contra las que el dueño
// está mirando, prueba EL defecto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claseDeColumna, clasePorMagnitud, CONTEO, FECHA, MONEDA, reparacionesDeColumna, residuosEnTotales, seVeCrudo,
} from './formato-por-vecinos.mjs'

/** Sección 2, columna D ("Comprado 2026"): importes con moneda y D48 que se ve "100000". */
const COMPRADO_2026 = [
  { fila: 43, valor: 7024921, visto: '$7.024.921' },
  { fila: 44, valor: 86508699, visto: '$86.508.699' },
  { fila: 45, valor: 964440, visto: '$964.440' },
  { fila: 48, valor: 100000, visto: '100000' },        // ← el defecto real
  { fila: 49, valor: 19709565, visto: '$19.709.565' },
]

/** Sección 3, columna C ("Fecha"): la columna que el detector anterior iba a convertir en pesos. */
const FECHAS_NOTAS = [
  { fila: 78, valor: 46037, visto: '15/01/2026' },
  { fila: 79, valor: 46037, visto: '15/01/2026' },
  { fila: 80, valor: 46077, visto: '24/02/2026' },
  { fila: 85, valor: 46163, visto: '20/05/2026' },
]

test('un importe que se ve crudo entre vecinos con moneda se repara como moneda', () => {
  assert.deepEqual(reparacionesDeColumna(COMPRADO_2026),
    [{ fila: 48, patron: MONEDA, clase: 'moneda', visto: '100000' }])
})

test('si se revierte el arreglo el defecto vuelve: la columna sana no reporta nada', () => {
  const sana = COMPRADO_2026.map((c) => (c.fila === 48 ? { ...c, visto: '$100.000' } : c))
  assert.deepEqual(reparacionesDeColumna(sana), [])
})

// ═══ EL DEFECTO QUE CASI SE COMETE, Y QUE ESTE TEST IMPIDE PARA SIEMPRE ═══
// La API no devuelve `userEnteredFormat` de una celda que HEREDA su formato. El detector que
// preguntaba por ese campo veía las 25 fechas de las secciones 1 y 3 como "sin formato" y las iba a
// reparar con patrón de moneda: un serial de fecha es un número mayor a mil, así que "15/01/2026" se
// habría convertido en "$46.037" en veinticinco celdas.

test('una columna de FECHAS que se ve bien no produce ni una reparación', () => {
  assert.equal(claseDeColumna(FECHAS_NOTAS), 'fecha')
  assert.deepEqual(reparacionesDeColumna(FECHAS_NOTAS), [])
})

test('una fecha que SÍ se ve cruda se repara como fecha, nunca como plata', () => {
  const col = [...FECHAS_NOTAS, { fila: 90, valor: 46200, visto: '46200' }]
  assert.deepEqual(reparacionesDeColumna(col), [{ fila: 90, patron: FECHA, clase: 'fecha', visto: '46200' }])
})

test('la clase la votan las celdas que están BIEN: tres crudas no cambian de qué es la columna', () => {
  const col = [...FECHAS_NOTAS, { fila: 91, valor: 46201, visto: '46201' }, { fila: 92, valor: 46202, visto: '46202' }]
  assert.equal(claseDeColumna(col), 'fecha')
})

test('la sección 6 no tiene una sola celda bien formateada: decide la magnitud, y nunca es fecha', () => {
  const col = [
    { fila: 185, valor: 209231271, visto: '209231271' },
    { fila: 186, valor: -21359123.26, visto: '-21359123,26' },
    { fila: 189, valor: 13848080.96, visto: '13848080,96' },
  ]
  // CAMBIO DE CONTRATO (04/08): antes una celda cruda votaba la clase, y como ninguna de estas
  // muestra `$`, la columna entera se declaraba "conteo" y los $209.231.271 se reparaban SIN el signo
  // pesos. Una celda rota no puede ser el modelo de cómo tienen que verse las demás.
  assert.equal(claseDeColumna(col), null, 'ninguna está bien: no hay a quién imitar')
  assert.equal(clasePorMagnitud(col), 'moneda')
  assert.ok(reparacionesDeColumna(col).every((r) => r.patron === MONEDA))
  // Y la columna de al lado, con conteos chicos, no se convierte en plata.
  const conteos = [{ fila: 185, valor: 521, visto: '521' }, { fila: 186, valor: 16, visto: '16' }]
  assert.equal(clasePorMagnitud(conteos), 'conteo')
  assert.deepEqual(reparacionesDeColumna(conteos), [], '521 y 16 no necesitan separador de miles')
})

test('el importe con decimales y sin separador es defecto aunque tenga coma', () => {
  assert.equal(seVeCrudo(-9272820.72, '-9272820,72'), true)
  assert.equal(seVeCrudo(-9272820.72, '-$9.272.821'), false)
})

test('lo que ya tiene símbolo, separador o barras nunca se toca', () => {
  assert.equal(seVeCrudo(19709565, '$19.709.565'), false)
  assert.equal(seVeCrudo(46037, '15/01/2026'), false)
  assert.equal(seVeCrudo(0.15, '15%'), false)
  assert.equal(seVeCrudo(521, '521'), false, 'por debajo de mil no hace falta separador')
})

test('el texto no es número: un rótulo en una columna de importes nunca se repara', () => {
  const col = [
    { fila: 71, valor: 'Subtotal de estos 30', visto: 'Subtotal de estos 30' },
    { fila: 72, valor: 39297608, visto: '$39.297.608' },
  ]
  assert.deepEqual(reparacionesDeColumna(col), [])
  assert.equal(seVeCrudo('100000', '100000'), false)
})

test('una columna vacía o de puro texto no inventa una clase', () => {
  assert.equal(claseDeColumna([{ fila: 1, valor: 'x', visto: 'x' }]), null)
  assert.equal(clasePorMagnitud([]), null)
  assert.deepEqual(reparacionesDeColumna([]), [])
})

test('los patrones son los del archivo: es-AR, sin decimales, negativo en rojo', () => {
  assert.equal(MONEDA, '"$"#,##0;[Red]-"$"#,##0')
  assert.equal(CONTEO, '#,##0')
  assert.equal(FECHA, 'dd/mm/yyyy')
})

// ═══ EL RESIDUO DE LA FILA 73, TAL CUAL ESTABA ═══

test('una fila de TOTAL con el texto del último proveedor pegado es residuo', () => {
  const filas = [{
    fila: 73,
    rotulo: 'TOTAL PROVEEDORES COMERCIALES',
    celdas: [
      { col: 0, valor: 'TOTAL PROVEEDORES COMERCIALES', formula: 'TOTAL PROVEEDORES COMERCIALES' },
      { col: 2, valor: 667, formula: '=SUMA(...)' },
      { col: 3, valor: 280997326, formula: '=SUMA(...)' },
      { col: 5, valor: 'Electricidad', formula: 'Electricidad' },   // ← el residuo
    ],
  }]
  assert.deepEqual(residuosEnTotales(filas), [{ fila: 73, col: 5, valor: 'Electricidad' }])
})

test('un total calculado por fórmula nunca es residuo, aunque devuelva texto', () => {
  const filas = [{
    fila: 71, rotulo: 'Subtotal de estos 30',
    celdas: [{ col: 4, valor: '22 d', formula: '=IF(...;"22 d";"")' }],
  }]
  assert.deepEqual(residuosEnTotales(filas), [])
})

test('una fila que no es de total no se toca aunque tenga texto suelto', () => {
  const filas = [{ fila: 49, rotulo: 'Corralon Progreso', celdas: [{ col: 5, valor: 'Cemento, cal y áridos', formula: 'Cemento' }] }]
  assert.deepEqual(residuosEnTotales(filas), [])
})

test('un número en la fila de total es el total, no residuo', () => {
  const filas = [{ fila: 73, rotulo: 'TOTAL', celdas: [{ col: 3, valor: 280997326, formula: 280997326 }] }]
  assert.deepEqual(residuosEnTotales(filas), [])
})
