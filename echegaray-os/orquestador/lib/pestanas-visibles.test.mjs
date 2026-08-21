import test from 'node:test'
import assert from 'node:assert/strict'
import { ESPEJOS_A_OCULTAR, A_LA_VISTA_A_PROPOSITO, pedidosDeOcultar } from './pestanas-visibles.mjs'

test('nunca se oculta una pestaña que una persona carga o mira', () => {
  // Los tres contraejemplos que costaron pensarlos. Si alguien los mete en la lista de ocultar,
  // esto se pone rojo: `_UOCRA_RAW` se carga a mano, `_PRESUPUESTO_MENSUAL` lo escribe el dueño y
  // `_CAJA_ANEXO` es el detalle al que se va cuando un control no cierra.
  for (const n of ['_UOCRA_RAW', '_PRESUPUESTO_MENSUAL', '_CAJA_ANEXO', '_CRUCE_ARCA']) {
    assert.ok(!ESPEJOS_A_OCULTAR.includes(n), `${n} no se puede ocultar: no es pura captura`)
  }
  for (const n of Object.keys(A_LA_VISTA_A_PROPOSITO)) {
    assert.ok(String(A_LA_VISTA_A_PROPOSITO[n]).length > 20, `${n} está exceptuada sin motivo escrito`)
  }
})

test('sólo se pide ocultar lo que hoy está visible — idempotente', () => {
  const hojas = [
    { title: '_BANCO_RAW', sheetId: 1, hidden: false },
    { title: '_ARCA_RAW', sheetId: 2, hidden: true },
    { title: 'CAJA', sheetId: 3, hidden: false },
  ]
  const r = pedidosDeOcultar(hojas)
  assert.equal(r.cambios.length, 1, 'pidió ocultar algo que ya estaba oculto, o algo que no toca')
  assert.equal(r.cambios[0].updateSheetProperties.properties.sheetId, 1)
  assert.deepEqual(r.yaOcultas, ['_ARCA_RAW'])
  assert.equal(r.noEstan.length, ESPEJOS_A_OCULTAR.length - 2, 'no avisa de las que no encontró')
})

test('correr dos veces no hace nada la segunda', () => {
  const hojas = ESPEJOS_A_OCULTAR.map((t, i) => ({ title: t, sheetId: i, hidden: true }))
  assert.deepEqual(pedidosDeOcultar(hojas).cambios, [])
})
