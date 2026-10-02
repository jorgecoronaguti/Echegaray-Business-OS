import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hexDe, coloresDeLaCasa, esDeLaCasa, inventarioFueraDeEstilo, contarPorTipo,
  tiposABorrar, planDeBorrado, celdasSinPrueba, comprimirA1, grDeA1, lineasDelInventario, lineasSinPrueba, negativaAAplicar,
} from './formato-resembrar.mjs'
import { huellaDeCelda } from '../lib/huella-formato-celda.mjs'
import { huellaDeRango } from '../lib/huella-formato.mjs'
import { COLOR } from '../lib/estilo-pestana.mjs'

const celda = (formato) => ({ formato })

test('hexDe: los colores de la casa se reconocen aunque la API los devuelva con decimales largos', () => {
  assert.equal(hexDe(COLOR.titulo), '#0f2a33')
  assert.equal(hexDe({ red: 0.05882353, green: 0.16470589, blue: 0.2 }), '#0f2a33')
  assert.equal(hexDe({}), '#000000', 'un canal ausente vale 0 en la API')
  assert.equal(hexDe(null), null)
  assert.ok(coloresDeLaCasa().includes('#ffffff'))
  // El negro del archivo declarado como #101317 y escrito con tres decimales (#101414) es el mismo.
  assert.ok(esDeLaCasa('#101317'))
  assert.ok(esDeLaCasa('#1a2133'), 'la tinta de OBRAS (0.10, 0.13, 0.20) es la de Nómina')
  assert.ok(!esDeLaCasa('#ff0000'))
})

test('el formato que produce el OS no aparece en el inventario', () => {
  const casa = { textFormat: { fontFamily: 'Arial', foregroundColor: COLOR.texto }, backgroundColor: { red: 1, green: 1, blue: 1 } }
  const inv = inventarioFueraDeEstilo({ filas: [[celda(casa), celda(null), celda({ backgroundColor: COLOR.total })]] })
  assert.equal(inv.celdasConFormato, 2)
  for (const m of [inv.fuentes, inv.fondos, inv.tintas, inv.tachado, inv.subrayado]) assert.equal(m.size, 0)
})

test('lo que el OS no produce se enumera con la celda donde está', () => {
  const inv = inventarioFueraDeEstilo({
    filas: [
      [celda({ textFormat: { fontFamily: 'Calibri' } }), celda({ backgroundColor: { red: 1, green: 1 } })],
      [celda({ textFormat: { foregroundColor: { red: 1 }, strikethrough: true, underline: true } })],
    ],
  })
  assert.deepEqual(inv.fuentes.get('Calibri'), { n: 1, muestra: ['A1'] })
  assert.deepEqual(inv.fondos.get('#ffff00'), { n: 1, muestra: ['B1'] })
  assert.deepEqual(inv.tintas.get('#ff0000'), { n: 1, muestra: ['A2'] })
  assert.equal(inv.tachado.get('tachado').n, 1)
  assert.equal(inv.subrayado.get('subrayado').n, 1)
})

test('contarPorTipo: separa las huellas de rango de los sellos por celda', () => {
  assert.deepEqual([...contarPorTipo([{ tipo: 'celda' }, { tipo: 'celda1' }, { tipo: 'celda1' }])], [['celda', 1], ['celda1', 2]])
})

// ═══ AUDITORÍA 02/10, HALLAZGO 2: el seco no decía qué borraba y el inventario se leía como «nada tuyo» ═══
test('--aplicar por defecto borra sólo celdas y rangos; anchos, altos, merges y pestaña sólo con su bandera', () => {
  assert.deepEqual(tiposABorrar([]), ['celda', 'celda1', 'celda1p'])
  assert.deepEqual(tiposABorrar(['--aplicar', '--tambien-anchos', '--tambien-pestana']), ['celda', 'celda1', 'celda1p', 'ancho', 'pestana'])
  const conteo = contarPorTipo(['celda', 'celda1', 'celda1', 'celda1p', 'ancho', 'alto', 'merge', 'pestana', 'resembrar'].map((tipo) => ({ tipo })))
  assert.deepEqual(planDeBorrado(conteo, tiposABorrar([])), {
    borra: [['celda', 1], ['celda1', 2], ['celda1p', 1]],
    conserva: [['ancho', 1], ['alto', 1], ['merge', 1], ['pestana', 1]],
  })
})

test('celdasSinPrueba: lista con su A1 lo que no coincide con ningún sello, aunque el inventario no lo vea', () => {
  const negrita = { textFormat: { fontFamily: 'Arial', bold: true } }
  const delOs = { textFormat: { fontFamily: 'Arial' } }
  const filas = [
    [celda(delOs), celda(delOs), celda(negrita), celda(delOs)],
    [celda(negrita), celda(delOs), celda(null), celda(delOs)],
  ]
  const lectura = { filas }
  const sellado = { filas: [[celda(delOs)], [celda(delOs)]] }
  const huellas = [
    { tipo: 'celda1', rango_a1: 'A1', huella: huellaDeCelda(lectura, 0, 0) },                   // A1: su sello, igual
    { tipo: 'celda1', rango_a1: 'A2', huella: huellaDeCelda(sellado, 1, 0) },                   // A2: el dueño le puso negrita
    { tipo: 'celda', rango_a1: 'B1:B2', huella: huellaDeRango('celda', lectura, grDeA1('B1:B2')) }, // rango intacto
    { tipo: 'celda1p', rango_a1: 'D1', huella: huellaDeCelda(lectura, 0, 3) },                  // pendiente, igual
    { tipo: 'celda', rango_a1: 'D1:D2', huella: 'otra' },                                        // rango que cambió
  ]
  assert.deepEqual(comprimirA1(celdasSinPrueba(lectura, huellas)), ['C1', 'A2', 'D2'])
  assert.equal(inventarioFueraDeEstilo(lectura).fuentes.size, 0, 'el inventario no ve la negrita: por eso hace falta la lista')
})

test('comprimirA1 y grDeA1: rectángulos exactos, bordes abiertos como los escribe la guarda', () => {
  const rect = []
  for (let f = 9; f < 12; f++) for (let c = 1; c < 4; c++) rect.push({ fila: f, col: c })
  assert.deepEqual(comprimirA1([...rect, { fila: 0, col: 5 }, { fila: 10, col: 6 }]), ['F1', 'B10:D12', 'G11'])
  assert.deepEqual(grDeA1('B10:D12'), { startRowIndex: 9, startColumnIndex: 1, endRowIndex: 12, endColumnIndex: 4 })
  assert.deepEqual(grDeA1('A1:K'), { startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 11 })
  assert.equal(grDeA1('COLUMNS:0-3'), null)
})

test('el inventario vacío no afirma que no haya nada del dueño y dice qué no mira', () => {
  const texto = lineasDelInventario(inventarioFueraDeEstilo({ filas: [] })).join('\n')
  assert.doesNotMatch(texto, /nada fuera del estilo/)
  assert.match(texto, /NO prueba que no haya nada tuyo/)
  for (const x of ['negrita', 'cursiva', 'tamaño', 'formato de número', 'bordes', 'alineación', 'color de la casa']) assert.match(texto, new RegExp(x))
})

// ═══ RE-AUDITORÍA 02/10: el seco no decía que la primera pasada PISA, y --aplicar no se negaba ═══
test('lo que no tiene prueba se dice como lo que se va a PISAR, y --aplicar se niega sin la bandera explícita', () => {
  const sin = [{ fila: 4, col: 2 }, { fila: 5, col: 2 }, { fila: 10, col: 2 }]
  const texto = lineasSinPrueba(sin).join('\n')
  assert.match(texto, /estas 3 celda\(s\) tienen un formato que no puedo probar que sea mío: con --aplicar la corrida siguiente lo PISA/)
  assert.match(texto, /C5:C6, C11/)
  assert.match(negativaAAplicar(sin, ['--aplicar']), /PISARÍA 3 celda\(s\).*C5:C6, C11.*--pisar-lo-no-probado/)
  assert.equal(negativaAAplicar(sin, ['--aplicar', '--pisar-lo-no-probado']), null)
  assert.equal(negativaAAplicar([], ['--aplicar']), null, 'sin nada que pisar no hay por qué negarse')
})

test('el inventario declara que subrayado y rotación no los detecta la lista de celdas sin prueba', () => {
  const texto = lineasDelInventario(inventarioFueraDeEstilo({ filas: [] })).join('\n')
  assert.match(texto, /NO detecta subrayado ni rotación/)
})

test('celdasSinPrueba por tipo de cambio: negrita, número, borde, alineación y fondo sí; subrayado y rotación no', () => {
  const base = { textFormat: { fontFamily: 'Arial', fontSize: 10 }, backgroundColor: { red: 1, green: 1, blue: 1 } }
  const filas = Array.from({ length: 12 }, () => Array.from({ length: 3 }, () => celda(structuredClone(base))))
  const huellas = []
  filas.forEach((f, i) => f.forEach((_, c) => huellas.push({ tipo: 'celda1', rango_a1: `${'ABC'[c]}${i + 1}`, huella: huellaDeCelda({ filas }, i, c) })))
  const m = (f, fn) => fn(filas[f][2].formato)
  m(4, (x) => { x.textFormat.bold = true })
  m(5, (x) => { x.numberFormat = { type: 'NUMBER', pattern: '0.00' } })
  m(6, (x) => { x.borders = { top: { style: 'SOLID' } } })
  m(7, (x) => { x.horizontalAlignment = 'CENTER' })
  m(8, (x) => { x.textFormat.underline = true })
  m(9, (x) => { x.textRotation = { angle: 45 } })
  m(10, (x) => { x.backgroundColor = { red: 0.3, green: 0.61, blue: 0.2 } })
  assert.deepEqual(comprimirA1(celdasSinPrueba({ filas }, huellas)), ['C5:C8', 'C11'])
})
