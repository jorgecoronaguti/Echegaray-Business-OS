// LAS FECHAS DE LAS PESTAÑAS CONTRA EL EXTRACTO, VERIFICADAS EN FRÍO. Sin red, sin escribir una celda.
//
// Todos los casos de este archivo salen del archivo vivo leído el 17/08/2026 con UNFORMATTED_VALUE,
// ventana del extracto 46170 → 46248. Están acá con su fila real para que se puedan volver a mirar.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cruzarFechas, VEREDICTO_FECHA, HOLGURA_FECHA, corregibles, resumen,
} from './fechas-contra-extracto.mjs'

const VENTANA = { desde: 46170, hasta: 46248 }

/** Los débitos del extracto que estos casos necesitan, con su fila real de `_BANCO_RAW`. */
const BANCO = [
  { fecha: 46240, importe: 470945, fila: 358 },   // «Cheque debitado» — el que dispara todo
  { fecha: 46247, importe: 510000, fila: 384 },   // «Cheque debitado»
  { fecha: 46174, importe: 351769, fila: 41 },    // Movistar
  { fecha: 46174, importe: 46921, fila: 42 },     // Movistar
  { fecha: 46210, importe: 1282811, fila: 214 },  // cuota del prendario de julio
  { fecha: 46181, importe: 8974572, fila: 78 },   // ARCA
]

test('EL PESO DE DIFERENCIA ES LO QUE SEPARA DOS CHEQUES, no un redondeo', () => {
  // Cheques Emitidos f81: FISICO 313 · Corralon Progreso · $470.945 · pago 46220 · DEBITADO SI
  // Cheques Emitidos f93: FISICO 312 · Corralon Progreso · $470.944 · pago 46251 · DEBITADO No
  //
  // El débito de $470.945 del 06/08 empareja EXACTO con el 313 y NO con el 312. Mover la fecha del
  // 312 a esa fecha sería corregir el cheque equivocado y dejar al que sí se debitó sin su fecha.
  const filas = [
    { id: 'FISICO 313', fecha: 46220, importe: 470945 },
    { id: 'FISICO 312', fecha: 46251, importe: 470944 },
  ]
  const v = cruzarFechas(filas, BANCO, { ventana: VENTANA })
  assert.equal(v[1].veredicto, VEREDICTO_FECHA.sinTestigo,
    'el 312 no tiene ningún débito de su importe: no se toca')
  // El 313 sí tiene testigo, pero a 20 días: fuera de la holgura, se REPORTA y no se corrige.
  assert.equal(v[0].veredicto, VEREDICTO_FECHA.lejos)
  assert.equal(v[0].dias, 20)
  assert.equal(v[0].fechaBanco, 46240)
})

test('EL DEFECTO: la fecha corrida se corrige con la del banco cuando el emparejamiento es 1 a 1', () => {
  // Compras f566/f567: las dos cuotas de Movistar con Fecha de caja 46179 y débito el 46174.
  const filas = [
    { id: 'Compras!AD566', fecha: 46179, importe: 351769 },
    { id: 'Compras!AD567', fecha: 46179, importe: 46921 },
  ]
  const v = cruzarFechas(filas, BANCO, { ventana: VENTANA })
  assert.deepEqual(v.map((x) => x.veredicto), [VEREDICTO_FECHA.corregir, VEREDICTO_FECHA.corregir])
  assert.deepEqual(corregibles(v).map((x) => [x.id, x.fechaBanco]),
    [['Compras!AD566', 46174], ['Compras!AD567', 46174]])
  assert.deepEqual(v.map((x) => x.dias), [-5, -5])
})

test('SEIS FILAS CON EL MISMO IMPORTE NO LAS IDENTIFICA UN DÉBITO: la cuota del prendario', () => {
  // Compras f456/f467/f481/f488/f495/f502: seis filas «Banco» de $1.282.811 — una pagada y cinco
  // proyectadas. El extracto tiene un débito de ese importe el 46210. Emparejarlo con la fila de
  // agosto correría la fecha 31 días hacia atrás y la de julio quedaría sin testigo.
  //
  // POR ESO LA REGLA ES 1 A 1 DE LOS DOS LADOS y no "un solo débito con ese importe": del lado del
  // banco es único, y aun así no identifica nada.
  const filas = [
    { id: 'f456', fecha: 46210, importe: 1282811 }, { id: 'f467', fecha: 46241, importe: 1282811 },
    { id: 'f481', fecha: 46272, importe: 1282811 }, { id: 'f488', fecha: 46302, importe: 1282811 },
    { id: 'f495', fecha: 46333, importe: 1282811 }, { id: 'f502', fecha: 46363, importe: 1282811 },
  ]
  const v = cruzarFechas(filas, BANCO, { ventana: VENTANA })
  for (const x of v.filter((x) => x.veredicto !== VEREDICTO_FECHA.fueraDeVentana)) {
    assert.equal(x.veredicto, VEREDICTO_FECHA.ambiguoPlanilla,
      `${x.id}: seis filas del mismo importe no se pueden distinguir por el importe`)
  }
  assert.equal(corregibles(v).length, 0, 'ninguna de las seis se corrige')
})

test('DOS DÉBITOS DEL MISMO IMPORTE TAMPOCO IDENTIFICAN: elegir sería inventar', () => {
  const banco = [{ fecha: 46200, importe: 500000, fila: 9 }, { fecha: 46230, importe: 500000, fila: 77 }]
  const v = cruzarFechas([{ id: 'x', fecha: 46205, importe: 500000 }], banco, { ventana: VENTANA })
  assert.equal(v[0].veredicto, VEREDICTO_FECHA.ambiguoBanco)
})

test('LA HOLGURA ES LA MENSUAL DEL REPO, no un número nuevo', async () => {
  const { HOLGURA_MENSUAL } = await import('./libro-cruce-banco.mjs')
  assert.equal(HOLGURA_FECHA, HOLGURA_MENSUAL,
    'con una holgura de medio mes o más, el débito de un mes explica el vencimiento del siguiente')
})

test('lo que está fuera de la ventana del extracto no se juzga', () => {
  const v = cruzarFechas([{ id: 'vieja', fecha: 46000, importe: 351769 }], BANCO, { ventana: VENTANA })
  assert.equal(v[0].veredicto, VEREDICTO_FECHA.fueraDeVentana)
  assert.equal(corregibles(v).length, 0)
})

test('el resumen lleva la PLATA de cada veredicto, no sólo el conteo', () => {
  // Una fecha corrida en $16M y una en $8.000 no se distinguen contando filas.
  const filas = [
    { id: 'a', fecha: 46179, importe: 351769 },
    { id: 'b', fecha: 46181, importe: 8974572 },
    { id: 'c', fecha: 46251, importe: 470944 },
  ]
  const r = resumen(cruzarFechas(filas, BANCO, { ventana: VENTANA }))
  assert.equal(r[VEREDICTO_FECHA.corregir].filas, 1)
  assert.equal(r[VEREDICTO_FECHA.corregir].monto, 351769)
  assert.equal(r[VEREDICTO_FECHA.coincide].filas, 1)
  assert.equal(r[VEREDICTO_FECHA.coincide].monto, 8974572)
  assert.equal(r[VEREDICTO_FECHA.sinTestigo].monto, 470944)
})

test('un débito respalda UNA fila: el que ya se usó no vuelve a estar disponible', () => {
  // Dos filas distintas del mismo importe y un solo débito: es el caso `ambiguoPlanilla`, y ninguna
  // se lleva el débito. Si alguna se lo llevara, la otra quedaría "sin testigo" por haber llegado
  // segunda — el orden de lectura decidiendo un hecho económico.
  const banco = [{ fecha: 46200, importe: 700000, fila: 5 }]
  const v = cruzarFechas([{ id: 'p', fecha: 46201, importe: 700000 }, { id: 'q', fecha: 46202, importe: 700000 }], banco, { ventana: VENTANA })
  assert.deepEqual(v.map((x) => x.veredicto), [VEREDICTO_FECHA.ambiguoPlanilla, VEREDICTO_FECHA.ambiguoPlanilla])
})
