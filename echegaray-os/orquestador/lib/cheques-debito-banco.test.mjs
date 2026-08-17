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

// ─── EL DEFECTO DEL 17/08: EL NÚMERO DE LA FILA ESTÁ MAL Y EL CHEQUE QUEDA SIN DEBITAR ─────────
//
// Registro real: la fila 101 y la 102 dicen las DOS "FISICO 316" (Diesel Rodriguez), por $500.000 y
// $510.000. El extracto dice 316→$500.000 y 317→$510.000. O sea que el número de la 102 está mal: el
// banco se llevó sus $510.000 el 13/08 y la fila seguía con DEBITADO = "No", contando como
// comprometida plata que ya no estaba.
const FIS_316a = { instrumento: 'FISICO', numero: '316', importe: 500000, beneficiario: 'Diesel Rodriguez', debitado: true, fila: 101 }
const FIS_316b = { instrumento: 'FISICO', numero: '316', importe: 510000, beneficiario: 'Diesel Rodriguez', debitado: false, fila: 102 }
const MOV_316 = { fecha: '2026-08-13', concepto: 'Cheque debitado', importe: -500000, referencia: '316' }
const MOV_317 = { fecha: '2026-08-13', concepto: 'Cheque debitado', importe: -510000, referencia: '317' }

test('EL DEFECTO: el débito de $510.000 encuentra su fila aunque el número de la fila esté mal', () => {
  const { resultados } = conciliarDebitosDeCheques([MOV_316, MOV_317], [FIS_316a, FIS_316b])
  assert.equal(resultados[0].estado, 'emparejado', 'el 316 empareja por número, como siempre')
  assert.equal(resultados[0].cheque.fila, 101)

  const r = resultados[1]
  assert.equal(r.estado, 'emparejado_por_importe', 'el 317 no está en el registro, pero sus $510.000 sí')
  assert.equal(r.cheque.fila, 102)
  // LAS DOS LECTURAS SE PUBLICAN, no se elige una: el banco dice 317 y la fila dice 316.
  assert.deepEqual(r.discrepancia, { referenciaDelBanco: '317', numeroDeLaFila: '316' })
  assert.match(r.motivo, /317/)
  assert.match(r.motivo, /316/)
})

test('dos cheques del mismo proveedor separados por UN PESO no se confunden', () => {
  // FISICO 313 ($470.945) y FISICO 312 ($470.944), los dos de Corralón. El rescate compara al
  // centavo: con holgura de un peso marcaría debitado el cheque equivocado.
  const f313 = { instrumento: 'FISICO', numero: '313', importe: 470945, beneficiario: 'Corralon Progreso', fila: 91 }
  const f312 = { instrumento: 'FISICO', numero: '312', importe: 470944, beneficiario: 'Corralon Progreso', fila: 103 }
  const movs = [
    { fecha: '2026-08-06', concepto: 'Cheque debitado', importe: -470945, referencia: '901' },
    { fecha: '2026-08-07', concepto: 'Cheque debitado', importe: -470944, referencia: '902' },
  ]
  const { resultados } = conciliarDebitosDeCheques(movs, [f313, f312])
  assert.deepEqual(resultados.map((r) => [r.estado, r.cheque?.fila]),
    [['emparejado_por_importe', 91], ['emparejado_por_importe', 103]])
})

test('dos cheques distintos con el MISMO importe: ambiguo, no se marca ninguno', () => {
  // ECHEQ 312 y ECHEQ 313, los dos de Maderas por $383.175. Sin número que los separe, elegir uno
  // deja vivo el que ya salió y mata el que no.
  const e312 = { instrumento: 'ECHEQ', numero: '312', importe: 383175, beneficiario: 'Maderas Literas SRL', fila: 82 }
  const e313 = { instrumento: 'ECHEQ', numero: '313', importe: 383175, beneficiario: 'Maderas Literas SRL', fila: 83 }
  const mov = { fecha: '2026-08-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, referencia: '999' }
  const { resultados } = conciliarDebitosDeCheques([mov], [e312, e313])
  assert.equal(resultados[0].estado, 'ambiguo')
  assert.equal(resultados[0].cheque, undefined, 'un ambiguo NO puede traer cheque emparejado')
  assert.deepEqual(resultados[0].candidatos.map((c) => c.fila).sort(), [82, 83])
})

test('el rescate NO alcanza a los sin_referencia: sin número no hay nada que contradecir', () => {
  // El banco no mandó el número, y $200.000 es el importe de un solo cheque del registro. Aun así no
  // se empareja: emparejar por importe suelto ya se pagó caro, y acá no hay ninguna lectura que cruzar.
  const mov = { fecha: '2026-07-20', concepto: 'Cheque debitado', importe: -200000, referencia: null }
  const { resultados } = conciliarDebitosDeCheques([mov], [CH_223])
  assert.equal(resultados[0].estado, 'sin_referencia')
  assert.equal(resultados[0].cheque, undefined)
})

test('una fila no se rescata dos veces: el segundo débito del mismo importe no la reclama', () => {
  const movs = [
    { ...MOV_317, referencia: '317' },
    { ...MOV_317, fecha: '2026-08-14', referencia: '319' },
  ]
  const { resultados } = conciliarDebitosDeCheques(movs, [FIS_316b])
  assert.equal(resultados[0].estado, 'emparejado_por_importe')
  assert.equal(resultados[1].estado, 'sin_cheque', 'la 102 ya la explicó el primero')
})

// CONTRATO CAMBIADO EL 17/08. Este test decía "un número que no está en el registro se declara, no se
// fuerza contra el importe" — y esa regla es la que dejó la fila 102 sin debitar. Lo que NO se puede
// forzar sigue siendo el importe AMBIGUO; el importe ÚNICO es un testigo, y su contradicción con el
// número se publica en vez de resolverse.
test('un número que no está en el registro empareja por importe único, y la contradicción se grita', () => {
  const mov = { fecha: '2026-07-20', concepto: 'Canje interno recibido 24 hs', importe: -200000, referencia: '999' }
  const { resultados } = conciliarDebitosDeCheques([mov], [{ ...CH_223, fila: 95 }])
  assert.equal(resultados[0].estado, 'emparejado_por_importe')
  assert.deepEqual(resultados[0].discrepancia, { referenciaDelBanco: '999', numeroDeLaFila: '223' })

  // Y si además de no estar el número el importe no cierra con nadie, sigue sin explicación.
  const otro = conciliarDebitosDeCheques([{ ...mov, importe: -12345 }], [CH_223]).resultados
  assert.equal(otro[0].estado, 'sin_cheque')
  assert.match(otro[0].motivo, /999/)
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
  assert.equal(resumen.emparejados_por_importe, 0)
})

test('el resumen cuenta el rescate aparte: un emparejado por importe NO se disfraza de emparejado', () => {
  // Si los dos contaran juntos, "33 emparejadas" taparía que una de ellas tiene el número mal.
  const { resumen } = conciliarDebitosDeCheques([MOV_316, MOV_317], [FIS_316a, FIS_316b])
  assert.equal(resumen.emparejados, 1)
  assert.equal(resumen.emparejados_por_importe, 1)
  assert.equal(resumen.sin_cheque, 0)
})
