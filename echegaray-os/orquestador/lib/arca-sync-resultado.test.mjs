// EL SYNC DE ARCA NO PUEDE VOLVER A FESTEJAR UNA CORRIDA QUE NO DESCARGÓ NADA.
//
// Los casos de abajo son literalmente los del 03/08/2026: las dos descargas rotas, el ingest releyendo
// archivos viejos, la frescura saliendo de la tabla y systemd anotando "Finished". Si alguien
// restaura cualquiera de esas tres piezas, uno de estos tests se pone rojo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aISO, motivoDeFalla, statusHttp, consumioCuota, archivoDescargado,
  decidirFrescura, codigoDeSalida, resumenDeCorrida,
} from './arca-sync-resultado.mjs'

/** El stderr EXACTO que Node produce cuando afipsdk-comprobantes.mjs lanza en la línea 70. */
const STDERR_REAL = [
  'file:///home/jorge/echegaray-os/app/echegaray-os/scripts/arca/afipsdk-comprobantes.mjs:70',
  '  if (!res.ok) throw new Error(`crear automation: ${res.status} ${JSON.stringify(j).slice(0, 300)}`)',
  '         ^',
  '',
  'Error: crear automation: 401 {"message":"El token proporcionado es invalido."}',
  '    at crear (file:///…/afipsdk-comprobantes.mjs:70:24)',
  '    at async file:///…/afipsdk-comprobantes.mjs:105:16',
].join('\n')

test('EL STATUS HTTP SOBREVIVE al volcado de Node — el defecto del 03/08', () => {
  // `String(e.stderr).slice(0, 200)` se quedaba con la ruta, la línea de código y el `^`. El renglón
  // "Error: crear automation: 401" viene DESPUÉS del corte: el journal registró el ruido y perdió el
  // único dato que permitía saber qué había pasado.
  const viejo = String(STDERR_REAL).slice(0, 200)
  assert.ok(!/401/.test(viejo), 'así se perdía el status: el test fija por qué el truncado estaba mal')

  const motivo = motivoDeFalla({ stderr: STDERR_REAL })
  assert.match(motivo, /Error: crear automation: 401/)
  assert.equal(statusHttp(motivo), 401)
})

test('sin línea "Error:" igual devuelve algo útil, nunca la ruta del archivo sola', () => {
  assert.equal(motivoDeFalla({ message: 'timeout' }), 'timeout')
  assert.equal(motivoDeFalla({}), 'sin salida de error')
})

test('una creación RECHAZADA no gastó cuota: no se le descuenta al mes', () => {
  // Con el plan free en 10, contar tres errores de token dejaría al dueño sin poder bajar sus
  // comprobantes por una falla que no consumió nada.
  assert.equal(consumioCuota({ ok: false, motivo: 'Error: crear automation: 401 {"message":"…"}' }), false)
  assert.equal(consumioCuota({ ok: false, motivo: 'Error: crear automation: 402 {"message":"…"}' }), false)
  // En cambio, si la automatización se creó y reventó DESPUÉS (timeout esperando el resultado), la
  // cuota ya se fue: se cuenta.
  assert.equal(consumioCuota({ ok: false, motivo: 'Error: timeout: la automation no terminó en 5 min' }), true)
  assert.equal(consumioCuota({ ok: true }), true)
})

test('el archivo a ingerir sale de la salida de la PROPIA descarga', () => {
  const stdout = [
    'IVA COMPRAS (recibidos) 01/01/2026–07/08/2026: 586 comprobantes',
    '  Detalle -> /home/jorge/…/scripts/arca/out/comprobantes-R-01012026-07082026.json',
  ].join('\n')
  assert.equal(archivoDescargado(stdout), '/home/jorge/…/scripts/arca/out/comprobantes-R-01012026-07082026.json')
  assert.equal(archivoDescargado('nada que ver'), null)
})

// ── LA FRESCURA ──────────────────────────────────────────────────────────────────────────────────

test('LAS DOS DESCARGAS ROTAS NO REGISTRAN FRESCURA — el caso exacto del 03/08', () => {
  const f = decidirFrescura([
    { tipo: 'R', ok: false, hasta: '03/08/2026', ingerido: false },
    { tipo: 'E', ok: false, hasta: '03/08/2026', ingerido: false },
  ])
  assert.equal(f.ventas.registrar, false)
  assert.equal(f.compras.registrar, false)
  assert.match(f.ventas.motivo, /falló/)
})

test('una descarga OK y la otra rota: se declara SÓLO el libro que anduvo', () => {
  // El error de diseño anterior tomaba max(fecha_emision) de la tabla entera, así que el libro roto
  // heredaba la frescura del que anduvo — y a veces la de la semana pasada.
  const f = decidirFrescura([
    { tipo: 'R', ok: true, hasta: '07/08/2026', ingerido: true },
    { tipo: 'E', ok: false, hasta: '07/08/2026', ingerido: false },
  ])
  assert.deepEqual([f.compras.registrar, f.compras.cobertura], [true, '2026-08-07'])
  assert.equal(f.ventas.registrar, false)
})

test('descargado pero NO ingerido tampoco declara cobertura: la base no tiene esos datos', () => {
  const f = decidirFrescura([{ tipo: 'E', ok: true, hasta: '07/08/2026', ingerido: false }])
  assert.equal(f.ventas.registrar, false)
  assert.match(f.ventas.motivo, /no se ingirió/)
})

test('la cobertura es la fecha REALMENTE pedida y traída, convertida a ISO', () => {
  assert.equal(aISO('07/08/2026'), '2026-08-07')
  assert.equal(aISO('7/8/2026'), '2026-08-07')
  assert.equal(aISO('2026-08-07'), null, 'una fecha que no viene en dd/mm/aaaa no se adivina')
  const f = decidirFrescura([{ tipo: 'E', ok: true, hasta: 'cuando sea', ingerido: true }])
  assert.equal(f.ventas.registrar, false, 'sin poder leer la fecha no se declara cobertura')
})

// ── EL CÓDIGO DE SALIDA ──────────────────────────────────────────────────────────────────────────

test('UNA DESCARGA ROTA TERMINA EN ERROR, aunque el ingest haya andado', () => {
  // Terminar en 0 hace que systemd anote "Finished" y que nadie mire el journal: así el 03/08 pasó
  // desapercibido cuatro días.
  assert.equal(codigoDeSalida([{ tipo: 'R', ok: false }, { tipo: 'E', ok: true }], { ingestOk: true }), 1)
  assert.equal(codigoDeSalida([{ tipo: 'R', ok: true }, { tipo: 'E', ok: true }], { ingestOk: true }), 0)
  assert.equal(codigoDeSalida([{ tipo: 'R', ok: true }, { tipo: 'E', ok: true }], { ingestOk: false }), 1)
  assert.equal(codigoDeSalida([], {}), 1, 'no haber intentado nada no es un éxito')
})

test('el resumen del journal lleva el status HTTP adelante', () => {
  const lineas = resumenDeCorrida([
    { tipo: 'R', ok: false, motivo: 'Error: crear automation: 401 {"message":"El token proporcionado es invalido."}' },
    { tipo: 'E', ok: true, hasta: '07/08/2026', archivo: '/out/comprobantes-E.json' },
  ])
  assert.match(lineas[0], /R: FALLÓ \(HTTP 401\)/)
  assert.match(lineas[1], /E: ok hasta 07\/08\/2026/)
})
