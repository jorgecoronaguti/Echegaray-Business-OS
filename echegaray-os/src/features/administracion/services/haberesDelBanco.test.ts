import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarHaberesDelBanco, rotuloDelPeriodo, type AcreditacionDelBanco } from './haberesDelBanco.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//  1. Que la final se sume a una quincena (regla del dueño: no se considera).
//  2. Que la pantalla elija en silencio entre banco y planilla cuando no coinciden.
//  3. Que un inactivo sin línea de liquidación no vea lo que el banco le pagó.
//  4. Que la planilla que afirma un banco que el banco no acreditó quede invisible.
//  5. Que un mensual se parta en quincenas.

const A = (fecha: string, importe: number, clase: AcreditacionDelBanco['clase'], periodoDesde: string | null = null,
  periodoHasta: string | null = null, confianza: AcreditacionDelBanco['confianza'] = 'coincide_planilla'): AcreditacionDelBanco =>
  ({ fecha, importe, clase, periodoDesde, periodoHasta, confianza, evidencia: 'e', nombreBanco: 'X' })

test('la final va aparte y no suma a ningún período; un inactivo sin liquidación la ve igual', () => {
  const h = armarHaberesDelBanco({
    puedeVer: true, anio: 2026,
    acreditaciones: [
      A('2026-01-16', 155875, 'quincena', '2026-01-01', '2026-01-15'),
      A('2026-04-09', 575437.76, 'liquidacion_final'),
    ],
    planilla: [{ pestana: 'Obreros 26', quincenaDesde: '2026-01-05', quincenaHasta: '2026-01-15', porBanco: 155875, yaTransferido: null }],
    liquidacion: [],
  })
  assert.equal(h.periodos.length, 1)
  assert.equal(h.periodos[0].banco, 155875)
  assert.equal(h.periodos[0].contraPlanilla, 'coincide')
  assert.equal(h.periodos[0].contraLiquidacion, 'difiere', 'sin línea de liquidación: vacía, y el banco pagó')
  assert.equal(h.finales.length, 1)
  assert.equal(h.totales.periodos, 155875)
  assert.equal(h.totales.finales, 575437.76)
  assert.equal(h.totales.acreditado, 731312.76)
})

test('planilla distinta del banco: la fila difiere y conserva los dos números', () => {
  const h = armarHaberesDelBanco({
    puedeVer: true, anio: 2026,
    acreditaciones: [A('2026-04-30', 394700, 'quincena', '2026-04-16', '2026-04-30', 'regla_fecha')],
    planilla: [{ pestana: 'Obreros 26', quincenaDesde: '2026-04-16', quincenaHasta: '2026-04-30', porBanco: 317100, yaTransferido: null }],
    liquidacion: [{ desde: '2026-04-16', hasta: '2026-04-30', porBanco: 317100, pagadoBanco: 317100 }],
  })
  const [x] = h.periodos
  assert.equal(x.banco, 394700); assert.equal(x.planilla, 317100); assert.equal(x.liquidacion, 317100)
  assert.equal(x.difiere, true); assert.equal(x.porRegla, true); assert.equal(h.totales.diferencias, 1)
})

test('la planilla afirma un banco que el certificado no tiene: aparece el período, con banco 0 y «difiere»', () => {
  const h = armarHaberesDelBanco({
    puedeVer: true, anio: 2026, acreditaciones: [],
    planilla: [{ pestana: 'Obreros 26', quincenaDesde: '2026-06-01', quincenaHasta: '2026-06-15', porBanco: 344000, yaTransferido: null }],
    liquidacion: [],
  })
  assert.equal(h.periodos.length, 1)
  assert.equal(h.periodos[0].banco, 0); assert.equal(h.periodos[0].acreditaciones.length, 0)
  assert.equal(h.periodos[0].difiere, true)
})

test('adelanto por banco + BANCO del mismo bloque: se suman contra BANCO + ADELANTO BANCO de la planilla', () => {
  const h = armarHaberesDelBanco({
    puedeVer: true, anio: 2026,
    acreditaciones: [
      A('2026-08-28', 200000, 'adelanto_quincena', '2026-08-16', '2026-08-31'),
      A('2026-08-31', 230240.12, 'quincena', '2026-08-16', '2026-08-31'),
    ],
    planilla: [{ pestana: 'Obreros 26', quincenaDesde: '2026-08-17', quincenaHasta: '2026-08-31', porBanco: 230240.12, yaTransferido: 200000 }],
    liquidacion: [{ desde: '2026-08-16', hasta: '2026-08-31', porBanco: 230240.12, pagadoBanco: 430240.12 }],
  })
  const [x] = h.periodos
  assert.equal(x.banco, 430240.12); assert.equal(x.contraPlanilla, 'coincide'); assert.equal(x.contraLiquidacion, 'coincide')
})

test('un mensual se agrupa por mes, también la planilla (bloques de quincena) y la liquidación', () => {
  const h = armarHaberesDelBanco({
    puedeVer: true, anio: 2026,
    acreditaciones: [
      A('2026-01-13', 991480.92, 'sueldo_mensual', '2025-12-01', '2025-12-31', 'regla_fecha'),
      A('2026-02-05', 1113592.21, 'sueldo_mensual', '2026-01-01', '2026-01-31'),
    ],
    planilla: [{ pestana: 'Oficina 26', quincenaDesde: '2026-01-16', quincenaHasta: '2026-01-31', porBanco: 1113592, yaTransferido: null }],
    liquidacion: [{ desde: '2026-01-16', hasta: '2026-01-31', porBanco: 1113592, pagadoBanco: null }],
  })
  assert.deepEqual(h.periodos.map((x) => [x.desde, x.tipo, x.difiere]), [['2025-12-01', 'mes', true], ['2026-01-01', 'mes', false]])
  assert.equal(rotuloDelPeriodo(h.periodos[0]), 'diciembre 2025')
})

test('sin permiso no hay filas ni totales, y la bandera lo dice', () => {
  const h = armarHaberesDelBanco({ puedeVer: false, anio: 2026, acreditaciones: [A('2026-01-16', 1, 'quincena', '2026-01-01', '2026-01-15')], planilla: [], liquidacion: [] })
  assert.equal(h.puedeVer, false); assert.equal(h.periodos.length, 0); assert.equal(h.totales.acreditado, 0)
})

test('a confirmar no entra a ningún período', () => {
  const h = armarHaberesDelBanco({ puedeVer: true, anio: 2026, acreditaciones: [A('2026-08-13', 239790.94, 'a_confirmar', null, null, null)], planilla: [], liquidacion: [] })
  assert.equal(h.periodos.length, 0); assert.equal(h.aConfirmar.length, 1); assert.equal(h.totales.aConfirmar, 239790.94)
})
