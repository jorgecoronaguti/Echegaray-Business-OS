import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarConcepto, esMovimientoDeCheques, familiaDebitoCheque,
  normalizarNumeroCheque, claveCheque, conciliarDebitosDeCheques,
} from './cheques-debito-banco.mjs'

// El caso real que destapó el defecto: el FÍSICO 223 de Corralón figuraba "vencido sin debitar" en
// Cheques Emitidos y el banco lo había debitado el 20/07 como "Canje interno recibido 24 hs".
const CH_223 = { instrumento: 'FISICO', numero: '223', importe: 200000, beneficiario: 'Corralon Progreso' }
const MOV_223 = { fecha: '2026-07-20', concepto: 'Canje interno recibido 24 hs', importe: -200000, referencia: '000000223' }

test('el canje interno es un débito de cheque: el 223 deja de ser "vencido sin debitar"', () => {
  const { resultados } = conciliarDebitosDeCheques([MOV_223], [CH_223])
  assert.equal(resultados.length, 1)
  assert.equal(resultados[0].estado, 'emparejado')
  assert.equal(resultados[0].clave, 'FISICO|223')
  assert.equal(resultados[0].cheque.beneficiario, 'Corralon Progreso')
})

test('las variantes de escritura del mismo concepto se reconocen todas', () => {
  // Mayúsculas, "24hs" pegado, espacio doble, tilde de más y el guión del banco.
  const variantes = [
    'Canje interno recibido 24 hs',
    'CANJE INTERNO RECIBIDO 24HS',
    'canje  interno   recibido 24 horas',
    'Canje interno recibído 24 hs',
    'Canje interno recibido - 24 hs',
  ]
  for (const c of variantes) {
    assert.ok(familiaDebitoCheque(c), `no reconoció "${c}"`)
    assert.equal(familiaDebitoCheque(c).instrumentoDeclarado, null, `"${c}" no declara instrumento`)
    const { resultados } = conciliarDebitosDeCheques([{ ...MOV_223, concepto: c }], [CH_223])
    assert.equal(resultados[0].estado, 'emparejado', `"${c}" no emparejó`)
  }
})

test('cuando el banco escribe "Echeq" el instrumento SÍ viene declarado', () => {
  for (const c of ['Echeq canje interno recibido 24hs', 'ECHEQ CANJE INTERNO RECIBIDO 24 HS', 'Echeq clearing recibido']) {
    assert.equal(familiaDebitoCheque(c).instrumentoDeclarado, 'ECHEQ', `"${c}"`)
  }
  // Y "Cheque debitado" —el único concepto que el OS reconocía— NO declara instrumento: dice
  // "cheque", no dice cuál de los dos registros. Darlo por FÍSICO sería inventar.
  assert.equal(familiaDebitoCheque('Cheque debitado').instrumentoDeclarado, null)
})

// ─── LA TRAMPA YA PAGADA: EL NÚMERO NO IDENTIFICA UN CHEQUE ────────────────────────────────────
// En el registro real conviven FISICO 313 (Corralón, $470.945) y ECHEQ 313 (Maderas, $383.175).
const FIS_313 = { instrumento: 'FISICO', numero: '313', importe: 470945, beneficiario: 'Corralon Progreso' }
const ECH_313 = { instrumento: 'ECHEQ', numero: '313', importe: 383175, beneficiario: 'Maderas Literas SRL' }

test('mismo número en los dos instrumentos: el importe desempata y la clave es (instrumento, número)', () => {
  const mov = { fecha: '2026-07-25', concepto: 'Canje interno recibido 24 hs', importe: -470945, referencia: '000000313' }
  const { resultados } = conciliarDebitosDeCheques([mov], [FIS_313, ECH_313])
  assert.equal(resultados[0].estado, 'emparejado')
  assert.equal(resultados[0].clave, 'FISICO|313')
  assert.equal(claveCheque(ECH_313), 'ECHEQ|313')
})

test('mismo número Y mismo importe en los dos instrumentos: AMBIGUO, no se empareja al azar', () => {
  const gemelo = { ...ECH_313, importe: 470945 }
  const mov = { fecha: '2026-07-25', concepto: 'Canje interno recibido 24 hs', importe: -470945, referencia: '000000313' }
  const { resultados } = conciliarDebitosDeCheques([mov], [FIS_313, gemelo])
  assert.equal(resultados[0].estado, 'ambiguo')
  assert.equal(resultados[0].cheque, undefined, 'un ambiguo NO puede traer cheque emparejado')
  assert.match(resultados[0].motivo, /instrumento/i)
  assert.deepEqual(resultados[0].candidatos.map(claveCheque).sort(), ['ECHEQ|313', 'FISICO|313'])
})

test('si el banco declara ECHEQ, el FÍSICO del mismo número e importe no entra en la comparación', () => {
  const gemelo = { ...ECH_313, importe: 470945 }
  const mov = { fecha: '2026-07-25', concepto: 'Echeq canje interno recibido 24hs', importe: -470945, referencia: '313' }
  const { resultados } = conciliarDebitosDeCheques([mov], [FIS_313, gemelo])
  assert.equal(resultados[0].estado, 'emparejado')
  assert.equal(resultados[0].clave, 'ECHEQ|313')
})

test('el instrumento declarado contradice al importe: no empareja, lo declara', () => {
  // El banco dice ECHEQ; el único 313 cuyo importe coincide es el FÍSICO. Emparejar sería marcar
  // debitado un cheque que el banco no nombró.
  const mov = { fecha: '2026-07-25', concepto: 'Echeq canje interno recibido 24hs', importe: -470945, referencia: '313' }
  const { resultados } = conciliarDebitosDeCheques([mov], [FIS_313, ECH_313])
  assert.equal(resultados[0].estado, 'sin_cheque')
  assert.match(resultados[0].motivo, /importe/i)
})

test('el mismo cheque no se puede debitar dos veces: el segundo movimiento queda ambiguo', () => {
  const otro = { ...MOV_223, fecha: '2026-07-21' }
  const { resultados } = conciliarDebitosDeCheques([MOV_223, otro], [CH_223])
  assert.equal(resultados[0].estado, 'emparejado')
  assert.equal(resultados[1].estado, 'ambiguo')
  assert.match(resultados[1].motivo, /ya .*emparejad/i)
})

test('sin referencia no se empareja por importe a ciegas', () => {
  const mov = { fecha: '2026-07-20', concepto: 'Canje interno recibido 24 hs', importe: -200000, referencia: null }
  const { resultados } = conciliarDebitosDeCheques([mov], [CH_223])
  assert.equal(resultados[0].estado, 'sin_referencia')
})

test('un crédito no es un cheque que sale, aunque el concepto hable de echeq', () => {
  const dep = { fecha: '2026-07-20', concepto: 'Deposito e-cheq 48hs presencia bsr', importe: 16807425.92, referencia: '99' }
  const { resultados } = conciliarDebitosDeCheques([dep], [CH_223])
  assert.equal(resultados[0].estado, 'no_es_debito_de_cheque')
})

test('un número que no está en el registro se declara, no se fuerza contra el importe', () => {
  const mov = { fecha: '2026-07-20', concepto: 'Canje interno recibido 24 hs', importe: -200000, referencia: '999' }
  const { resultados } = conciliarDebitosDeCheques([mov], [CH_223])
  assert.equal(resultados[0].estado, 'sin_cheque')
  assert.match(resultados[0].motivo, /999/)
})

test('normalizarConcepto: minúsculas, sin tildes, espacios colapsados y "24 hs" = "24hs"', () => {
  assert.equal(normalizarConcepto('  CANJE  Interno   Recibído 24 HS '), 'canje interno recibido 24hs')
  assert.equal(normalizarConcepto('Deposito E-Cheq 48 hs'), 'deposito echeq 48hs')
  assert.equal(normalizarConcepto(null), '')
})

test('normalizarNumeroCheque: el relleno de ceros del banco no crea un cheque distinto', () => {
  assert.equal(normalizarNumeroCheque('000000223'), '223')
  assert.equal(normalizarNumeroCheque(223), '223')
  assert.equal(normalizarNumeroCheque('  '), null)
})

test('esMovimientoDeCheques sigue reconociendo todo lo que reconocía el literal viejo', () => {
  for (const c of ['Cheque debitado', 'Cheque debitado - Nº 221', 'Echeq clearing recibido',
    'Canje interno recibido 24 hs', 'Deposito e-cheq 48hs', 'Echeq canje interno recibido 24hs']) {
    assert.ok(esMovimientoDeCheques(c), `dejó de reconocer "${c}"`)
  }
  for (const c of ['Transferencia realizada - A herrajes san juan', 'Pago haberes - 260701507', '']) {
    assert.equal(esMovimientoDeCheques(c), false, `"${c}" no es un movimiento de cheques`)
  }
})

test('el resumen cuenta cada estado: es lo que se mira antes de escribir nada', () => {
  const movs = [
    MOV_223,
    { fecha: '2026-06-05', concepto: 'Canje interno recibido 24 hs', importe: -1655000, referencia: '211' },
    { fecha: '2026-07-20', concepto: 'Canje interno recibido 24 hs', importe: -1, referencia: '888' },
  ]
  const { resumen } = conciliarDebitosDeCheques(movs, [CH_223, { instrumento: 'FISICO', numero: '211', importe: 1655000 }])
  assert.equal(resumen.emparejados, 2)
  assert.equal(resumen.sin_cheque, 1)
  assert.equal(resumen.ambiguos, 0)
})
