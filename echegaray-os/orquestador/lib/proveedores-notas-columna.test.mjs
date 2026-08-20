// LA COLUMNA "QUÉ HACER": QUE NO SE PUEDA VOLVER A PERDER.
//
// El 14/08 `proveedores-dos-cuadros.mjs --aplicar` corrió solo, limpió su rectángulo A:G y las
// catorce notas del dueño desaparecieron de la pestaña sin un solo error. Cada test de acá ataca un
// eslabón de esa cadena: si se revierte el arreglo, alguno se pone rojo.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  formulaNota, notasQueNoEntran, requestsDeNotas, ROTULO_NOTA,
} from './proveedores-notas-columna.mjs'

const SCRIPT = new URL('../scripts/proveedores-dos-cuadros.mjs', import.meta.url)
const NOTAS = new URL('../scripts/proveedores-notas-visibles.mjs', import.meta.url)
const CUADRO_A = new URL('./proveedores-cuadro-a.mjs', import.meta.url)

test('EL DEFECTO DEL 14/08: el generador que borra la columna la repone en la misma corrida', () => {
  const src = readFileSync(SCRIPT, 'utf8')
  // Limpia A:G — la columna de la nota entra en ese rectángulo.
  assert.match(src, /endColumnIndex: 7/, 'el generador sigue limpiando siete columnas')
  // Y por eso TIENE que reponerla él mismo: sin esto, correrlo suelto vuelve a borrar las notas.
  assert.match(src, /reponerLasColumnasQueEstaCorridaBorro/,
    'el generador que vacía A:G tiene que reponer "Qué hacer" en la misma corrida')
  // Con los MISMOS requests que el otro escritor. El generador los pide por `requestsDelCuadroA`,
  // que es quien arma las dos columnas del cuadro; ésa a su vez llama a `requestsDeNotas`. La cadena
  // se verifica entera: cortarla en cualquier eslabón devuelve el defecto de las notas borradas.
  assert.match(src, /requestsDelCuadroA/, 'y con los MISMOS requests que el otro escritor')
  assert.match(readFileSync(CUADRO_A, 'utf8'), /requestsDeNotas/,
    'proveedores-cuadro-a tiene que delegar la nota en la lib compartida, no tipearla de nuevo')
})

test('los dos escritores comparten la fórmula: ninguno la vuelve a tipear', () => {
  for (const f of [SCRIPT, NOTAS, CUADRO_A]) {
    const src = readFileSync(f, 'utf8')
    assert.ok(!/VLOOKUP\(\$/.test(src),
      `${f.pathname.split('/').pop()} no puede tener su propia copia del VLOOKUP de la nota`)
  }
  // Y la lib compartida es la única fuente: los dos escritores llegan a ella, directo o por cuadro-a.
  assert.match(readFileSync(NOTAS, 'utf8'), /proveedores-notas-columna\.mjs/)
  assert.match(readFileSync(CUADRO_A, 'utf8'), /proveedores-notas-columna\.mjs/)
})

test('la reposición va DESPUÉS de recortar el aire, o el colchón queda congelado', () => {
  const src = readFileSync(SCRIPT, 'utf8')
  const iRecorte = src.indexOf('await recortarElAire(')
  const iNotas = src.indexOf('await reponerLasColumnasQueEstaCorridaBorro(')
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

// ═══ DÓNDE LLEGA LA COLUMNA: SE MUDÓ A `proveedores-cuadro-a.mjs` (14/08) ═══
//
// El rango se medía sobre el cuadro de DETALLE, donde la nota vivió doce horas. Volvió al cuadro que
// abre la sección —el del proveedor— y con ella la medición: `rangoDelCuadroA`, con sus tests.

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

// ═══ UNA NOTA LARGA NO DESARMA LA GRILLA (14/08/2026) ═══
//
// En la captura que mandó el dueño, `Proveedores!D20` (Hormiserv) tiene ~200 caracteres —"Esperar a q
// escriba el cobrador… pedir bonificacion de 5m3, cerrar para pagar"— en una columna de 300px, y se
// derramaba sobre E, F y G tapando el cuadro de al lado. Es una de las cosas que él ve como "el diseño
// está roto".
//
// El texto es SUYO: no se recorta ni se edita. Lo que se decide es cómo se muestra, y eso es formato.
// Sin `wrapStrategy` declarada la celda hereda lo que haya, y el default para texto es derramar.
test('EL DEFECTO · la columna de notas declara CLIP: sin eso una nota larga tapa el cuadro de al lado', () => {
  const r = requestsDeNotas({ sheetId: 1, filaRotulos: 18, desde: 19, hasta: 30, columna: 3, letraProveedor: 'A' })
  const fmt = r.find((x) => x.repeatCell)
  assert.ok(fmt, 'el bloque tiene que traer su pedido de formato')
  assert.equal(fmt.repeatCell.cell.userEnteredFormat.wrapStrategy, 'CLIP',
    'sin CLIP la nota derrama sobre las columnas de la derecha')
  assert.match(fmt.repeatCell.fields, /wrapStrategy/,
    'declarar el valor sin pedirlo en `fields` no cambia nada en el archivo')
})

test('el texto de la nota no se toca: lo que cambia es el formato, nunca el contenido', () => {
  const r = requestsDeNotas({ sheetId: 1, filaRotulos: 18, desde: 19, hasta: 21, columna: 3, letraProveedor: 'A' })
  const valores = r.filter((x) => x.updateCells).flatMap((x) => x.updateCells.rows)
  for (const fila of valores) {
    for (const v of fila.values) {
      const f = v.userEnteredValue.formulaValue
      if (!f) continue
      assert.doesNotMatch(f, /LEFT\(|MID\(|TRUNC|SUBSTITUTE\(/,
        'la fórmula recorta el texto del dueño: el contenido es suyo, sólo se decide cómo se ve')
    }
  }
})
