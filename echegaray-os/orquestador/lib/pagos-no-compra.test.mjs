import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PESTANA_PAGOS_NC, COLUMNAS_PAGOS_NC, RUBROS_PAGOS_NC, refsPagosNC, validarPagoNC, clavePagoNC, filaPagoNC, pagoDeFila,
  planDeAltaNC, condicionesPagoNC, periodoDe, aIso,
} from './pagos-no-compra.mjs'

const ENC = [['título'], ['nota'], COLUMNAS_PAGOS_NC.map(([n]) => n)]
const RODRIGO = { fecha: '2026-09-09', concepto: 'Retiro de Dirección · agosto', rubro: RUBROS_PAGOS_NC.direccion, persona: 'Rodrigo Echegaray', importe: 1000000, medio: 'Transferencia', periodo: '2026-08', referencia: '17283120', origen: 'extracto 18/09' }
const CORONA_1 = { ...RODRIGO, fecha: '2026-09-11', persona: 'Jorge Corona', importe: 300000, referencia: '16180825' }
const CORONA_2 = { ...RODRIGO, fecha: '2026-09-17', persona: 'Jorge Corona', importe: 500000, referencia: '14388792' }

test('un pago sin fecha real, sin rubro conocido, sin importe o sin período NO entra', () => {
  assert.deepEqual(validarPagoNC(RODRIGO), [])
  assert.ok(validarPagoNC({ ...RODRIGO, fecha: '09/09/2026' }).some((m) => m.startsWith('fecha')))
  assert.ok(validarPagoNC({ ...RODRIGO, rubro: 'Sueldos' }).some((m) => m.startsWith('rubro')))
  assert.ok(validarPagoNC({ ...RODRIGO, importe: -1000000 }).some((m) => m.startsWith('importe')))
  assert.ok(validarPagoNC({ ...RODRIGO, periodo: 'agosto' }).some((m) => m.startsWith('periodo')))
  assert.ok(validarPagoNC({ ...RODRIGO, persona: '' }).some((m) => m.startsWith('persona')), 'un retiro es de un socio')
})

test('la identidad es la referencia del banco; sin ella, el dato', () => {
  assert.equal(clavePagoNC(RODRIGO), 'ref:17283120')
  assert.equal(clavePagoNC({ ...RODRIGO, referencia: '0017283120' }), 'ref:17283120', 'los ceros a la izquierda no distinguen')
  assert.equal(clavePagoNC({ ...RODRIGO, referencia: '' }), `dato:2026-09-09|${RUBROS_PAGOS_NC.direccion}|rodrigo echegaray|1000000`)
})

test('la fila va en el orden del contrato y vuelve igual al leerla (con la fecha como serial)', () => {
  const f = filaPagoNC(RODRIGO)
  assert.equal(f.length, COLUMNAS_PAGOS_NC.length)
  assert.deepEqual(f.slice(0, 5), ['2026-09-09', 'Retiro de Dirección · agosto', RUBROS_PAGOS_NC.direccion, 'Rodrigo Echegaray', 1000000])
  const leida = pagoDeFila([46274, ...f.slice(1)]) // 46274 = 09/09/2026 como serial
  assert.equal(leida.fecha, '2026-09-09')
  assert.equal(aIso(46274), '2026-09-09')
  assert.equal(aIso('9/9/2026'), '2026-09-09')
  assert.equal(pagoDeFila([]), null)
})

test('EL PLAN DE ALTA: agrega lo nuevo, no repite lo que está, no propone bajas y respeta huecos', () => {
  const leidas = [...ENC, filaPagoNC(RODRIGO), [], ['']]
  const plan = planDeAltaNC(leidas, [RODRIGO, CORONA_1, CORONA_2, CORONA_2, { ...CORONA_1, importe: 0 }])
  assert.ok(plan.rotulosOk)
  assert.equal(plan.existentes.length, 1)
  assert.equal(plan.primeraLibre, 5, 'la primera libre sigue a la ÚLTIMA fila con dato, no al largo de lo leído')
  assert.deepEqual(plan.altas.map((p) => p.referencia), ['16180825', '14388792'], 'Rodrigo ya estaba; Corona 2 repetido en el lote entra una vez')
  assert.equal(plan.yaEstaban.length, 2)
  assert.equal(plan.rechazados.length, 1)
  assert.ok(!('bajas' in plan), 'esta pestaña no se borra')
})

test('con el encabezado cambiado el plan lo dice y nadie escribe', () => {
  const plan = planDeAltaNC([['t'], ['n'], ['Fecha', 'Concepto', 'Rubro', 'Socio']], [RODRIGO])
  assert.equal(plan.rotulosOk, false)
})

test('las condiciones para otras pestañas eligen por rubro y período explícitos, en es-AR', () => {
  const c = condicionesPagoNC(RUBROS_PAGOS_NC.direccion, periodoDe(2026, 8))
  assert.deepEqual(c, [
    `('${PESTANA_PAGOS_NC}'!$C$4:$C="${RUBROS_PAGOS_NC.direccion}")`,
    `('${PESTANA_PAGOS_NC}'!$G$4:$G&""="2026-08")`,
  ])
  assert.equal(refsPagosNC.importe, `'${PESTANA_PAGOS_NC}'!$E$4:$E`)
  assert.equal(periodoDe(2026, 13), '2027-01', 'diciembre+1 es enero del año que viene, no un mes 13')
})

test('EL MISMO RETIRO EN COMPRAS Y EN LA PESTAÑA SE DETECTA (revisión 19/09): persona, importe y ±5 días', async () => {
  const { enComprasTambien } = await import('./pagos-no-compra.mjs')
  const alta = { fecha: '2026-09-11', persona: 'Jorge Corona', importe: 300000, rubro: 'x', periodo: '2026-08' }
  const compras = [
    { fila: 779, persona: 'jorge corona', importe: 300000, fecha: '2026-09-09' },
    { fila: 780, persona: 'Jorge Corona', importe: 300000, fecha: '2026-08-01' },
    { fila: 781, persona: 'Rodrigo Echegaray', importe: 300000, fecha: '2026-09-11' },
  ]
  assert.deepEqual(enComprasTambien([alta], compras), [{ pago: alta, filas: [779] }])
  assert.deepEqual(enComprasTambien([{ ...alta, importe: 500000 }], compras), [], 'otro importe no es el mismo pago')
})
