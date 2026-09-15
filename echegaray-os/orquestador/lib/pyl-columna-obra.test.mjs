// LA TRANSFORMACIÓN DE LAS FÓRMULAS DEL P&L AL INSERTAR «Obra» EN COMPRAS L.
//
// ═══ QUÉ DEFECTO ATRAPAN ═══
//
// `CF_GAS` importa `"Compras!A:Y"` como texto y `05_Dashboard_P&L` suma `CF_GAS!$M:$M` (Importe) y
// `CF_GAS!$O:$O` (Total). Google no ajusta ninguna de las dos cosas al insertar en otro archivo: el P&L
// pasa a sumar Concepto e IVA sin un error. Estos tests fijan qué se corre (desde la L), qué NO (A..K,
// los textos que no son el rango, las referencias a la propia pestaña) y qué se niega a tocar a ciegas.
// Las fórmulas son las del archivo real, en su locale es-AR (`;`).

import test from 'node:test'
import assert from 'node:assert/strict'
import { correrFormula, correrLetra, planDelPyl } from './pyl-columna-obra.mjs'

const DASH = '=SUMIFS(CF_GAS!$M:$M;CF_GAS!$C:$C;">="&B$4;CF_GAS!$C:$C;"<"&EDATE(B$4;1);CF_GAS!$I:$I;"Civil")'
  + '+SUMIFS(CF_GAS!$O:$O;CF_GAS!$C:$C;">="&B$4;CF_GAS!$C:$C;"<"&EDATE(B$4;1);CF_GAS!$I:$I;"Civil";CF_GAS!$M:$M;"")'

test('correrLetra: desde la L, una a la derecha; K y anteriores quedan', () => {
  assert.deepEqual(['A', 'K', 'L', 'M', 'O', 'Y', 'Z', 'AC', 'AD'].map((l) => correrLetra(l)),
    ['A', 'K', 'M', 'N', 'P', 'Z', 'AA', 'AD', 'AE'])
})

test('el SUMIFS del dashboard (es-AR): M→N y O→P; C e I no se mueven; los textos no se tocan', () => {
  const r = correrFormula(DASH)
  assert.equal(r.formula, DASH.replaceAll('CF_GAS!$M:$M', 'CF_GAS!$N:$N').replaceAll('CF_GAS!$O:$O', 'CF_GAS!$P:$P'))
  assert.deepEqual(r.columnas, { antes: ['C', 'I', 'M', 'O'], despues: ['C', 'I', 'N', 'P'] })
  assert.deepEqual(r.dudas, [])
  assert.match(r.formula, /">="&B\$4;/, 'la referencia a la propia pestaña (B$4) no es de CF_GAS')
})

test('el IMPORTRANGE: "Compras!A:Y" pasa a "Compras!A:Z"', () => {
  const r = correrFormula('=IMPORTRANGE("1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8";"Compras!A:Y")')
  assert.equal(r.formula, '=IMPORTRANGE("1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8";"Compras!A:Z")')
  assert.equal(r.importa, 'A:Y')
})

test('el nombre de pestaña entre comillas simples se conserva, en el texto y en la referencia', () => {
  assert.equal(correrFormula('=IMPORTRANGE("x";"\'Compras\'!A1:Y900")').formula, '=IMPORTRANGE("x";"\'Compras\'!A1:Z900")')
  assert.equal(correrFormula("=SUM('CF_GAS'!$X$2:$X)").formula, "=SUM('CF_GAS'!$Y$2:$Y)")
})

test('QUERY sobre el IMPORTRANGE: Col13 (M) → Col14; Col3 (C) no', () => {
  const f = '=QUERY(IMPORTRANGE("x";"Compras!A:Y");"select Col3, sum(Col13) where Col9 = \'Civil\' group by Col3";1)'
  assert.equal(correrFormula(f).formula,
    '=QUERY(IMPORTRANGE("x";"Compras!A:Z");"select Col3, sum(Col14) where Col9 = \'Civil\' group by Col3";1)')
})

test('un texto que no es el rango no se toca: "M" o "Obra" son valores, no columnas', () => {
  const f = '=SUMIFS(CF_GAS!$O:$O;CF_GAS!$K:$K;"M";CF_GAS!$J:$J;"Obra")'
  assert.equal(correrFormula(f).formula, '=SUMIFS(CF_GAS!$P:$P;CF_GAS!$K:$K;"M";CF_GAS!$J:$J;"Obra")')
})

test('otra pestaña con nombre parecido (XCF_GAS) no se corre', () => {
  assert.equal(correrFormula('=SUM(XCF_GAS!$M:$M)').cambio, false)
})

test('un rango que cruza la inserción se ensancha y lo avisa', () => {
  const r = correrFormula('=SUMPRODUCT(CF_GAS!$K$2:$M$900)')
  assert.equal(r.formula, '=SUMPRODUCT(CF_GAS!$K$2:$N$900)')
  assert.equal(r.avisos.length, 1)
})

test('DUDA y no se escribe: número de columna, INDIRECT, o la referencia adentro de un texto', () => {
  assert.equal(correrFormula('=VLOOKUP(A2;CF_GAS!$A:$Y;13;FALSE)').dudas.length, 1)
  assert.equal(correrFormula('=INDEX(CF_GAS!$A:$Y;5;15)').dudas.length, 1)
  assert.equal(correrFormula('=SUM(INDIRECT("CF_GAS!M2:M"))').dudas.length, 1)
})

const FORMULAS = [
  { hoja: 'CF_GAS', celda: 'A1', formula: '=IMPORTRANGE("x";"Compras!A:Y")' },
  { hoja: '05_Dashboard_P&L', celda: 'B9', formula: DASH },
  { hoja: '05_Dashboard_P&L', celda: 'D5', formula: '=CF_COB!J18+CF_COB!J19' },
  { hoja: '05_Dashboard_P&L', celda: 'A1', formula: '=TODAY()' },
]

test('plan: cambia el import y el dashboard; CF_COB se cuenta y NO se toca', () => {
  const p = planDelPyl(FORMULAS)
  assert.deepEqual(p.cambios.map((c) => `${c.hoja}!${c.celda}`), ['CF_GAS!A1', '05_Dashboard_P&L!B9'])
  assert.equal(p.citanCob, 1)
  assert.deepEqual(p.problemas, [])
})

test('plan: si el import ya dice A:Z NO se corre dos veces', () => {
  const ya = FORMULAS.map((f) => (f.celda === 'A1' && f.hoja === 'CF_GAS' ? { ...f, formula: '=IMPORTRANGE("x";"Compras!A:Z")' } : f))
  assert.match(planDelPyl(ya).problemas.join(), /esperaba A:Y/)
})

test('plan: sin el IMPORTRANGE de Compras no se corre nada', () => {
  assert.match(planDelPyl(FORMULAS.slice(1)).problemas.join(), /no encontré el IMPORTRANGE/)
})

test('plan: una duda en cualquier celda es un problema que frena la escritura', () => {
  const p = planDelPyl([...FORMULAS, { hoja: 'X', celda: 'C3', formula: '=VLOOKUP(A2;CF_GAS!$A:$Y;13;FALSE)' }])
  assert.match(p.problemas.join(), /X!C3/)
})

test('CF_GAS!$AC$15 (fuera de A:Y) es una celda PROPIA de la copia: no se corre, se avisa', () => {
  // Las 24 celdas reales `=CF_GAS!$AC$15/12` y `=CF_GAS!$AD$15/12` del dashboard (dry del 15/09).
  const r = correrFormula('=CF_GAS!$AC$15/12')
  assert.equal(r.formula, '=CF_GAS!$AC$15/12')
  assert.equal(r.cambio, false)
  assert.equal(r.avisos.length, 1)
  assert.equal(correrFormula('=CF_GAS!$Y$15').formula, '=CF_GAS!$Z$15', 'la Y sí es Compras: pasa a Z')
})

test('un rango que empieza adentro de lo importado y termina afuera es una DUDA', () => {
  assert.equal(correrFormula('=SUM(CF_GAS!$X$2:$AC$9)').dudas.length, 1)
})

test('plan: el límite sale del rango esperado del import, no de una constante escondida', () => {
  const p = planDelPyl([
    { hoja: 'CF_GAS', celda: 'A1', formula: '=IMPORTRANGE("x";"Compras!A:AB")' },
    { hoja: 'D', celda: 'B2', formula: '=CF_GAS!$AA$3' },
  ], { rangoEsperado: 'A:AB' })
  assert.equal(p.cambios.find((c) => c.hoja === 'D').despues, '=CF_GAS!$AB$3')
})
