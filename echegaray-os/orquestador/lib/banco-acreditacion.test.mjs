// EL DEPÓSITO RETENIDO 48 HS QUE INFLÓ EL SALDO DEL BANCO EN $38.572.526,23 (10/09/2026).
//
// El fixture es SINTÉTICO y reproduce la estructura del extracto de ese día —dos bloques, el pie de
// saldo, dos depósitos con retención— con conceptos del banco pero sin un solo nombre ni CUIT de
// terceros. Los importes que NO hacen a la aritmética del defecto son inventados; los tres números que
// SÍ la hacen son los medidos, porque son el defecto: la cadena reconstruye $42.157.467,50, el banco
// declara $3.584.941,27, y la diferencia es exactamente la suma de los dos depósitos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearExtracto, parsearSaldoDeclarado, saldoDeCierre, dryRun } from './banco-importar.mjs'
import { esAcreditacionPendiente, conceptoRetenido, cerrarDia, explicacionPendientes } from './banco-acreditacion.mjs'

const CAB = 'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo'

/** El extracto de ese día, en chico: bloque del día sin saldo + pie + bloque con saldo corrido. */
const EXTRACTO = [
  'Movimientos del Día',
  '',
  'Cuenta corriente en Pesos Nro. 179-091383/6',
  '',
  CAB,
  '10/09/2026;0179;San Juan;3253;000009113;Iva 21% reg de transfisc ley27743;(15.058,73);',
  '10/09/2026;0179;San Juan;3036;000009108;Deposito e-cheq 48hs presencia bsr;6.567.841,01;',
  '10/09/2026;0179;San Juan;3058;000009107;Deposito e-cheq int ots plazas;32.004.685,22;',
  '10/09/2026;0000;Casa Central;0824;04257848;Transferencia realizada - A un proveedor;(1.000.000,00);',
  '10/09/2026;0179;San Juan;1304;19591809;Compra con tarjeta de debito - Un comercio - tarj nro. 0000;(400.000,00);',
  'Saldo al 10/09/2026 3.584.941,27',
  '',
  '10/09/2026 12:44:55',
  '',
  'Últimos Movimientos',
  '',
  'Cuenta corriente en Pesos Nro. 179-091383/6',
  '',
  CAB,
  '09/09/2026;0179;San Juan;4637;000009106;Impuesto ley 25.413 credito 0,6%;(31.586,22);5.000.000,00',
  '09/09/2026;0179;San Juan;0150;000000328;Canje interno recibido 24 hs;(1.000.000,00);5.031.586,22',
].join('\n')

const SALDO_DECLARADO = 3584941.27
const CALCULADO_SIN_EXCLUIR = 42157467.50
const RETENIDO = 38572526.23

test('el pie "Saldo al DD/MM/AAAA" se parsea y ya no se descarta como ruido', () => {
  const pie = parsearSaldoDeclarado('Saldo al 10/09/2026 3.584.941,27')
  assert.deepEqual(
    { fecha: pie.fecha, saldo: pie.saldo, cierre: pie.cierre },
    { fecha: '2026-09-10', saldo: SALDO_DECLARADO, cierre: true },
  )
})

test('el año de la fecha no se confunde con el importe', () => {
  assert.equal(parsearSaldoDeclarado('Saldo al 10/09/2026 3.584.941,27').saldo, SALDO_DECLARADO)
})

test('"Saldo anterior" es apertura, no cierre: no puede publicarse como saldo del día', () => {
  const ant = parsearSaldoDeclarado('Saldo anterior 1.000.000,00')
  assert.equal(ant.cierre, false)
  assert.equal(saldoDeCierre([ant]), null)
})

test('de varios pies gana el CIERRE más nuevo, y dos cierres contradictorios se declaran', () => {
  const uno = parsearSaldoDeclarado('Saldo al 09/09/2026 100,00')
  const dos = parsearSaldoDeclarado('Saldo al 10/09/2026 200,00')
  const otro = parsearSaldoDeclarado('Saldo al 10/09/2026 999,00')
  assert.equal(saldoDeCierre([uno, dos]).saldo, 200)
  assert.equal(saldoDeCierre([uno, dos]).conflicto, false)
  assert.equal(saldoDeCierre([uno, dos, otro]).conflicto, true)
})

test('el pie no entra como movimiento ni como rechazo silencioso', () => {
  const { movimientos, saldosDeclarados } = parsearExtracto(EXTRACTO)
  assert.equal(movimientos.filter((m) => /saldo al/i.test(m.concepto)).length, 0)
  assert.equal(saldosDeclarados.length, 1)
})

test('el sello de descarga del archivo no es un movimiento ni un rechazo', () => {
  const { movimientos, rechazos } = parsearExtracto(EXTRACTO)
  assert.equal(rechazos.length, 0)
  assert.equal(movimientos.length, 7)
})

test('un depósito retenido se marca; el MISMO concepto ya acreditado (con saldo por fila) no', () => {
  const hoy = { concepto: 'Deposito e-cheq 48hs presencia bsr', importe: 6567841.01, saldo: null }
  const ayer = { concepto: 'Deposito e-cheq 48hs presencia bsr', importe: 15079296.20, saldo: 14503182.66 }
  assert.equal(esAcreditacionPendiente(hoy), true)
  assert.equal(esAcreditacionPendiente(ayer), false)
})

test('un DÉBITO con "48hs" en el concepto no es una acreditación pendiente', () => {
  // "Echeq clearing recibido 48hs" es un cheque propio que SALE: la plata ya no está.
  const debito = { concepto: 'Echeq clearing recibido 48hs', importe: -1700000, saldo: null }
  assert.equal(conceptoRetenido(debito.concepto), true)
  assert.equal(esAcreditacionPendiente(debito), false)
})

test('"int misma plaza" y el canje interno de 24 hs acreditan el mismo día: no se marcan', () => {
  assert.equal(conceptoRetenido('Deposito e-cheq int misma plaza'), false)
  assert.equal(conceptoRetenido('Deposito echeq canje interno 24hs'), false)
})

test('EL DEFECTO: sin la regla de retención la cadena publica 42.157.467,50', () => {
  // El mismo extracto con los dos depósitos rotulados de forma que NINGÚN patrón los reconozca: es,
  // exactamente, cómo se comportaba el importador hasta hoy. La cadena reconstruye $42.157.467,50 —
  // $38.572.526,23 más de lo que el banco declara— y eso es lo que llegaba a _BANCO_RAW y a CAJA.
  const sinRegla = EXTRACTO
    .replace('Deposito e-cheq 48hs presencia bsr', 'Deposito de valores rotulo a')
    .replace('Deposito e-cheq int ots plazas', 'Deposito de valores rotulo b')
  const { movimientos, saldosDeclarados } = parsearExtracto(sinRegla)
  const cierre = cerrarDia(movimientos, saldoDeCierre(saldosDeclarados).saldo)
  assert.equal(cierre.pendientes.length, 0)
  assert.equal(cierre.saldoCalculado, CALCULADO_SIN_EXCLUIR)
  assert.equal(cierre.diferencia, RETENIDO)
  assert.equal(cierre.cierra, false)
  assert.match(cierre.hallazgo, /sin explicar/)
})

test('EL ARREGLO: excluyendo los dos depósitos retenidos, el día cierra contra el saldo declarado', () => {
  const { movimientos, saldosDeclarados } = parsearExtracto(EXTRACTO)
  const pie = saldoDeCierre(saldosDeclarados)
  const cierre = cerrarDia(movimientos, pie.saldo)
  assert.equal(cierre.pendientes.length, 2)
  assert.equal(cierre.retenido, RETENIDO)
  // Si se revierte la exclusión, este saldo vuelve a 42.157.467,50 y el test se pone rojo.
  assert.equal(cierre.saldoCalculado, SALDO_DECLARADO)
  assert.equal(cierre.cierra, true)
  assert.equal(cierre.hallazgo, null)
  assert.equal(cierre.saldoPublicado, SALDO_DECLARADO)
})

test('el back-fill del parser deja los retenidos SIN saldo y no arrastra su importe', () => {
  const { movimientos } = parsearExtracto(EXTRACTO)
  const retenidos = movimientos.filter((m) => m.acreditacionPendiente)
  assert.equal(retenidos.length, 2)
  for (const m of retenidos) assert.equal(m.saldo, null)
  const ultimo = movimientos.filter((m) => !m.acreditacionPendiente).at(-1)
  assert.equal(ultimo.saldo, SALDO_DECLARADO)
})

test('EL CONTROL PUEDE DAR ROJO: un retenido con concepto desconocido deja el día sin explicar', () => {
  // Mismo extracto, pero el banco rotula el depósito grande de otra forma. Nada lo marca, la cadena
  // se infla, y el cierre tiene que DECIRLO en vez de publicar el número calculado.
  const otro = EXTRACTO.replace('Deposito e-cheq int ots plazas', 'Deposito valores rotulo nuevo')
  const { movimientos, saldosDeclarados } = parsearExtracto(otro)
  const cierre = cerrarDia(movimientos, saldoDeCierre(saldosDeclarados).saldo)
  assert.equal(cierre.pendientes.length, 1)
  assert.equal(cierre.cierra, false)
  assert.equal(cierre.diferencia, 32004685.22)
  assert.match(cierre.hallazgo, /sin explicar/)
  // Y aun sin explicación, lo que se publica es el dato del banco.
  assert.equal(cierre.saldoPublicado, SALDO_DECLARADO)
})

test('sin pendientes no hay línea que publicar (un aviso resuelto que sigue puesto se deja de leer)', () => {
  assert.equal(explicacionPendientes([]), '')
  assert.match(explicacionPendientes([{ importe: 6567841.01 }, { importe: 32004685.22 }]), /38\.572\.526,23/)
})

test('el dry-run del núcleo devuelve el pie y el cierre del día', () => {
  const d = dryRun(EXTRACTO)
  assert.equal(d.pie.saldo, SALDO_DECLARADO)
  assert.equal(d.cierre.cierra, true)
  assert.equal(d.cierre.pendientes.length, 2)
})
