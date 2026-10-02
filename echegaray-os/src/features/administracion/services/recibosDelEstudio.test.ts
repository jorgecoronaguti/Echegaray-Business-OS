// EL MENSUALIZADO COBRA POR MES: SU BANCO ES LA SUMA DE LOS DOS RECIBOS DEL ESTUDIO (dueño, 02/10/2026).
//
// Cifras reales de septiembre 2026 (Maldonado y Nievas, los dos mensualizados con recibo): Q1 705.532,04 + Q2 685.914,88
// = 1.391.446,92. El sistema tomaba sólo la 2ª (685.914,88) y el papel decía banco por la mitad del mes.
//
// MUTACIÓN que estos tests ponen en rojo: volver a tomar sólo el período de la quincena liquidada para el mensual
// (`periodosQueCorresponden('mensual', …)` devolviendo uno) → «mensual con dos recibos», «el cuadro», «el recibo»,
// «con arrastre» y «lo recibido en el banco».

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quincenaDe } from './quincena.ts'
import { armarCuadros, type DatosDeCuadros, type FilaRecibo } from './liquidacionCuadros.ts'
import { aplicarOverrides } from './liquidacionOverrides.ts'
import { conArrastres, type ArrastresDeLaQuincena } from './liquidacionArrastre.ts'
import { armarRecibo, eleccionInicial } from './reciboDeLaQuincena.ts'
import { arrastreYaIncluido, periodosQueCorresponden, recibosDelEstudio } from './recibosDelEstudio.ts'

const CUIL = '20359232668'
const Q1: FilaRecibo = { cuil: CUIL, periodo: 'Q1-09/2026', neto: 705532.04, fecha_pago: '2026-09-15' }
const Q2: FilaRecibo = { cuil: CUIL, periodo: 'Q2-09/2026', neto: 685914.88, fecha_pago: '2026-09-30' }

test('mensual con dos recibos: el banco es la suma, con cada neto y su período', () => {
  const r = recibosDelEstudio({ cuil: CUIL, modalidad: 'mensual', desde: '2026-09-16', filas: [Q2, Q1] })
  assert.equal(r.total, 1391446.92)
  assert.deepEqual(r.recibos, [{ periodo: 'Q1-09/2026', neto: 705532.04 }, { periodo: 'Q2-09/2026', neto: 685914.88 }])
  assert.deepEqual(r.faltan, [])
})

test('mensual con un recibo faltante: no hay total, se dice cuál falta y no se asume cero', () => {
  const sinQ2 = recibosDelEstudio({ cuil: CUIL, modalidad: 'mensual', desde: '2026-09-16', filas: [Q1] })
  assert.equal(sinQ2.total, null)
  assert.deepEqual(sinQ2.faltan, ['Q2-09/2026'])
  const sinQ1 = recibosDelEstudio({ cuil: CUIL, modalidad: 'mensual', desde: '2026-09-16', filas: [Q2] })
  assert.equal(sinQ1.total, null)
  assert.deepEqual(sinQ1.faltan, ['Q1-09/2026'])
})

test('quincenal: sin cambios, sólo el recibo de esa quincena (el de la otra no entra)', () => {
  assert.deepEqual(periodosQueCorresponden('quincenal', '2026-09-16'), ['Q2-09/2026'])
  const r = recibosDelEstudio({ cuil: CUIL, modalidad: 'quincenal', desde: '2026-09-16', filas: [Q1, Q2] })
  assert.equal(r.total, 685914.88)
  assert.deepEqual(r.faltan, [])
  assert.equal(recibosDelEstudio({ cuil: CUIL, modalidad: 'quincenal', desde: '2026-09-01', filas: [Q2] }).total, null)
})

test('el CUIL se empareja por dígitos y otra persona no suma', () => {
  const r = recibosDelEstudio({ cuil: '20-35923266-8', modalidad: 'mensual', desde: '2026-09-16', filas: [Q1, Q2, { ...Q1, cuil: '20403679764', neto: 1 }] })
  assert.equal(r.total, 1391446.92)
  assert.equal(recibosDelEstudio({ cuil: null, modalidad: 'mensual', desde: '2026-09-16', filas: [Q1, Q2] }).total, null)
})

test('arrastre: el recibo de la 1ª quincena ya está en el banco del mensual, no se suma otra vez', () => {
  const periodos = periodosQueCorresponden('mensual', '2026-09-16')
  assert.equal(arrastreYaIncluido('Q1-09/2026', periodos), true)
  assert.equal(arrastreYaIncluido('Q2-08/2026', periodos), false, 'el recibo de otro mes sí es plata que falta')
  assert.equal(arrastreYaIncluido('Q1-09/2026, Q2-08/2026', periodos), false, 'un origen mezclado no se descarta entero')
})

const datos = (recibos: FilaRecibo[], extra: Partial<DatosDeCuadros> = {}): DatosDeCuadros => ({
  quincena: quincenaDe('2026-09-20'),
  personas: [
    { id: 'm', nombre: 'Maldonado E.', nombreOrden: 'Maldonado', cuil: CUIL, enLaEmpresa: true, esJefe: true },
    { id: 'o', nombre: 'Aguero C.', nombreOrden: 'Aguero', cuil: '20111111111', enLaEmpresa: true },
  ],
  tarifas: [
    { persona_id: 'm', desde: '2026-09-01', valor_hora: null, neto_mensual: 1800000, origen: 'acuerdo:SUELDO_NETO_OFICINA' },
    { persona_id: 'o', desde: '2026-09-01', valor_hora: 4000, neto_mensual: null, origen: 'sheet:_J_OBREROS' },
  ],
  horas: new Map([['o', { horas: 90, horasEquivalentes: 90, extras: [], presentesSinHoras: 0 }]]) as unknown as DatosDeCuadros['horas'],
  recibos: [...recibos, { cuil: '20111111111', periodo: 'Q2-09/2026', neto: 289294.52, fecha_pago: '2026-09-30' }],
  adelantos: [], redondeos: new Map(), ...extra,
})
const delCuadro = (d: DatosDeCuadros, grupo: 'oficina' | 'obreros') => armarCuadros(d).find((c) => c.grupo === grupo)!.lineas[0]

test('el cuadro: el mensual muestra la suma de sus dos recibos y el quincenal sigue con el de la quincena', () => {
  const d = datos([Q1, Q2])
  const m = delCuadro(d, 'oficina')
  assert.equal(m.reciboNeto, 1391446.92)
  assert.deepEqual(m.recibosDelEstudio?.map((r) => r.periodo), ['Q1-09/2026', 'Q2-09/2026'])
  assert.deepEqual(m.recibosFaltantes, [])
  assert.equal(delCuadro(d, 'obreros').reciboNeto, 289294.52)
})

test('el cuadro: con un solo recibo del mensual no hay recibo (ni la mitad) y la línea nombra el que falta', () => {
  const m = delCuadro(datos([Q1]), 'oficina')
  assert.equal(m.reciboNeto, null)
  assert.deepEqual(m.recibosFaltantes, ['Q2-09/2026'])
})

test('lo recibido en el banco: el giro del mes entero (la suma) es el lote; el neto de la 2ª sola ya no lo es', () => {
  const giro = (importe: number) => [{ cuil: CUIL, fecha: '2026-09-30', importe, concepto: 'QUINCENA' }]
  const conSuma = delCuadro(datos([Q1, Q2], { adelantos: giro(1391446.92) }), 'oficina')
  assert.equal(conSuma.porBanco, 1391446.92)
  assert.equal(conSuma.yaTransferido, 0)
  assert.equal(conSuma.enEfectivo, 408553.08)
  const conSolo2 = delCuadro(datos([Q1, Q2], { adelantos: giro(685914.88) }), 'oficina')
  assert.equal(conSolo2.porBanco, 0)
  assert.equal(conSolo2.yaTransferido, 685914.88, 'una transferencia que no es el mes entero es plata ya girada')
})

const sinArrastres = (): ArrastresDeLaQuincena => ({ entrantes: new Map(), salientes: new Map(), error: null })

function reciboDelMensual(arrastres: ArrastresDeLaQuincena) {
  const base = delCuadro(datos([Q1, Q2]), 'oficina')
  const l = conArrastres(aplicarOverrides(base, {}, 'oficina', null, null, null), arrastres, true)
  return { l, papel: armarRecibo(l, { ...eleccionInicial(l, true), banco: true, efectivo: false }, String, true) }
}

test('el recibo de pago del mensual: banco = suma y dos sub-renglones cortos, uno por recibo, sin texto de cuenta', () => {
  const { papel } = reciboDelMensual(sinArrastres())
  const banco = papel.medios.find((m) => !m.sub && m.rotulo === 'Depósito en banco')
  assert.equal(banco?.importe, 1391446.92)
  const subs = papel.medios.filter((m) => m.sub)
  assert.deepEqual(subs.map((s) => [s.rotulo, s.importe]), [
    ['Recibo de sueldo 1ª quincena de septiembre', 705532.04],
    ['Recibo de sueldo 2ª quincena de septiembre', 685914.88],
  ])
  assert.ok(papel.medios.every((m) => !/blanco|negro|cuenta/i.test(`${m.rotulo} ${m.detalle ?? ''}`)))
})

test('con arrastre «Resta recibo Q1-09»: el mensual no lo cuenta dos veces (banco sigue siendo la suma)', () => {
  const entrante = { importe: 54580.48, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' }
  const { l, papel } = reciboDelMensual({ ...sinArrastres(), entrantes: new Map([['m', entrante]]) })
  assert.equal(l.arrastre, undefined, 'el recibo de la 1ª ya está dentro del banco')
  assert.equal(l.porBanco, 0, 'el giro no se infla con la resta')
  assert.equal(papel.medios.find((m) => !m.sub && m.rotulo === 'Depósito en banco')?.importe, 1391446.92)
  assert.equal(papel.medios.some((m) => /Saldo/.test(m.rotulo)), false)
})
