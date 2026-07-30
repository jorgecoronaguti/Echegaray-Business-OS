// Tests del cruce de cheques contra el extracto. Herméticos: sin red, sin base.
//
// ═══ EL BUG QUE MOTIVÓ ESTOS TESTS (30/07, visto en la primera corrida) ═══
//
// El emparejador buscaba por importe y NO consumía el movimiento. El extracto real tiene CUATRO
// débitos de $383.175 el mismo día (los echeq 360-363) y TRES depósitos de $10.000.000. Sin consumir:
//   · los 4 cheques matcheaban contra EL MISMO movimiento y los otros 3 se reportaban como
//     "no los explica ningún cheque" — huérfanos FALSOS;
//   · y un cheque En custodia de $10.000.000 se daba por movido porque había OTRO depósito de
//     $10.000.000 de otro cheque — una acusación de error que no existía.
// Un cruce que grita en falso se termina ignorando, que es peor que no tenerlo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claseMovimiento, emparejador, planCruce, EXIGE_BANCO, NO_DEBE_ESTAR } from './cheques-cruce-banco.mjs'

const mov = (id, fecha, concepto, importe) => ({ id, fecha, concepto, importe })
const chq = (numero, importe, estado, extra = {}) => ({ tipo: 'emitido', numero, importe, estado, fecha_pago: '2026-07-07', orden_pago: null, banco: 'Santander', ...extra })

test('claseMovimiento traduce los conceptos reales del Santander', () => {
  assert.equal(claseMovimiento('Deposito e-cheq 48hs presencia bsr'), 'entra_recibido')
  assert.equal(claseMovimiento('Deposito e-cheq int misma plaza'), 'entra_recibido')
  assert.equal(claseMovimiento('Echeq clearing recibido 48hs'), 'sale_emitido')
  assert.equal(claseMovimiento('Echeq canje interno recibido 24hs'), 'sale_emitido')
  assert.equal(claseMovimiento('Cheque debitado'), 'sale_fisico')
  assert.equal(claseMovimiento('Canje interno recibido 24 hs'), 'sale_fisico')
  // Lo que no habla de cheques no entra al cruce: si entrara, todo el extracto sería "huérfano".
  assert.equal(claseMovimiento('Impuesto ley 25.413 debito 0,6%'), null)
  assert.equal(claseMovimiento('Transferencia recibida - credin'), null)
  assert.equal(claseMovimiento(''), null)
})

test('EL BUG: sin consumir, cuatro cheques del mismo importe matchean el mismo movimiento', () => {
  // El caso real: 360, 361, 362 y 363, todos $383.175, todos debitados el 07/07.
  const movs = [1, 2, 3, 4].map((i) => mov(i, '2026-07-07', 'Echeq clearing recibido 48hs', -383175))
  const E = emparejador(movs)
  const tomados = [1, 2, 3, 4].map(() => E.tomar(383175, '2026-07-07'))
  assert.equal(new Set(tomados.map((m) => m.id)).size, 4, 'cada cheque se lleva un movimiento DISTINTO')
  assert.equal(E.tomar(383175), null, 'y el quinto no encuentra nada: se agotaron')
  assert.equal(E.hayLibre(383175), false)
})

test('el emparejador elige el movimiento de fecha MÁS CERCANA a la fecha de pago', () => {
  const movs = [mov(1, '2026-06-06', 'Echeq clearing recibido 48hs', -893098.79), mov(2, '2026-07-06', 'Echeq clearing recibido 48hs', -893098.79)]
  const E = emparejador(movs)
  assert.equal(E.tomar(893098.79, '2026-07-06').id, 2, 'el del 06/07, no el de junio')
  assert.equal(E.tomar(893098.79, '2026-07-06').id, 1, 'el que queda')
})

test('el emparejador ignora el signo: un débito y un cheque emitido son el mismo importe', () => {
  const E = emparejador([mov(1, '2026-07-07', 'Echeq clearing recibido 48hs', -317000)])
  assert.ok(E.tomar(317000), 'el cheque vale 317000 y el movimiento -317000')
})

test('EL LOTE: una orden de pago se deposita junta y se cruza por la SUMA', () => {
  // La O/P 4865 real: 5 cheques que el banco acreditó como un solo depósito.
  const cheques = [
    ['19096', 661598.92], ['16092', 4632663.5], ['29313193', 1704000], ['2007', 5176500], ['16097', 4632663.5],
  ].map(([n, i]) => chq(n, i, 'Depositado', { tipo: 'recibido', orden_pago: '0000000004865', fecha_pago: '2026-07-22' }))
  const movs = [mov(1, '2026-07-29', 'Deposito e-cheq 48hs presencia bsr', 16807425.92)]
  const p = planCruce(cheques, movs)
  assert.equal(p.lotes.length, 1)
  assert.equal(p.lotes[0].suma, 16807425.92)
  assert.equal(p.lotes[0].cheques.length, 5)
  assert.deepEqual(p.sinMovimiento, [], 'ninguno queda sin explicar')
  assert.deepEqual(p.huerfanos, [], 'y el movimiento queda consumido: no es huérfano')
})

test('si el lote NO cierra, se cae a cruzar cheque por cheque (no se da por bueno)', () => {
  const cheques = [chq('A', 100, 'Depositado', { orden_pago: 'OP1' }), chq('B', 200, 'Depositado', { orden_pago: 'OP1' })]
  const movs = [mov(1, '2026-07-07', 'Deposito e-cheq int misma plaza', 100), mov(2, '2026-07-07', 'Deposito e-cheq int misma plaza', 200)]
  const p = planCruce(cheques, movs)
  assert.equal(p.lotes.length, 0, 'no hay depósito por 300')
  assert.equal(p.sueltos.length, 2, 'los dos se explican de a uno')
  assert.deepEqual(p.huerfanos, [])
})

test('EL FIX de la alarma falsa: un cheque En custodia NO se acusa por el movimiento de otro', () => {
  // Tres cheques de $10.000.000: uno se depositó, dos siguen en cartera/endosados. UN solo movimiento.
  const cheques = [
    chq('90020098', 10000000, 'Depositado', { tipo: 'recibido' }),
    chq('90020099', 10000000, 'En custodia', { tipo: 'recibido' }),
    chq('90020100', 10000000, 'Endosado', { tipo: 'recibido' }),
  ]
  const movs = [mov(1, '2026-07-16', 'Deposito e-cheq int misma plaza', 10000000)]
  const p = planCruce(cheques, movs)
  assert.equal(p.sueltos.length, 1, 'sólo el depositado se empareja')
  const sospechas = p.noCorresponde.filter((x) => x.sospecha)
  assert.deepEqual(sospechas, [], 'los otros dos NO se acusan: su importe ya lo consumió el depositado')
  assert.deepEqual(p.huerfanos, [], 'y no queda movimiento sin explicar')
})

test('la sospecha SÍ aparece cuando de verdad sobra un movimiento de ese importe', () => {
  // Dos depósitos de $10.000.000 y un solo cheque, que dice estar en custodia: eso hay que mirarlo.
  const cheques = [chq('90020099', 10000000, 'En custodia', { tipo: 'recibido' })]
  const movs = [mov(1, '2026-07-16', 'Deposito e-cheq int misma plaza', 10000000)]
  const p = planCruce(cheques, movs)
  assert.equal(p.noCorresponde.length, 1)
  assert.equal(p.noCorresponde[0].sospecha, true, 'queda un depósito libre por ese importe: es señal')
})

test('un cheque que dice estar pagado y no tiene movimiento se REPORTA, no se descarta', () => {
  const p = planCruce([chq('999', 555555, 'Pagado')], [])
  assert.equal(p.sinMovimiento.length, 1)
  assert.equal(p.sinMovimiento[0].numero, '999')
})

test('DIRECCIÓN 2: los movimientos de cheque que ningún cheque explica son la ceguera del registro', () => {
  const cheques = [chq('306', 317000, 'Pagado', { fecha_pago: '2026-07-07' })]
  const movs = [
    mov(1, '2026-07-07', 'Echeq clearing recibido 48hs', -317000),   // lo explica el 306
    mov(2, '2026-07-16', 'Cheque debitado', -200000),                 // físico que el OS no tiene
    mov(3, '2026-07-01', 'Deposito e-cheq int misma plaza', 15000000), // recibido que el OS no tiene
    mov(4, '2026-07-30', 'Impuesto ley 25.413 debito 0,6%', -5921.3),  // no habla de cheques
  ]
  const p = planCruce(cheques, movs)
  assert.equal(p.huerfanos.length, 2, 'sólo los dos de cheques, y el del 306 ya está consumido')
  assert.deepEqual(p.huerfanos.map((h) => h.clase).sort(), ['entra_recibido', 'sale_fisico'])
  assert.ok(!p.huerfanos.some((h) => h.id === 4), 'un impuesto no es un cheque huérfano')
})

test('los conjuntos de estados dicen quién exige movimiento y quién exige ausencia', () => {
  assert.ok(EXIGE_BANCO.has('Depositado') && EXIGE_BANCO.has('Pagado'))
  // Un endosado salió sin pasar por la cuenta: si apareciera en el extracto, ESO sería el error.
  for (const e of ['En custodia', 'Aceptado', 'Por aceptar', 'Endosado']) assert.ok(NO_DEBE_ESTAR.has(e), e)
  for (const e of EXIGE_BANCO) assert.ok(!NO_DEBE_ESTAR.has(e), 'ningún estado está en los dos')
})
