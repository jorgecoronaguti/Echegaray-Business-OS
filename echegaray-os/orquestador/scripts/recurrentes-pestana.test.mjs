// LOS TRES DEFECTOS DE "RECURRENTES", CADA UNO CON SU TEST.
//
// 1. EL ENCABEZADO FANTASMA DE LA FILA 2. Las filas se armaban con `Array(ANCHO).fill('')`, y la
//    fusión lee la cadena vacía como "no es mi celda, preservala". Cuando el layout creció, el
//    encabezado de la versión anterior quedó clavado en la fila 2 —los doce primeros-de-mes en crudo,
//    pintados como moneda: "$46.023", "$46.054"…— y una fila de ceros en la 3. Se veía en el archivo
//    real el 04/08, sin un solo #ERROR.
// 2. EL CONTROL EN ROJO CON LOS DATOS PERFECTOS. La diferencia daba -0,004 y el formato la dibujaba
//    "-$0" en rojo. Un control que grita por medio centavo se deja de mirar.
// 3. UNA COLUMNA DE PROSA POR FILA DE CONTROL. Cuatro oraciones que el dueño borraba a mano y volvían
//    en cada corrida del worker.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, formatosPropios } from './recurrentes-pestana.mjs'
import { fusionar, tiene, VACIO } from '../lib/preservar-anotaciones.mjs'
import { CONTADOR, MONEDA_CUERPO, MONEDA_TOTAL, MONEDA_CONTROL } from '../lib/formato-statement.mjs'

const g = grilla(['Movistar', 'RSV', 'Robles Jose Maria'])

test('EL FANTASMA: la fusión borra el encabezado que dejó el layout anterior en la fila 2', () => {
  // "Antes": la pestaña real tenía en la fila 2 la nota del generador MÁS los doce seriales de fecha
  // y los tres rótulos de la derecha, sobrevivientes de cuando el encabezado vivía ahí.
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[1] = ['(la nota vieja)', 46023, 46054, 46082, 46113, 46143, 46174, 46204, 46235, 46266, 46296, 46327, 46357, 'Total real', 'Meses con gasto', 'Promedio mensual']
  enLaPestana[2] = ['1 · EL GASTO RECURRENTE, MES A MES', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  const fusion = fusionar(g.filas, enLaPestana)
  for (let c = 1; c <= 15; c++) {
    assert.equal(fusion[1][c], '', `B2:P2 tiene que quedar vacía; en la columna ${c} sobrevivió "${fusion[1][c]}"`)
    assert.equal(fusion[2][c], '', `la fila del título de sección no lleva números; en la columna ${c} sobrevivió "${fusion[2][c]}"`)
  }
  assert.equal(fusion[1][0], g.filas[1][0], 'el subtítulo del generador sí se escribe')
})

test('lo que la persona anota FUERA del ancho del bloque se sigue preservando', () => {
  // El centinela no puede convertirse en una licencia para barrer: más allá del footprint del
  // generador, la celda es del dueño y no se toca. Es la contracara de la regla, y la que ya costó
  // catorce fechas borradas dos veces.
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[4] = Array(40).fill('')
  enLaPestana[4][35] = 'ojo: Movistar sube en septiembre'
  const fusion = fusionar(g.filas, enLaPestana)
  assert.equal(fusion[4][35], 'ojo: Movistar sube en septiembre')
})

test('EL FALSO ROJO: la diferencia se redondea a peso dentro de la fórmula', () => {
  const dif = String(g.filas[g.fDif - 1][1])
  assert.match(dif, /^=ROUND\(/, 'sin ROUND, medio centavo de residuo pintaba el control de rojo')
  assert.match(dif, /;0\)$/, 'redondeo a peso: en esta empresa no hay decisión que dependa de centavos')
})

test('NI UNA COLUMNA DE PROSA: ninguna fila lleva un párrafo al lado del número', () => {
  for (const [i, f] of g.filas.entries()) {
    for (const [j, c] of f.entries()) {
      // Se miran sólo las columnas VISIBLES (A..P): la columna auxiliar oculta lleva un cartel de
      // "no borrar" que nadie ve, y los doce encabezados son fechas, no texto.
      if (j === 0 || j >= 16 || c instanceof Date || !tiene(c)) continue
      const t = String(c)
      if (t.startsWith('=')) continue
      assert.ok(t.length <= 40 && !/\. /.test(t),
        `fila ${i + 1}, columna ${j + 1}: "${t.slice(0, 60)}" es prosa. El dueño las borra y vuelven en cada corrida.`)
    }
  }
})

test('el subtítulo entra en una línea: el muro de texto se cortaba contra enero', () => {
  assert.ok(String(g.filas[1][0]).length <= 130, `el subtítulo mide ${String(g.filas[1][0]).length} caracteres`)
})

test('EL CONTADOR NO ES PLATA: "Meses con gasto" declara su propio formato', () => {
  const reqs = formatosPropios({ sheetId: 1, rows: 60 }, g)
  const patrones = reqs
    .filter((r) => r.repeatCell?.cell?.userEnteredFormat?.numberFormat)
    .map((r) => ({ rango: r.repeatCell.range, nf: r.repeatCell.cell.userEnteredFormat.numberFormat }))
  // La columna O (índice 14) sobre las filas de proveedores tiene que terminar en formato de contador:
  // gana el ÚLTIMO request que la cubre, que es como los aplica la API.
  const cubren = patrones.filter((p) => p.rango.startColumnIndex <= 14 && p.rango.endColumnIndex > 14
    && p.rango.startRowIndex <= g.f0 - 1 && p.rango.endRowIndex >= g.f1)
  assert.deepEqual(cubren.at(-1).nf, CONTADOR, 'antes heredaba el formato de moneda y mostraba "$5"')
})

test('el "$" es del total: el cuerpo va sin símbolo y el cero se dibuja raya', () => {
  assert.equal(MONEDA_CUERPO.pattern.includes('$'), false)
  assert.ok(MONEDA_CUERPO.pattern.endsWith('"—"'))
  assert.ok(MONEDA_TOTAL.pattern.includes('"$"'))
  // El rojo es del control, no del número: un negativo del cuerpo (una nota de crédito) no es un error.
  assert.equal(MONEDA_CUERPO.pattern.includes('[Red]'), false)
  assert.ok(MONEDA_CONTROL.pattern.includes('[Red]'))
})

test('la fila del encabezado no se mueve: el Cash Flow Mensual la lee por posición absoluta', () => {
  assert.equal(g.filas[3][0], 'Proveedor', 'FILA_CAB = 4, y las fórmulas de cada mes la referencian en absoluto')
  assert.ok(g.filas[3][1] instanceof Date)
  assert.equal(g.filas[g.fTot - 1][0], 'TOTAL', 'el rótulo es el ancla que usa cash-flow-lineas')
})

test('cada celda que el generador deja vacía lleva el centinela, no cadena vacía', () => {
  const separadora = g.filas[g.fTot] // la fila en blanco entre el total y el bloque de control
  assert.ok(separadora.every((c) => c === VACIO), 'una separadora con "" preserva lo que hubiera abajo')
})
