import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conciliarDebitosDeCheques } from './cheques-debito-banco.mjs'
import { huerfanosDeDebito } from './cheques-debitado-fusion.mjs'
import { COL } from './cheques-emitidos-sync.mjs'
import { planAltasDesdeBanco, filaAltaDesdeBanco } from './cheques-alta-desde-banco.mjs'

// ── LOS DATOS REALES DEL 17/08, MEDIDOS CON --dry ────────────────────────────────────────────────
// El registro tiene 104 cheques y ninguno lleva el número 317. El banco lo debitó igual: $510.000 el
// 13/08. Ese hueco es el que el dueño mandó llenar — "el registro es tuyo, así q si detectas eso lo
// tenés q agregar".
const REGISTRO = [
  { fila: 101, tipo: 'FISICO', numero: 316, monto: 500000, proveedor: 'Diesel Rodriguez', debitado: 'SI' },
  { fila: 108, tipo: 'FISICO', numero: 318, monto: 750000, proveedor: 'Corralon Progreso', debitado: 'SI' },
  { fila: 114, tipo: 'FISICO', numero: 325, monto: 340000, proveedor: 'Diesel Rodriguez', debitado: 'SI' },
]
const paraConciliar = (r) => ({
  instrumento: String(r.tipo ?? '').toUpperCase(),
  numero: r.numero,
  importe: r.monto,
  debitado: String(r.debitado ?? '').toUpperCase() === 'SI',
  fila: r.fila,
})
const DEBITO_317 = { fecha: '2026-08-13', concepto: 'Cheque debitado', importe: -510000, referencia: '000000317' }

/** La cadena completa, tal como corre en el sync: extracto → conciliación → huérfanos → altas. */
function planDe(movs, registro = REGISTRO) {
  const { resultados } = conciliarDebitosDeCheques(movs, registro.filter((r) => r.tipo).map(paraConciliar))
  return planAltasDesdeBanco({ huerfanos: huerfanosDeDebito(resultados), registro })
}

test('EL DEFECTO: un débito de cheque que ninguna fila explica termina en una fila nueva, no en un hueco', () => {
  const { altas, yaTienenFila } = planDe([DEBITO_317])
  assert.equal(yaTienenFila.length, 0)
  assert.equal(altas.length, 1, 'el 317 tiene que darse de alta: el banco ya se llevó los $510.000')
  assert.deepEqual(
    { numero: altas[0].numero, importe: altas[0].importe, fecha: altas[0].fecha },
    { numero: '317', importe: 510000, fecha: '2026-08-13' })
})

test('la fila que se agrega transcribe lo del banco y deja VACÍO lo que el banco no sabe', () => {
  const [alta] = planDe([DEBITO_317]).altas
  const f = filaAltaDesdeBanco(alta)

  // Lo que el extracto SÍ trae: número, importe, fecha del débito y el hecho de que ya salió.
  assert.equal(f[COL.numero], '317')
  assert.equal(f[COL.monto], 510000)
  assert.equal(f[COL.pago], '13/08/2026')
  assert.equal(f[COL.debitado], 'SI')

  // Lo que el banco NO trae no se adivina: ni el beneficiario, ni la obra, ni el comprobante.
  assert.equal(f[COL.emision], '')
  assert.equal(f[COL.cuit], '')
  assert.equal(f[COL.tipoComp], '')
  assert.equal(f[COL.nroComp], '')
  assert.equal(f[COL.unidad], '')

  // Y la fila lo DICE en su propio texto: de dónde nació y qué le falta.
  assert.match(f[COL.proveedor], /^▲ COMPLETAR/)
  assert.match(f[COL.proveedor], /extracto del banco/)
  assert.match(f[COL.proveedor], /13\/08\/2026/)
  assert.match(f[COL.proveedor], /referencia 317/)
  assert.match(f[COL.proveedor], /beneficiario/)
  assert.match(f[COL.proveedor], /unidad de negocio/)
})

test('IDEMPOTENCIA: con la fila ya en el registro no se agrega una segunda vez', () => {
  // La fila tal como quedó en la pestaña después de la primera corrida: sin Tipo, porque
  // "Cheque debitado" no declara el instrumento. Ese vacío no puede volver a disparar el alta.
  const f = filaAltaDesdeBanco(planDe([DEBITO_317]).altas[0])
  const registroDespues = [...REGISTRO, {
    fila: 133, tipo: f[COL.tipo], numero: f[COL.numero], monto: f[COL.monto],
    proveedor: f[COL.proveedor], debitado: f[COL.debitado],
  }]

  const { altas, yaTienenFila } = planDe([DEBITO_317], registroDespues)
  assert.deepEqual(altas, [], 'la segunda corrida no puede duplicar el 317')
  assert.equal(yaTienenFila.length, 1)
  assert.equal(yaTienenFila[0].numero, '317')
})

test('un débito SIN referencia no se da de alta: el banco no mandó el número y no se puede atribuir', () => {
  // Los 4 del extracto real. Emparejar por importe suelto ya se pagó caro; inventar la fila, más.
  const sinRef = { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, referencia: null }
  const { resultados } = conciliarDebitosDeCheques([sinRef], REGISTRO.map(paraConciliar))
  assert.equal(resultados[0].estado, 'sin_referencia')
  assert.deepEqual(huerfanosDeDebito(resultados), [], 'sin referencia no llega ni a huérfano')
  assert.deepEqual(planDe([sinRef]), { altas: [], yaTienenFila: [] })
})

test('un número que YA está en el registro no se da de alta aunque el importe no cierre: sería duplicar', () => {
  // El registro tiene el FISICO 316 por $500.000 y el banco debita $999.999 con la referencia 316.
  // O el importe está mal transcripto, o el número. Agregar una fila crea DOS cheques 316 donde hay uno.
  const raro = { fecha: '2026-08-13', concepto: 'Cheque debitado', importe: -999999, referencia: '000000316' }
  const { altas, yaTienenFila } = planDe([raro])
  assert.deepEqual(altas, [])
  assert.equal(yaTienenFila.length, 1)
  assert.match(yaTienenFila[0].motivo, /ningún importe coincide/)
})

test('el instrumento se escribe SÓLO cuando el banco lo declara: "Cheque debitado" no lo declara', () => {
  const [comun] = planDe([DEBITO_317]).altas
  assert.equal(comun.instrumento, '')
  assert.equal(filaAltaDesdeBanco(comun)[COL.tipo], '')
  assert.match(filaAltaDesdeBanco(comun)[COL.proveedor], /tipo de cheque/)

  // El banco sí lo declara cuando escribe "Echeq": ahí no se adivina nada, se copia.
  const [echeq] = planDe([{ fecha: '2026-08-11', concepto: 'Echeq clearing recibido 48hs', importe: -429048.5, referencia: '000000399' }]).altas
  assert.equal(echeq.instrumento, 'ECHEQ')
  assert.equal(filaAltaDesdeBanco(echeq)[COL.tipo], 'ECHEQ')
  assert.doesNotMatch(filaAltaDesdeBanco(echeq)[COL.proveedor], /tipo de cheque/)
})

test('la fila respeta el ancho A–L: nunca escribe la columna M, que es de otro generador', () => {
  // M ("Estado en el OS") la escribe cheques-cobertura-sheet.mjs fila por fila. Dos escritores sobre
  // la misma columna es el defecto que ya dejó marcas ajenas y filas salteadas.
  const f = filaAltaDesdeBanco(planDe([DEBITO_317]).altas[0])
  assert.equal(f.length, 12)
})

test('el alta no toca ninguna fila del dueño: sólo produce filas, nunca posiciones a pisar', () => {
  const { altas } = planDe([DEBITO_317])
  // Ninguna alta puede llevar una fila de destino: si la llevara, alguien podría escribir ENCIMA.
  for (const a of altas) assert.equal('fila' in a, false)
})
