// EL CUADRO QUE ABRE LA SECCIÓN 1: QUE EL EJE NO SE PUEDA VOLVER A MOVER SIN QUE ESTO SE PONGA ROJO.
//
// El 14/08 el eje pasó del proveedor a la fecha de pago y el dueño lo rechazó el mismo día:
// *"roto proveedores … LA BASE SIEMPRE ES EL NOMBRE DEL PROVEEDOR … rehacer"*. Con la fecha al
// frente se perdieron tres cosas y cada test de acá ataca una:
//
//   1. el ranking "a quién le debo más" — el cuadro abre por el nombre y ordena por la plata;
//   2. las doce notas del dueño (D17:D28) — la nota se ancla al NOMBRE, en la columna A;
//   3. el presupuesto de filas — una dinámica que no entra queda en #REF! y la sección desaparece.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COL_PROVEEDOR, colNota, colVence, formulaVence, letra, rangoDelCuadroA, requestsDelCuadroA,
  reservaDelCuadroA, ROTULO_VENCE, rotulosDelCuadroA, ROTULOS_A_LA_DERECHA,
} from './proveedores-cuadro-a.mjs'
import { ROTULO_NOTA } from './proveedores-notas-columna.mjs'
import { anchoDelPivot, COL, pivotSeccion1, VISTA } from './proveedores-pivot-seccion1.mjs'
import { geometriaSeccion1 } from './proveedores-bloque-vivo.mjs'
import { ANCHOS_PROVEEDORES } from './proveedores-frontera.mjs'
import { altoDeRotulos, rotulosQueNoEntran } from './proveedores-rotulos.mjs'

const fuente = { sheetId: 7, startRowIndex: 2, endRowIndex: 900, startColumnIndex: 0, endColumnIndex: 38 }

test('EL DEFECTO 1 · la nota se ancla a la columna donde el pivot escribe el NOMBRE', () => {
  // Cuando el eje pasó a la fecha, la columna A dejó de tener nombres: la búsqueda siguió viva,
  // apuntada a fechas, y devolvió vacío en las doce notas. En silencio. Acá el ancla se DERIVA del
  // pivot, así que no puede quedar apuntando a una columna que ya no tiene proveedores.
  const p = pivotSeccion1(fuente, { vista: VISTA.POR_PROVEEDOR })
  assert.equal(p.rows[COL_PROVEEDOR].sourceColumnOffset, COL.proveedor,
    'la columna a la que se ancla la nota no es la que emite el nombre del proveedor')
  const reqs = requestsDelCuadroA({ sheetId: 3, filaRotulos: 17, desde: 18, hasta: 24 })
  const formulas = reqs.flatMap((r) => (r.updateCells?.rows ?? [])
    .map((f) => f.values[0].userEnteredValue?.formulaValue).filter(Boolean))
  assert.ok(formulas.some((f) => f.includes('VLOOKUP($A18')), 'la nota no busca por el nombre de la columna A')
})

test('EL DEFECTO 2 · la nota vuelve a la D, con el ancho que el dueño le tenía', () => {
  // D17:D28 eran doce notas suyas. La columna se calcula del pivot (1 campo + 1 valor + "Vence"),
  // no se tipea: si mañana el cuadro gana un valor, la nota se corre en vez de caer sobre el importe.
  assert.equal(colVence(), 2, 'el vencimiento va en la C, la primera libre a la derecha del pivot')
  assert.equal(colNota(), 3, 'la nota va en la D, que es donde el dueño la escribió')
  assert.equal(ANCHOS_PROVEEDORES[colNota()], 300, 'la nota necesita 300px o se ve cortada')
  assert.equal(letra(colNota()), 'D')
})

test('las cuatro columnas no pasan de la G: la H es del dueño', () => {
  const ancho = anchoDelPivot(pivotSeccion1(fuente, { vista: VISTA.POR_PROVEEDOR })) + 2
  assert.equal(ancho, 4)
  assert.ok(colNota() < 7, 'el bloque se metió en la H, que es la columna "Comentarios" del dueño')
})

test('LA FÓRMULA DEL VENCIMIENTO lee el saldo de Compras!AL, no rehace la cuenta de los tramos', () => {
  // "tomaba mal columnas de compras": la deuda de una fila sale de T/U/W, donde un parcial NEGATIVO
  // es lo que FALTA y no un pago. Esa aritmética tiene un solo dueño (deuda-por-tramos → Compras!AL)
  // y esta columna la consume. Una segunda cuenta es una segunda respuesta.
  const f = formulaVence(18)
  assert.ok(f.includes('Compras!$AL$4:$AL;">0"'), 'no filtra por el saldo vivo de Compras!AL')
  for (const col of ['$T$', '$U$', '$W$']) {
    assert.ok(!f.includes(`Compras!${col}`), `la fórmula rehace la cuenta de los tramos (${col})`)
  }
})

test('la fórmula del vencimiento va en locale es_AR: separador ";", nunca ","', () => {
  const f = formulaVence(18)
  assert.ok(!f.includes(','), 'una coma acá devuelve error de fórmula recién en la celda')
  assert.match(f, /^=IF\(\$A18="";"";/, 'sin la guarda, las filas del colchón muestran un 1899')
})

test('un MINIFS sin ninguna fecha da 0, y 0 formateado como fecha es 30/12/1899', () => {
  // Hay filas de Compras con la palabra "Pendiente" donde va la fecha. Si un proveedor sólo tiene
  // de ésas, MINIFS no encuentra ningún número y devuelve 0. Una celda vacía dice "no tiene fecha";
  // un 1899 no dice nada y encima se ordena antes que todo.
  assert.match(formulaVence(18), /IF\(venceProx=0;"";venceProx\)/)
  // El nombre del LET no puede parecerse a una referencia A1 o Sheets lo lee como celda (#NAME?).
  assert.ok(!/\bLET\([A-Z]{1,3}\d/.test(formulaVence(18)))
})

test('la fórmula se ancla a SU fila: si la dinámica reordena, el vencimiento se mueve con su dueño', () => {
  assert.ok(formulaVence(40).includes('$A40'))
  assert.ok(formulaVence(41).includes('$A41'))
})

test('EL DEFECTO 3 · el rango se mide por el CUADRO, no por la fila entera', () => {
  // Una fila de separación con un resto en cualquier columna deja de estar en blanco: midiendo la
  // fila entera el conteo sigue de largo y devolvió 31 donde el cuadro tenía 11.
  const visible = []
  visible[16] = ['Proveedor', 'Se le debe']       // fila 17: los rótulos
  visible[17] = ['Hormiserv', '10.719.777']       // 18
  visible[18] = ['Alumetal', '5.174.285']         // 19
  visible[20] = [null, null, null, null, null, null, null, 'resto de otro dueño'] // 21
  visible[24] = ['Cada operación']                // 25: el tope
  const r = rangoDelCuadroA({ visible, filaRotulos: 17, filaTope: 25 })
  assert.equal(r.emitidas, 2, 'el resto de la fila 21 no es del cuadro y no lo agranda')
  assert.equal(r.desde, 18)
  assert.equal(r.hasta, 23, 'dos filas de cuadro + 3 de colchón')
})

test('las fórmulas NUNCA se derraman sobre el cuadro de abajo', () => {
  // Una fórmula sobre la fila del subtítulo lo tapa; y sobre el cuerpo del detalle, Google se niega
  // a renderizar la dinámica y la sección de abajo desaparece entera.
  const visible = []
  visible[16] = ['Proveedor', 'Se le debe']
  for (let f = 18; f <= 30; f++) visible[f - 1] = ['Alumetal', '1']
  const r = rangoDelCuadroA({ visible, filaRotulos: 17, filaTope: 31 })
  assert.ok(r.hasta <= 31, `el tope es la fila del subtítulo (31); dio ${r.hasta}`)
  const reqs = requestsDelCuadroA({ sheetId: 3, filaRotulos: 17, ...r })
  for (const q of reqs) {
    const rango = q.updateCells?.range ?? q.repeatCell?.range
    assert.ok(rango.endRowIndex <= 30, `un request llega hasta la fila ${rango.endRowIndex} y el tope es 30`)
  }
})

test('EL COLCHÓN EXISTE: el proveedor que entre mañana ya tiene su fórmula esperándolo', () => {
  const visible = []
  visible[16] = ['Proveedor', 'Se le debe']
  visible[17] = ['Hormiserv', '1']
  visible[30] = ['Cada operación']
  const r = rangoDelCuadroA({ visible, filaRotulos: 17, filaTope: 31 })
  assert.ok(r.hasta - r.desde > r.emitidas,
    'sin colchón, el proveedor nuevo sale sin vencimiento ni nota hasta la corrida siguiente')
})

test('un cuadro sin ni una fila NO deja un rótulo colgado', () => {
  assert.deepEqual(requestsDelCuadroA({ sheetId: 3, filaRotulos: 17, desde: 18, hasta: 18 }), [])
})

test('el rango se niega a adivinar la geometría', () => {
  assert.throws(() => rangoDelCuadroA({ visible: [], filaRotulos: 0, filaTope: 25 }), /base 1/)
  assert.throws(() => rangoDelCuadroA({ visible: [], filaRotulos: 30, filaTope: 25 }), /debajo de los rótulos/)
})

test('LOS CUATRO RÓTULOS entran en su columna: "Qué hacer" no se puede ver cortado', () => {
  const cabecera = []
  cabecera[COL.proveedor] = 'Proveedor'
  assert.deepEqual(rotulosDelCuadroA(cabecera, ['Se le debe']),
    ['Proveedor', 'Se le debe', ROTULO_VENCE, ROTULO_NOTA])
  // Dos de los cuatro los escribe el pivot y dos este módulo: el alto de la fila se calcula con LOS
  // CUATRO. Con sólo los del pivot, "Qué hacer" queda cortado y nadie se entera.
  assert.deepEqual(rotulosQueNoEntran(rotulosDelCuadroA(cabecera), ANCHOS_PROVEEDORES), [])
  assert.ok(altoDeRotulos(rotulosDelCuadroA(cabecera), ANCHOS_PROVEEDORES) > 0)
})

test('la plata y la fecha se alinean a la derecha; el nombre y la nota, a la izquierda', () => {
  assert.deepEqual([...ROTULOS_A_LA_DERECHA], [1, 2])
  assert.ok(!ROTULOS_A_LA_DERECHA.includes(COL_PROVEEDOR))
  assert.ok(!ROTULOS_A_LA_DERECHA.includes(colNota()))
})

test('la columna del vencimiento se declara DATE en cada corrida: el formato es del archivo', () => {
  // Ahí vivía el número de comprobante, en TEXTO. Sin declararlo, la fecha sale como `46238`.
  const fmt = requestsDelCuadroA({ sheetId: 3, filaRotulos: 17, desde: 18, hasta: 24 })
    .find((r) => r.repeatCell?.range?.startColumnIndex === colVence())
  assert.equal(fmt.repeatCell.cell.userEnteredFormat.numberFormat.type, 'DATE')
  assert.equal(fmt.repeatCell.cell.userEnteredFormat.numberFormat.pattern, 'dd/mm/yyyy')
})

test('EL GENERADOR REPONE LAS DOS COLUMNAS EN LA MISMA CORRIDA QUE LAS BORRA', () => {
  // Limpia A:G y las dos columnas viven ahí. Si la reposición se delega a otro paso del pipeline,
  // correr el generador suelto vuelve a borrar las notas del dueño sin un solo error.
  const src = readFileSync(new URL('../scripts/proveedores-dos-cuadros.mjs', import.meta.url), 'utf8')
  assert.match(src, /endColumnIndex: 7/, 'el generador sigue limpiando siete columnas')
  assert.match(src, /requestsDelCuadroA/, 'no repone "Vence" y "Qué hacer" en la misma corrida')
  const iRecorte = src.indexOf('await recortarElAire(')
  const iRepone = src.indexOf('await reponerLasColumnasQueEstaCorridaBorro(')
  assert.ok(iRecorte > 0 && iRepone > iRecorte,
    'una fórmula que devuelve "" se lee como fórmula: escrita antes del recorte tapa todo el aire')
})

// ═══ EL DEFECTO 4: EL PLANIFICADOR DEJÓ DE PODER UBICARSE (14/08) ═══
//
// `proveedores-plan-vivo.mjs` —el único auditor read-only de la sección— usa `geometriaSeccion1`, que
// exige la palabra "Proveedor" EN LA COLUMNA A y al menos cuatro rótulos en la fila. Con la fecha al
// frente, la A decía "Fecha prevista de pago (día)" y el script moría con "no encontré la fila de
// rótulos de la sección 1". Con el proveedor de vuelta al eje y sus cuatro columnas, se ubica solo.
test('EL DEFECTO 4 · la fila de rótulos cumple lo que exige el planificador read-only', () => {
  const cabecera = []
  cabecera[COL.proveedor] = 'Proveedor'
  const rotulos = rotulosDelCuadroA(cabecera)
  const filas = [
    ['1 · QUÉ SE DEBE Y CUÁNDO'], [], ['✓ el detalle cierra con el titular'],
    rotulos,
    ['Hormiserv', 10719777, 46265, 'Esperar al cobrador'],
    [], ['2 · CUENTA CORRIENTE POR PROVEEDOR'],
  ]
  const geo = geometriaSeccion1(filas)
  assert.equal(geo.filaEncabezado, 4, 'geometriaSeccion1 no encontró la fila de rótulos del cuadro')
  assert.equal(geo.encabezados[COL_PROVEEDOR], 'Proveedor', 'la columna A del cuadro no dice "Proveedor"')
  assert.ok(rotulos.filter(Boolean).length >= 4,
    'geometriaSeccion1 exige cuatro rótulos: con tres el planificador vuelve a morir')
})

test('LA RESERVA SE CUENTA COMO AGRUPA EL PIVOT: por el valor crudo, más una de colchón', () => {
  const fila = (prov) => { const f = []; f[COL.proveedor] = prov; return f }
  // Dos facturas del mismo proveedor son UNA fila del cuadro.
  assert.equal(reservaDelCuadroA([fila('RSV'), fila('RSV'), fila('Alumetal')]), 2 + 1)
  // ═══ EL DEFECTO: "RSV" y "RSV " son UNO con trim() y DOS para la dinámica ═══
  // Esa fila de más se come el aire hasta el subtítulo, el subtítulo cae adentro del cuadro y Google
  // se niega a renderizar: la sección desaparece entera y no hay un solo error.
  assert.equal(reservaDelCuadroA([fila('RSV'), fila('RSV ')]), 2 + 1,
    'contó con trim(): la dinámica va a emitir una fila más de las reservadas')
  // Una deuda sin nombre también arma su grupo: entra, y ocupa su fila.
  assert.equal(reservaDelCuadroA([fila('RSV'), fila('')]), 2 + 1)
  assert.equal(reservaDelCuadroA([]), 1, 'sin deuda igual se reserva el colchón')
})
