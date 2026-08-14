// LA COLUMNA "QUÉ HACER": QUE NO SE PUEDA VOLVER A PERDER.
//
// El 14/08 `proveedores-dos-cuadros.mjs --aplicar` corrió solo, limpió su rectángulo A:G y las
// catorce notas del dueño desaparecieron de la pestaña sin un solo error. Cada test de acá ataca un
// eslabón de esa cadena: si se revierte el arreglo, alguno se pone rojo.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  formulaNota, notasQueNoEntran, rangoDeNotasDelDetalle, requestsDeNotas, ROTULO_NOTA,
} from './proveedores-notas-columna.mjs'

const SCRIPT = new URL('../scripts/proveedores-dos-cuadros.mjs', import.meta.url)
const NOTAS = new URL('../scripts/proveedores-notas-visibles.mjs', import.meta.url)

test('EL DEFECTO DEL 14/08: el generador que borra la columna la repone en la misma corrida', () => {
  const src = readFileSync(SCRIPT, 'utf8')
  // Limpia A:G — la columna de la nota entra en ese rectángulo.
  assert.match(src, /endColumnIndex: 7/, 'el generador sigue limpiando siete columnas')
  // Y por eso TIENE que reponerla él mismo: sin esto, correrlo suelto vuelve a borrar las notas.
  assert.match(src, /reponerLasNotasQueEstaCorridaBorro/,
    'el generador que vacía A:G tiene que reponer "Qué hacer" en la misma corrida')
  assert.match(src, /requestsDeNotas/, 'y con los MISMOS requests que el otro escritor')
})

test('los dos escritores comparten la fórmula: ninguno la vuelve a tipear', () => {
  for (const f of [SCRIPT, NOTAS]) {
    const src = readFileSync(f, 'utf8')
    assert.ok(!/VLOOKUP\(\$/.test(src),
      `${f.pathname.split('/').pop()} no puede tener su propia copia del VLOOKUP de la nota`)
    assert.match(src, /proveedores-notas-columna\.mjs/, 'sale de la lib compartida')
  }
})

test('la reposición va DESPUÉS de recortar el aire, o el colchón queda congelado', () => {
  const src = readFileSync(SCRIPT, 'utf8')
  const iRecorte = src.indexOf('await recortarElAire(')
  const iNotas = src.indexOf('await reponerLasNotasQueEstaCorridaBorro(')
  assert.ok(iRecorte > 0 && iNotas > 0, 'las dos llamadas existen')
  assert.ok(iNotas > iRecorte,
    'una fórmula que devuelve "" se lee como fórmula: escrita antes del recorte tapa todo el aire')
})

test('la fórmula va en locale es_AR: separador ";", nunca ","', () => {
  const f = formulaNota(31, 'B')
  assert.match(f, /^=IF\(\$B31="";"";IFERROR\(VLOOKUP\(\$B31;/)
  assert.ok(!f.includes(','), 'una coma acá devuelve error de fórmula recién en la celda')
  assert.match(f, /_PROVEEDORES_OS!\$A:\$C;3;FALSE/, 'la columna sale del contrato de la auxiliar')
})

test('la nota se ancla al PROVEEDOR de su propia fila, no a un número de fila', () => {
  // Si mañana la dinámica reordena, la nota se mueve con su proveedor porque pregunta por él.
  assert.equal(formulaNota(40, 'B').includes('$B40'), true)
  assert.equal(formulaNota(41, 'B').includes('$B41'), true)
})

test('requestsDeNotas exige la columna calculada y la del proveedor: nada tipeado', () => {
  assert.throws(() => requestsDeNotas({ sheetId: 1, filaRotulos: 28, desde: 29, hasta: 40, letraProveedor: 'B' }),
    /se calcula, no se adivina/)
  assert.throws(() => requestsDeNotas({ sheetId: 1, filaRotulos: 28, desde: 29, hasta: 40, columna: 6 }),
    /se ancla a el/)
})

test('un rango sin filas NO deja un rótulo colgado sin una sola nota', () => {
  const r = requestsDeNotas({ sheetId: 1, filaRotulos: 28, desde: 29, hasta: 29, columna: 6, letraProveedor: 'B' })
  assert.deepEqual(r, [], 'escribir "Qué hacer" sobre un cuadro que no existe es peor que no escribir')
})

test('los requests cubren rótulo, fórmulas y formato — y el rótulo es el del dueño', () => {
  const r = requestsDeNotas({ sheetId: 7, filaRotulos: 28, desde: 29, hasta: 33, columna: 6, letraProveedor: 'B' })
  assert.equal(r.length, 3)
  assert.equal(r[0].updateCells.rows[0].values[0].userEnteredValue.stringValue, ROTULO_NOTA)
  assert.equal(r[0].updateCells.range.startRowIndex, 27, 'el rótulo va en la fila 28, base 0 = 27')
  // 4 filas de fórmula: 29, 30, 31, 32 (hasta es EXCLUSIVO).
  assert.equal(r[1].updateCells.rows.length, 4)
  assert.match(r[1].updateCells.rows[0].values[0].userEnteredValue.formulaValue, /\$B29/)
  assert.match(r[1].updateCells.rows[3].values[0].userEnteredValue.formulaValue, /\$B32/)
  // Todas en la MISMA columna: la nota no puede caer encima del importe.
  for (const req of r) {
    const range = (req.updateCells ?? req.repeatCell).range
    assert.equal(range.startColumnIndex, 6)
    assert.equal(range.endColumnIndex, 7)
  }
})

test('el rango de la nota se mide por el CUADRO, no por la fila entera', () => {
  // Fila 33 tiene un resto en una columna de más a la derecha: no es del cuadro y no lo agranda.
  const visible = []
  visible[27] = ['Cada operación']            // fila 28: el subtítulo
  visible[28] = ['Fecha', 'Proveedor', 'N°']  // fila 29: los rótulos
  visible[29] = ['14/08/2026', 'Alumetal', '0038-1', 'Taller', 'Echeq', '392.905']
  visible[30] = ['', 'Mariana SA', '0015-147', 'Almacen', 'Cheque', '763.365']
  visible[32] = [null, null, null, null, null, null, null, 'resto de otro dueño']
  const r = rangoDeNotasDelDetalle({ visible, filaSubtitulo: 28, filaLimite: 60, colNota: 6, colchon: 4 })
  assert.equal(r.filaRotulos, 29)
  assert.equal(r.desde, 30)
  assert.equal(r.hasta, 36, 'dos filas de cuadro + 4 de colchón: el resto de la fila 33 no cuenta')
})

test('la nota NUNCA se derrama sobre la sección de abajo', () => {
  const visible = []
  visible[27] = ['Cada operación']
  visible[28] = ['Fecha', 'Proveedor']
  for (let f = 30; f <= 48; f++) visible[f - 1] = ['14/08/2026', 'Alumetal', 'x', 'y', 'z', '1']
  const r = rangoDeNotasDelDetalle({ visible, filaSubtitulo: 28, filaLimite: 50, colNota: 6, colchon: 4 })
  assert.ok(r.hasta <= 49, `el techo es la fila anterior a la sección 2 (50); dio ${r.hasta}`)
})

test('una nota más larga que su columna se avisa, no se trunca — es texto del dueño', () => {
  const notas = new Map([
    ['Alumetal', 'no es prioridad'],
    ['Hormiserv', 'Esperar a q escriba el cobrador para confirmar fecha de pago 16/8 · hormiserv · $10.719.777'],
  ])
  const largas = notasQueNoEntran(notas, 300) // 300px ⇒ ~42 caracteres
  assert.equal(largas.length, 1)
  assert.equal(largas[0].proveedor, 'Hormiserv')
  assert.equal(largas[0].nota.length, largas[0].caracteres, 'el texto entero, sin cortar')
})
