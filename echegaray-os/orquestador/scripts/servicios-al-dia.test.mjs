// EL CONTROL EXTERNO DEL SEGUNDO DEFECTO (23/09/2026): UN DAEMON `active` PUEDE LLEVAR CÓDIGO VIEJO.
//
// `produccion-al-dia.mjs` avanza el disco; los daemons siguen con lo que cargaron al arrancar. Este
// chequeo compara CUÁNDO arrancó cada uno (systemd) con CUÁNDO cambió el checkout (git) — dos
// fuentes que no dependen del script que reinicia. Acá se prueba la regla, sin git ni systemd.

import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarServicio, codigoDeSalida, parsearFechaReflog, parsearEpoch } from './servicios-al-dia.mjs'

const CAMBIO = 1790163993 // 2026-09-23T08:46:33-03:00, el último ff-merge real del checkout de producción

test('activo y arrancado ANTES del cambio del checkout: atrasado', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // El 23/09 asistencia-http, xsas-gateway, orq-worker y orq-interactive arrancaron a las 08:36:16 y
  // el checkout cambió a las 08:46:33. systemd decía `active` para los cuatro. Eso es «atrasado».
  const r = evaluarServicio({ activeState: 'active', arranque: 1790163376, cambioCheckout: CAMBIO })
  assert.equal(r.veredicto, 'atrasado')
  assert.match(r.porQue, /código anterior/)
})

test('activo y arrancado DESPUÉS del cambio: al día', () => {
  assert.equal(evaluarServicio({ activeState: 'active', arranque: CAMBIO + 9, cambioCheckout: CAMBIO }).veredicto, 'al-dia')
})

test('el mismo segundo cuenta como al día: systemd y git resuelven a segundos y el restart viene después del merge', () => {
  assert.equal(evaluarServicio({ activeState: 'active', arranque: CAMBIO, cambioCheckout: CAMBIO }).veredicto, 'al-dia')
})

test('parado no es atrasado: no hay código en memoria, y si está parado suele ser a propósito', () => {
  for (const activeState of ['inactive', 'failed', 'activating', 'deactivating', undefined]) {
    const r = evaluarServicio({ activeState, arranque: 1, cambioCheckout: CAMBIO })
    assert.equal(r.veredicto, 'no-activo', `esperaba no-activo para ${activeState}`)
  }
})

test('activo pero sin fecha de arranque o sin fecha de cambio: sin-dato, nunca «al día» por omisión', () => {
  assert.equal(evaluarServicio({ activeState: 'active', arranque: null, cambioCheckout: CAMBIO }).veredicto, 'sin-dato')
  assert.equal(evaluarServicio({ activeState: 'active', arranque: CAMBIO + 1, cambioCheckout: NaN }).veredicto, 'sin-dato')
})

test('el código de salida es 1 sólo si hay al menos un atrasado', () => {
  assert.equal(codigoDeSalida(['al-dia', 'no-activo', 'sin-dato']), 0)
  assert.equal(codigoDeSalida(['al-dia', 'atrasado']), 1)
  assert.equal(codigoDeSalida([]), 0)
})

test('parsearFechaReflog lee el momento en que HEAD se movió, que no es la fecha del commit', () => {
  // La línea real del checkout de producción del 23/09: el commit es de las 08:46:25, el merge de las 08:46:33.
  const linea = 'd89e2693 HEAD@{2026-09-23T08:46:33-03:00}: merge origin/main: Fast-forward'
  assert.equal(parsearFechaReflog(linea), CAMBIO)
  assert.equal(parsearFechaReflog(''), null)
  assert.equal(parsearFechaReflog('d89e2693 HEAD@{0}: merge'), null)
})

test('parsearEpoch lee `@1790163993` de systemctl --timestamp=unix y devuelve null si está vacío', () => {
  assert.equal(parsearEpoch('@1790163993'), 1790163993)
  assert.equal(parsearEpoch('1790163993'), 1790163993)
  assert.equal(parsearEpoch(''), null)
  assert.equal(parsearEpoch(undefined), null)
  assert.equal(parsearEpoch('Tue 2026-09-23 08:46:33 -03'), null)
})
