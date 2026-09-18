// LO GUARDADO, DECODIFICADO — con foco en lo que la migración 20260915T2340 agrega.
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · leer un `pagado_banco` de 0 como «no hay override» (devolvería el adelanto y pediría girar de nuevo).
//   · dejar entrar cualquier clave del jsonb `formulas` como si fuera una celda del cuadro.
//   · escribir una celda con un número suelto y NO borrar la cuenta vieja que tenía.
//   · pisar las cuentas de las OTRAS celdas al escribir una.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulasDeLinea, leerGuardadas, siguientesFormulas } from './liquidacionGuardadas.ts'

test('LOS PAGOS GUARDADOS LLEGAN COMO OVERRIDE, Y UN 0 ES UN 0', () => {
  const { overrides } = leerGuardadas([{
    id: 'q1', grupo: 'obreros', estado: 'abierta', cerrada_en: null,
    liquidacion_linea: [{ persona_id: 'p1', efectivo_redondeado: null, pagado_banco: 0, pagado_efectivo: '140000' }],
  }])
  assert.equal(overrides.get('p1')?.pagadoBanco, 0, 'MUTACIÓN: tratar el 0 como vacío devolvería el adelanto')
  assert.equal(overrides.get('p1')?.pagadoEfectivo, 140000)
})

test('SIN LA MIGRACIÓN NO HAY OVERRIDE DE PAGO: null, no cero', () => {
  const { overrides } = leerGuardadas([{
    id: 'q1', grupo: 'obreros', estado: 'abierta', cerrada_en: null,
    liquidacion_linea: [{ persona_id: 'p1', efectivo_redondeado: null }],
  }])
  assert.equal(overrides.get('p1')?.pagadoBanco, null)
})

test('DEL JSONB SÓLO ENTRAN CAMPOS QUE EXISTEN Y CON TEXTO', () => {
  assert.deepEqual(
    formulasDeLinea({ pagadoEfectivo: '=100000+40000', inventado: '=1+1', negro: '', horas: 9 }),
    { pagadoEfectivo: '=100000+40000' },
  )
  assert.deepEqual(formulasDeLinea(null), {})
  assert.deepEqual(formulasDeLinea('=1+1'), {}, 'un jsonb que no es objeto no aporta ninguna celda')
  assert.deepEqual(formulasDeLinea(['=1+1']), {})
})

test('LAS CUENTAS DE LAS OTRAS CELDAS NO SE PISAN AL ESCRIBIR UNA', () => {
  const antes = { pagadoBanco: '=10+10', negro: '=9*105' }
  assert.deepEqual(
    siguientesFormulas(antes, 'pagadoEfectivo', '=100000+40000'),
    { pagadoBanco: '=10+10', negro: '=9*105', pagadoEfectivo: '=100000+40000' },
  )
})

test('UN NÚMERO SUELTO BORRA LA CUENTA QUE HABÍA EN ESA CELDA', () => {
  const antes = { pagadoBanco: '=10+10', negro: '=9*105' }
  assert.deepEqual(
    siguientesFormulas(antes, 'pagadoBanco', null),
    { negro: '=9*105' },
    'MUTACIÓN: dejar la cuenta vieja mostraría una expresión que ya no explica el número guardado',
  )
})

test('LA FOTO DEL PRESENTISMO Y EL REDONDEO SIGUEN SALIENDO IGUAL', () => {
  const { redondeos, presentismosSellados, formulas } = leerGuardadas([{
    id: 'q1', grupo: 'obreros', estado: 'cerrada', cerrada_en: '2026-09-16',
    liquidacion_linea: [{
      persona_id: 'p1', efectivo_redondeado: '120000', presentismo: '42000', presentismo_perdido: '2026-09-03',
      formulas: { negro: '=9*105' },
    }],
  }])
  assert.equal(redondeos.get('p1'), 120000)
  assert.equal(presentismosSellados.get('p1')?.estado, 'perdido')
  assert.deepEqual(formulas.get('p1'), { negro: '=9*105' })
})

test('LA FOTO SELLADA VIAJA POR GRUPO, COLUMNA POR COLUMNA, Y UNA COLUMNA VACÍA ES NULL (18/09/2026)', () => {
  const { lineasSelladas } = leerGuardadas([{
    id: 'q1', grupo: 'obreros', estado: 'cerrada', cerrada_en: '2026-09-09',
    liquidacion_linea: [
      { persona_id: 'bazan', efectivo_redondeado: null, horas: '9.00', valor_hora: '4300.00', cobra: '38700.00', adelanto: '0.00', ya_transferido: '0.00', por_banco: '0.00', en_efectivo: '38700.00', total: '38700.00' },
      { persona_id: 'vieja', efectivo_redondeado: null, horas: null, valor_hora: null, cobra: '250000.00', adelanto: '0.00', ya_transferido: '0.00', por_banco: '0.00', en_efectivo: '250000.00', total: '250000.00' },
    ],
  }, {
    id: 'q2', grupo: 'oficina', estado: 'cerrada', cerrada_en: '2026-09-15',
    liquidacion_linea: [{ persona_id: 'maldonado', efectivo_redondeado: null, horas: '105.00', valor_hora: '8125.00', cobra: '853125.00', adelanto: '0.00', ya_transferido: '0.00', por_banco: '0.00', en_efectivo: '853125.00', total: '853125.00' }],
  }])
  assert.deepEqual(lineasSelladas.get('obreros')?.[0], {
    personaId: 'bazan', horas: 9, valorHora: 4300, cobra: 38700, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 38700, total: 38700,
  })
  const vieja = lineasSelladas.get('obreros')?.[1]
  assert.equal(vieja?.horas, null, 'MUTACIÓN: una columna vacía leída como 0')
  assert.equal(vieja?.valorHora, null)
  assert.equal(vieja?.cobra, 250000)
  assert.equal(lineasSelladas.get('oficina')?.[0].cobra, 853125)
})
