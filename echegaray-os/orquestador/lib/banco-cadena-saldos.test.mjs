import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadGlobal, roturasDeCadena, roturasQueExplican, auditarCuenta } from './banco-cadena-saldos.mjs'

/** Un extracto sano: cada saldo es el anterior más el importe. */
const sano = () => [
  { fecha: '2026-07-01', concepto: 'Transferencia recibida', importe: 1000, saldo_despues: 1000, referencia: 'a' },
  { fecha: '2026-07-02', concepto: 'Pago proveedor', importe: -400, saldo_despues: 600, referencia: 'b' },
  { fecha: '2026-07-03', concepto: 'Comisión', importe: -100, saldo_despues: 500, referencia: 'c' },
]

test('un extracto sano cierra por las dos pruebas', () => {
  const a = auditarCuenta(sano())
  assert.equal(a.identidad.cierra, true)
  assert.deepEqual(a.roturas, [])
  assert.match(a.veredicto, /cierra/)
})

test('LA IDENTIDAD NO DEPENDE DEL ORDEN: desordenar los del mismo día no la rompe', () => {
  // Es la razón de ser de esta prueba: la cadena es sensible al orden intradía y la identidad no.
  const m = sano()
  const desordenado = [m[0], m[2], m[1]]
  // La cadena SÍ se queja...
  assert.ok(roturasDeCadena(desordenado).length > 0, 'la cadena señala el desorden')
  // ...pero el saldo final declarado por el último movimiento del extracto es el de la 3ª fila.
  const i = identidadGlobal(m)
  assert.equal(i.cierra, true, 'la identidad, en el orden del extracto, cierra')
})

test('SI FALTA UN MOVIMIENTO, la identidad lo dice con el monto exacto', () => {
  const m = sano()
  m.splice(1, 1)                                  // se pierde el pago de -400
  const i = identidadGlobal(m)
  assert.equal(i.cierra, false)
  assert.equal(i.diferencia, -400, 'la diferencia ES el importe que falta')
})

test('un importe mal tipeado se ve igual que un movimiento faltante, y eso es correcto', () => {
  const m = sano()
  m[1].importe = -4000                            // se tipeó un cero de más
  const i = identidadGlobal(m)
  assert.equal(i.cierra, false)
  assert.equal(i.diferencia, 3600)
})

test('EL CASO REAL DEL 31/07: 40 roturas y UNA que la identidad confirma', () => {
  // El extracto tenía 40 cortes de cadena por desorden intradía y un agujero real de $113.314,76.
  // Reportar 40 errores por un problema haría que el control no se lea. Se muestra el culpable.
  const roturas = [
    { fecha: '2026-07-01', concepto: 'Deposito e-cheq', referencia: '8538', esperado: 1, real: 2, diferencia: -113314.76 },
    { fecha: '2026-07-01', concepto: 'Anul imp ley', referencia: '8552', esperado: 1, real: 2, diferencia: -3745311.51 },
    { fecha: '2026-07-01', concepto: 'Pago haberes', referencia: '33690901', esperado: 1, real: 2, diferencia: 3861159.77 },
  ]
  const culpables = roturasQueExplican(roturas, -113314.76)
  assert.equal(culpables.length, 1)
  assert.equal(culpables[0].referencia, '8538', 'el depósito de e-cheq es el que la identidad confirma')
})

test('si la identidad CIERRA, ninguna rotura se reporta como culpable', () => {
  // Cuarenta roturas que se compensan no son cuarenta problemas: son cero.
  const roturas = [{ diferencia: -500 }, { diferencia: 500 }]
  assert.deepEqual(roturasQueExplican(roturas, 0), [])
})

test('sin saldos declarados no se inventa un veredicto', () => {
  const a = auditarCuenta([{ fecha: '2026-07-01', importe: 100, saldo_despues: null }])
  assert.equal(a.identidad, null)
  assert.match(a.veredicto, /sin datos/)
})
