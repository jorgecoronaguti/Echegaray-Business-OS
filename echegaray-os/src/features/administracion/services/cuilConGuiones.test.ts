// UN CUIL CON GUIONES ES EL MISMO CUIL (medido el 14/09/2026).
//
// 13 personas tienen `personas.cuil` escrito «20-38218815-3», dos de ellas activas (Alaniz y Castillo).
// `nomina_recibo_neto.cuil` y `recibo_sueldo_linea.cuil` están sin guiones. Todo cruce con `===` las
// perdía: Recibos decía «Alaniz sin recibo Q2-08» y «4 recibos sin persona», y los dos datos eran falsos.
// La columna de `personas` NO se toca: se normaliza al comparar.
//
// MUTACIÓN QUE LO PONE ROJO: comparar sin normalizar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarCuadros, girosDe } from './liquidacionCuadros.ts'
import { entradaDeBlanco, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { plantelDeLaQuincena } from './liquidacionPlantelActivo.ts'
import { quincenaDe } from './quincena.ts'

const q = quincenaDe('2026-08-16')
const ALANIZ = { id: 'alaniz', nombre: 'ALANIZ EMANUEL ARIEL', cuil: '20-38218815-3', enLaEmpresa: true }

test('LA LÍNEA DE LIQUIDACIÓN ENCUENTRA EL RECIBO Y EL GIRO DEL LOTE DE UN CUIL CON GUIONES', () => {
  const [obreros] = armarCuadros({
    quincena: q, personas: [ALANIZ],
    tarifas: [{ persona_id: 'alaniz', desde: '2026-08-01', valor_hora: 4950, neto_mensual: null, origen: 't' }],
    horas: new Map([['alaniz', { horas: 80, presentesSinHoras: 0 }]]),
    recibos: [{ cuil: '20382188153', periodo: 'Q2-08/2026', neto: 192887.48, fecha_pago: '2026-09-04' }],
    adelantos: [{ cuil: '20382188153', fecha: '2026-08-31', importe: 192887.48, concepto: 'QUINCENA' }],
    redondeos: new Map(),
  }).filter((c) => c.grupo === 'obreros')
  assert.equal(obreros.lineas[0].reciboNeto, 192887.48, 'MUTACIÓN: con `===` el recibo se pierde')
  assert.equal(obreros.lineas[0].porBanco, 192887.48, 'y el giro del lote también')
  assert.deepEqual(girosDe(q, [{ cuil: '20382188153', fecha: '2026-08-20', importe: 50000, concepto: 'QUINCENA' }], '20-38218815-3', 'QUINCENA', null),
    { giroEnElLote: false, yaTransferido: 50000 })
})

test('EL BLANCO ENCUENTRA EL RECIBO POR CUIL CON GUIONES CUANDO LA LÍNEA NO TRAE persona_id', () => {
  const recibo: ReciboDeSueldo = {
    personaId: null, cuil: '20382188153', periodo: 'Q2-08/2026', categoria: 'AYUDANTE', valorHora: 5399,
    horasBlanco: 50, bruto: 269950, neto: 192887.48, driveFileId: null,
  }
  const e = entradaDeBlanco({ personaId: 'alaniz', cuil: '20-38218815-3', periodo: 'Q2-08/2026', recibos: [recibo], pisoCategoria: 5399, netoDeNomina: null })
  assert.equal(e.recibo?.neto, 192887.48)
})

test('EL PLANTEL CUENTA EL RECIBO COMO ACTIVIDAD AUNQUE EL CUIL TENGA GUIONES', () => {
  // El servicio arma `conRecibo` con este mismo cruce (`personaDeCuil`); acá se prueba la llave.
  const r = plantelDeLaQuincena([{ ...ALANIZ, enLaEmpresa: false, fechaEgreso: null }], q, {
    conHoras: new Set(), conLinea: new Set(), conJornales: new Set(),
    conRecibo: new Set(['alaniz']),
  })
  assert.deepEqual(r.activas.map((p) => p.id), ['alaniz'])
})
