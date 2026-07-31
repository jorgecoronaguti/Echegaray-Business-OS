// Tests del dedup del extracto. Herméticos. ESTE CÓDIGO BORRA DATOS: los tests son el seguro.
//
// ═══ LA TRAMPA CENTRAL ═══
//
// Dos cheques físicos de $200.000 debitados el mismo día son DOS movimientos legítimos con la misma
// fecha, el mismo concepto y el mismo importe. Un dedup por (fecha, concepto, importe) que deja uno
// BORRA PLATA REAL. Por eso el criterio no es "cuántos hay" sino "cuántos declaró UNA SOLA descarga":
// si el extracto del 22/07 listó el movimiento cuatro veces, hay cuatro; que la descarga del 30/07 los
// liste otra vez no los convierte en ocho.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDedup, normalizarConcepto } from './banco-deduplicar.mjs'

const A = 'extracto 22/06→22/07'
const B = 'csv del 30/07'
let seq = 0
const f = (origen, importe, extra = {}) => ({
  id: ++seq, cuenta: '179-091383/6', fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs',
  importe, saldo_despues: null, origen, referencia: null, ...extra,
})

test('EL CASO REAL: 4 cheques de $383.175 en dos descargas → se conservan 4, se borran 4', () => {
  const filas = [
    ...Array.from({ length: 4 }, () => f(A, -383175)),
    ...Array.from({ length: 4 }, () => f(B, -383175)),
  ]
  const { bajas } = planDedup(filas)
  assert.equal(bajas.length, 4, 'se borra exactamente lo que sobra')
  assert.equal(filas.length - bajas.length, 4, 'quedan los 4 movimientos reales')
  assert.match(bajas[0].motivo, /8 copias en 2 descargas/)
})

test('NO SE TOCA lo que una sola descarga repitió: son movimientos reales', () => {
  // Dos cheques físicos de $200.000 el mismo día, en UNA sola descarga.
  const filas = [f(A, -200000, { concepto: 'Cheque debitado' }), f(A, -200000, { concepto: 'Cheque debitado' })]
  const { bajas } = planDedup(filas)
  assert.deepEqual(bajas, [], 'un solo origen: no hay nada que deducir, son dos cheques')
})

test('la REFERENCIA manda: misma referencia = mismo movimiento, aunque el saldo difiera', () => {
  // El caso que rompió el índice único: la misma referencia con saldos distintos en dos descargas.
  const filas = [
    f(A, -317000, { referencia: '306', saldo_despues: -3397612.85 }),
    f(B, -317000, { referencia: '306', saldo_despues: -3541112.85 }),
  ]
  const { bajas } = planDedup(filas)
  assert.equal(bajas.length, 1)
  assert.match(bajas[0].motivo, /misma referencia 306/)
  assert.equal(bajas[0].fila.origen, B, 'se conserva la primera que entró')
})

test('referencias DISTINTAS del mismo importe y día NO se tocan: son movimientos distintos', () => {
  const filas = [
    f(A, -383175, { referencia: '360' }), f(A, -383175, { referencia: '361' }),
    f(A, -383175, { referencia: '362' }), f(A, -383175, { referencia: '363' }),
  ]
  assert.deepEqual(planDedup(filas).bajas, [], 'cuatro cheques distintos, cuatro movimientos')
})

test('entre dos copias sin referencia se conserva la que SÍ tiene referencia', () => {
  const conRef = f(A, -893098.79, { referencia: '304' })
  const sinRef = f(B, -893098.79)
  const { bajas } = planDedup([sinRef, conRef])
  assert.equal(bajas.length, 1)
  assert.equal(bajas[0].id, sinRef.id, 'la que se va es la que no tiene referencia')
})

test('un movimiento único no se toca, y una tabla vacía no explota', () => {
  assert.deepEqual(planDedup([f(A, -5921.3)]).bajas, [])
  assert.deepEqual(planDedup([]).bajas, [])
  assert.deepEqual(planDedup().bajas, [])
})

test('fechas distintas no se agrupan aunque el importe y el concepto coincidan', () => {
  const filas = [f(A, -200000, { fecha: '2026-07-06' }), f(B, -200000, { fecha: '2026-07-16' })]
  assert.deepEqual(planDedup(filas).bajas, [], 'son dos cheques de días distintos')
})

test('tres descargas superpuestas: sigue mandando el máximo de UNA sola', () => {
  const C = 'extracto 23→29/07'
  const filas = [f(A, -100), f(A, -100), f(B, -100), f(C, -100), f(C, -100)]
  const { bajas } = planDedup(filas)
  assert.equal(filas.length - bajas.length, 2, 'A y C declararon 2 cada una: hay 2 movimientos')
  assert.equal(bajas.length, 3)
})

test('cada baja dice POR QUÉ y trae la fila entera (el respaldo se arma de acá)', () => {
  const { bajas } = planDedup([f(A, -1000), f(B, -1000)])
  assert.equal(bajas.length, 1)
  assert.ok(bajas[0].motivo.length > 10, 'el motivo es legible, no un código')
  assert.equal(bajas[0].fila.importe, -1000, 'la fila completa viaja: sin esto no hay vuelta atrás')
  assert.ok(Number.isInteger(bajas[0].id))
})

test('el CONCEPTO se compara NORMALIZADO: el banco cambia mayúsculas entre descargas', () => {
  // El caso real: el depósito de los 5 cheques de Messina sobrevivió dos veces por la capitalización.
  const filas = [
    f(A, 16807425.92, { fecha: '2026-07-29', concepto: 'Deposito E-cheq 48hs Presencia Bsr' }),
    f(B, 16807425.92, { fecha: '2026-07-29', concepto: 'Deposito e-cheq  48hs presencia bsr' }),
  ]
  const { bajas } = planDedup(filas)
  assert.equal(bajas.length, 1, 'es el MISMO movimiento: mayúsculas y espacios los pone el banco')
})

test('normalizarConcepto no borra información, sólo el ruido de formato', () => {
  assert.equal(normalizarConcepto('Deposito E-cheq 48hs  Presencia Bsr'), 'deposito e-cheq 48hs presencia bsr')
  assert.equal(normalizarConcepto('  Cheque debitado  '), 'cheque debitado')
  // Dos conceptos DISTINTOS siguen siendo distintos: no se colapsan.
  assert.notEqual(normalizarConcepto('Cheque debitado'), normalizarConcepto('Echeq clearing recibido 48hs'))
})

test('LA REFERENCIA SOLA NO ES IDENTIDAD: una operación y su percepción la comparten', () => {
  // El caso real (01/07): la compra en el exterior de Google Workspace y su percepción RG 5617 vienen con
  // la MISMA referencia 00114824 y distinto importe — el banco las numera juntas porque son la misma
  // operación. Agrupando por referencia sola, este código proponía borrar la percepción: $11.203,92 de
  // impuesto que desaparecen sin que nada dé error.
  const filas = [
    f(A, -37926, { fecha: '2026-07-01', concepto: 'Compra en el exterior - Google workspace', referencia: '114824' }),
    f(A, -11203.92, { fecha: '2026-07-01', concepto: 'Percep perc rg 5617 30% o suj - Google workspace', referencia: '114824' }),
  ]
  const { bajas } = planDedup(filas)
  assert.equal(bajas.length, 0, 'son dos movimientos reales de la cuenta')
})

test('misma referencia Y mismo importe SÍ es el mismo movimiento importado de nuevo', () => {
  const filas = [
    f(A, -3731.79, { fecha: '2026-07-30', concepto: 'Impuesto ley 25.413 debito 0,6%', referencia: '8696' }),
    f(B, -3731.79, { fecha: '2026-07-30', concepto: 'Impuesto ley 25.413 debito 0,6%', referencia: '8696' }),
  ]
  const { bajas } = planDedup(filas)
  assert.equal(bajas.length, 1)
  assert.match(bajas[0].motivo, /misma referencia 8696 y mismo importe/)
})

test('EL DUPLICADO QUE ESTE CÓDIGO NO VEÍA: el concepto RECORTADO por la otra descarga', () => {
  // El caso real (30/06, y 41 más en julio): la semilla guardó "Pago haberes - 260630507" y el CSV trae el
  // número repetido al final. Con el concepto exacto en la clave son dos grupos de una fila cada uno, así
  // que este deduplicador informaba "no hay duplicados" sobre 42 movimientos contados dos veces.
  const filas = [
    f(A, -344401.2, { fecha: '2026-06-30', concepto: 'Pago haberes - 260630507' }),
    f(B, -344401.2, { fecha: '2026-06-30', concepto: 'Pago haberes - 260630507       260630507' }),
  ]
  const { bajas } = planDedup(filas)
  assert.equal(bajas.length, 1, 'es el mismo pago de haberes')
  assert.equal(bajas[0].fila.origen, B, 'se conserva la más vieja')
})

test('el recorte NO junta dos movimientos que difieren EN EL MEDIO', () => {
  // "Id debin cuit 307…" vs "Id debin z0kv8… cuit 307…": si el texto difiere en el medio, no se sabe si es
  // el mismo movimiento. Acá el mismo origen los declaró: son reales y no se tocan.
  const filas = [
    f(A, -500, { concepto: 'Transferencia recibida - credin - Id debin cuit 30710630670' }),
    f(A, -500, { concepto: 'Transferencia recibida - credin - Id debin z0kv879 cuit 30710630670' }),
  ]
  assert.equal(planDedup(filas).bajas.length, 0)
})

test('un prefijo pobre no empareja cualquier cosa', () => {
  // Sin el piso de largo, "Iva" sería prefijo de "Iva percepcion rg 2408" y de "Iva 21% reg de transfisc".
  const filas = [
    f(A, -2070, { concepto: 'Iva' }),
    f(B, -2070, { concepto: 'Iva percepcion rg 2408' }),
  ]
  assert.equal(planDedup(filas).bajas.length, 0, 'tres letras no identifican un movimiento')
})
