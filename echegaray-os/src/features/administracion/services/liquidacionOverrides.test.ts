import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarOverrides, camposGuardables, sinOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea, type EntradaDeLinea } from './liquidacionQuincena.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que pisar HORAS deje COBRA en el valor viejo: la fila publicaría un importe que no sale de
//     sus propias horas, y es el número que se paga en mano.
//  2. Que un override corte la cadena y los eslabones de abajo NO se recalculen (R5 del handoff).
//  3. Que un CERO escrito a mano se lea como «no hay override» y vuelva la cuenta: «no le doy nada
//     por banco» es una afirmación del dueño, y su edición manda.
//  4. Que una celda vaciada quede pisada para siempre.
//  5. Que las seis celdas sin columna `*_manual` en la base se dibujen editables y guarden un 0
//     indistinguible de «vacío».

const entrada: EntradaDeLinea = {
  personaId: 'p1', nombre: 'Pérez', horas: 100,
  tarifa: { valorHora: 1000, netoMensual: null, desde: '2026-09-01', origen: 'sheet:_J_OBREROS' },
  adelanto: 0, yaTransferido: 20_000, reciboNeto: 30_000, giroEnElLote: true,
}
const linea = liquidarLinea(entrada, 'obreros', null)

test('la línea de partida cumple R5 antes de tocar nada', () => {
  assert.equal(linea.cobra, 100_000)
  assert.equal(linea.porBanco, 30_000)
  assert.equal(linea.enEfectivo, 50_000)
  assert.equal(linea.total, 80_000)
})

test('pisar HORAS mueve COBRA, EN EFECTIVO y TOTAL — la cadena se rehace entera', () => {
  const r = aplicarOverrides(linea, { horas: 120 }, 'obreros')
  assert.equal(r.horas, 120)
  assert.equal(r.cobra, 120_000, 'COBRA sale de las horas pisadas × $/h')
  assert.equal(r.enEfectivo, 70_000)
  assert.equal(r.total, 100_000)
  assert.equal(r.manual.horas, true)
  assert.equal(r.manual.cobra, false, 'COBRA sigue siendo calculada: se movió, no se escribió')
})

test('pisar COBRA gana sobre horas × $/h, y EN EFECTIVO y TOTAL lo siguen', () => {
  const r = aplicarOverrides(linea, { cobra: 90_000 }, 'obreros')
  assert.equal(r.cobra, 90_000)
  assert.equal(r.enEfectivo, 40_000)
  assert.equal(r.total, 70_000)
  assert.equal(r.manual.cobra, true)
})

test('pisar EN EFECTIVO gana sobre la resta, y TOTAL se recalcula sobre lo pisado', () => {
  const r = aplicarOverrides(linea, { enEfectivo: 55_000 }, 'obreros')
  assert.equal(r.enEfectivo, 55_000)
  assert.equal(r.total, 85_000, 'TOTAL = POR BANCO + EN EFECTIVO pisado')
  assert.equal(r.manual.enEfectivo, true)
  assert.equal(r.manual.total, false)
})

test('pisar TOTAL manda aunque no cierre con la suma: su edición es la verdad definitiva', () => {
  const r = aplicarOverrides(linea, { total: 81_000 }, 'obreros')
  assert.equal(r.total, 81_000)
  assert.equal(r.enEfectivo, 50_000, 'el eslabón de arriba no se toca')
  assert.equal(r.manual.total, true)
})

test('UN CERO ESCRITO A MANO ES UN OVERRIDE, no una ausencia', () => {
  // EL DEFECTO: tratar 0 como «vacío» devolvería POR BANCO a $30.000 y le pagaría de menos en mano
  // a alguien a quien el dueño decidió no girarle nada.
  const r = aplicarOverrides(linea, { porBanco: 0 }, 'obreros')
  assert.equal(r.porBanco, 0)
  assert.equal(r.manual.porBanco, true)
  assert.equal(r.enEfectivo, 80_000)
  assert.equal(r.total, 80_000)
})

test('vaciar la celda (null) restablece el cálculo y borra la marca', () => {
  const r = aplicarOverrides(linea, { cobra: null, horas: null }, 'obreros')
  assert.equal(r.cobra, 100_000)
  assert.equal(r.horas, 100)
  assert.equal(r.manual.cobra, false)
  assert.equal(r.manual.horas, false)
})

test('oficina y final NO recalculan COBRA desde las horas: su sueldo no sale de una tarifa horaria', () => {
  const ofi = liquidarLinea({
    ...entrada, horas: null, reciboNeto: null, giroEnElLote: false,
    tarifa: { valorHora: null, netoMensual: 1_800_000, desde: '2026-09-01', origen: 'manual' },
  }, 'oficina', null)
  const r = aplicarOverrides(ofi, { horas: 54 }, 'oficina')
  assert.equal(r.cobra, 1_800_000, 'el neto mensual no se multiplica por horas')
  assert.equal(r.horas, 54)
})

test('pisar COBRA resuelve «sin tarifa»: ya no hay nada pendiente que buscar', () => {
  const sin = liquidarLinea({ ...entrada, tarifa: null }, 'obreros', null)
  assert.equal(sin.sinTarifa, true)
  assert.equal(sin.cobra, null)
  const r = aplicarOverrides(sin, { cobra: 70_000 }, 'obreros')
  assert.equal(r.sinTarifa, false)
  assert.equal(r.cobra, 70_000)
  assert.equal(r.enEfectivo, 20_000)
  assert.equal(r.total, 50_000)
})

test('sin overrides, la línea queda idéntica y sin ninguna marca', () => {
  const r = sinOverrides(linea)
  assert.deepEqual({ ...r, manual: undefined }, { ...linea, manual: undefined })
  assert.equal(Object.values(r.manual).some(Boolean), false)
})

test('SÓLO SE GUARDA DONDE LA BASE PUEDE DECIR «VACÍO»', () => {
  // EL DEFECTO: dibujar editables las seis celdas cuya columna NOT NULL DEFAULT 0 no distingue un
  // cero escrito de un «no hay override».
  assert.deepEqual(camposGuardables(['horas', 'cobra', 'total']), ['horas'])
  assert.deepEqual(
    camposGuardables(['horas', 'cobra_manual', 'adelanto_manual', 'ya_transferido_manual',
      'por_banco_manual', 'en_efectivo_manual', 'total_manual']),
    ['horas', 'cobra', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'total'],
  )
})
