// LO QUE ESTAS PRUEBAS IMPIDEN: que un número o una fecha mal leídos salgan de la pantalla hacia
// la fila de una cobranza — y de ahí, por la cola, a la columna Q del Sheet.
//
// El caso del punto de miles ya se pagó en el bot de comprobantes: `3.100.000` leído como 3,1.

import test from 'node:test'
import assert from 'node:assert/strict'
import { aMonto, cambioPagoSchema, cobroSchema, fechaISO } from './entradasCobranza.ts'

test('un monto en argentino no se lee como un decimal', () => {
  assert.equal(aMonto('3.100.000'), 3_100_000)
  assert.equal(aMonto('$ 3.100.000'), 3_100_000)
  assert.equal(aMonto('3100000'), 3_100_000)
  assert.equal(aMonto('1.234,56'), 1234.56)
  assert.equal(aMonto('1234,56'), 1234.56)
  // Sin coma y con el último grupo de menos de tres dígitos, el punto SÍ es decimal: es como
  // llega un número pegado desde una planilla en inglés.
  assert.equal(aMonto('1.5'), 1.5)
  assert.equal(aMonto(''), null)
  assert.equal(aMonto('nueve'), null)
})

test('una fecha que no existe no pasa', () => {
  assert.equal(fechaISO.safeParse('2026-09-17').success, true)
  assert.equal(fechaISO.safeParse('2026-02-30').success, false)  // matchea la regex y no existe
  assert.equal(fechaISO.safeParse('17/09/2026').success, false)  // el formato del Sheet, no el ISO
  assert.equal(fechaISO.safeParse('').success, false)
})

test('un cobro sin monto, sin fecha o sin medio no se registra', () => {
  const ok = cobroSchema.safeParse({ fecha: '2026-09-17', monto: '3.100.000', medio: 'transferencia' })
  assert.equal(ok.success, true)
  assert.equal(ok.success && ok.data.monto, 3_100_000)
  assert.equal(cobroSchema.safeParse({ fecha: '2026-09-17', monto: '0', medio: 'transferencia' }).success, false)
  assert.equal(cobroSchema.safeParse({ fecha: '2026-09-17', monto: '-5', medio: 'transferencia' }).success, false)
  assert.equal(cobroSchema.safeParse({ fecha: '2026-09-17', monto: '100', medio: 'bitcoin' }).success, false)
})

test('un cambio de pago vacío se rechaza en vez de escribir nada', () => {
  // Un `{}` que llega hasta la cola encola un cambio sin campo y el worker escribe una celda con
  // «undefined». Se para acá.
  assert.equal(cambioPagoSchema.safeParse({}).success, false)
  assert.equal(cambioPagoSchema.safeParse({ visible_portal: false }).success, true)
  assert.equal(cambioPagoSchema.safeParse({ fecha: '2026-13-01' }).success, false)
  assert.equal(cambioPagoSchema.safeParse({ aviso_dias: 3 }).success, true)
  assert.equal(cambioPagoSchema.safeParse({ aviso_dias: -1 }).success, false)
  // `null` en aviso_dias es «sin aviso», y tiene que poder mandarse.
  assert.equal(cambioPagoSchema.safeParse({ aviso_dias: null }).success, true)
})

// ═══ AUDITORÍA 18/09/2026: `aMonto` NO TENÍA EL DEFECTO «8.5 → 85», Y ESTO LO SOSTIENE ═══
//
// Un grep de `replace(/\./g, '')` lo marcó junto con `medicionEnLote` y `comprasFiltros`, que sí lo tenían. Acá
// ese replace sólo corre cuando hay coma —donde los puntos SON miles—; sin coma, los puntos son miles sólo si el
// último grupo tiene tres dígitos. Medido contra `leerNumeroEsAR`, el lector de la casa: iguales en todos los
// casos. No es un test de regresión (no hubo defecto): es lo que impide que un «arreglo» apurado lo rompa.
// MUTACIÓN QUE LO PONE ROJO: sacar todos los puntos también sin coma.

test('aMonto LEE IGUAL QUE EL LECTOR DE LA CASA', async () => {
  const { leerNumeroEsAR } = await import('../../../shared/lib/numeroEsAR.ts')
  for (const t of ['8.5', '12.5', '12.50', '1.23', '0.5', '8,5', '1.500', '1.234,5', '3.100.000', '12.345,67', '$ 1.500', '-1.500', '1500']) {
    const l = leerNumeroEsAR(t)
    assert.equal(aMonto(t), l.ok ? l.valor : null, `«${t}»`)
  }
})
