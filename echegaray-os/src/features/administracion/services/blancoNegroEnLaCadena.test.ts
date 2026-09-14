// BLANCO + NEGRO DENTRO DE LA CADENA DE PAGO — lo que leen el cuadro, Caja y Cierre.
//
// `sueldoBlancoNegro.test.ts` prueba la cuenta. Esto prueba que la cadena la USE: que COBRA sea el
// total del modelo, POR BANCO el neto, EN EFECTIVO la resta que cierra, que JORNALES no mande el banco
// y que lo escrito a mano siga ganando donde ya ganaba (dueño, 14/09/2026).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarOverrides, sinOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { cierreDeLaFila } from './cuadroDeJornales.ts'
import { entradaDeBlanco, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { totalesDelEspejo, type FilaDelEspejo } from './espejoDeJornales.ts'

const RECIBO: ReciboDeSueldo = {
  personaId: 'rosales', cuil: '20358508783', periodo: 'Q2-08/2026', categoria: 'Oficial',
  valorHora: 6348, horasBlanco: 50, bruto: 317400, neto: 230240.12, driveFileId: 'pdf',
}

const base = (horas: number, grupo: 'obreros' | 'oficina' = 'obreros') => liquidarLinea({
  personaId: 'rosales', nombre: 'ROSALES DIEGO JOSE', horas,
  tarifa: grupo === 'obreros'
    ? { valorHora: 5874, netoMensual: null, desde: '2026-08-16', origen: 'test' }
    : { valorHora: null, netoMensual: 1800000, desde: '2026-08-16', origen: 'test' },
  adelanto: 0, yaTransferido: 0, reciboNeto: 230240.12, giroEnElLote: true,
}, grupo)

const blancoQ2 = entradaDeBlanco({
  personaId: 'rosales', cuil: '20358508783', periodo: 'Q2-08/2026', recibos: [RECIBO],
  pisoCategoria: 6348, netoDeNomina: 230240.12,
})

// Lo que la planilla decía de Rosales Q2-08 con el modelo viejo (94 h × $5.874).
const JORNALES = { horas: 94, cobra: 552156, yaTransferido: 200000, porBanco: 250000, enEfectivo: 121915.88 }

test('ROSALES Q2-08: cobra = neto + negro, banco = neto, efectivo $58.456 y la fila cierra', () => {
  const l = aplicarOverrides(base(94), {}, 'obreros', JORNALES, blancoQ2)
  assert.equal(l.sueldo?.estado, 'recibo')
  assert.equal(l.cobra, 488696.12)
  assert.equal(l.porBanco, 230240.12, 'por banco es el neto, no los $250.000 de la planilla')
  assert.equal(l.origen.porBanco, 'calculado')
  assert.equal(l.yaTransferido, 200000, 'el ya transferido de JORNALES sigue entrando')
  assert.equal(l.origen.yaTransferido, 'jornales')
  assert.equal(l.enEfectivo, 58456)
  assert.equal(cierreDeLaFila(l)?.cierra, true)
  // La planilla queda de referencia con su cobra, banco y efectivo, y no se marca por el cobra.
  assert.deepEqual(l.referenciaJornales, { horas: 94, cobra: 552156, porBanco: 250000, enEfectivo: 121915.88, difiere: false })
})

test('LO MANUAL SIGUE GANANDO: un banco escrito a mano rehace el efectivo', () => {
  const l = aplicarOverrides(base(94), { porBanco: 100000, adelanto: 30000 }, 'obreros', JORNALES, blancoQ2)
  assert.equal(l.porBanco, 100000)
  assert.equal(l.origen.porBanco, 'manual')
  assert.equal(l.enEfectivo, 488696.12 - 30000 - 200000 - 100000)
  const h = aplicarOverrides(base(94), { horas: 60 }, 'obreros', null, blancoQ2)
  assert.equal(h.sueldo?.horasNegro, 10, 'las horas escritas a mano mueven el negro')
  assert.equal(h.cobra, 230240.12 + 58740)
})

test('SIN NETO: cobra null, marcado «sin neto» y no «sin tarifa»; el pie lo cuenta aparte', () => {
  const sinRecibos = entradaDeBlanco({
    personaId: 'rosales', cuil: null, periodo: 'Q1-09/2026', recibos: [], pisoCategoria: 6348, netoDeNomina: null,
  })
  const b = liquidarLinea({
    personaId: 'rosales', nombre: 'R', horas: 62,
    tarifa: { valorHora: 5874, netoMensual: null, desde: '2026-09-01', origen: 'test' },
    adelanto: 0, yaTransferido: 0, reciboNeto: null, giroEnElLote: false,
  }, 'obreros')
  const l = aplicarOverrides(b, {}, 'obreros', null, sinRecibos)
  assert.equal(l.cobra, null)
  assert.equal(l.sinNeto, true)
  assert.equal(l.sinTarifa, false)
  assert.equal(l.sueldo?.negro, 182094)
  const conNeto = aplicarOverrides(base(94), {}, 'obreros', null, blancoQ2)
  const fila = (linea: typeof l) => ({ linea, cotejo: { estado: 'coincide' }, celdas: [], horasPorTipo: { normales: 0, extra50: 0, extra100: 0, total: 0, automaticas: 0 } }) as unknown as FilaDelEspejo
  const t = totalesDelEspejo([fila(l), fila(conNeto)])
  assert.equal(t.sinNeto, 1)
  assert.equal(t.sinTarifa, 0)
  assert.equal(t.cobra, 488696.12, 'la fila sin neto no suma como cero')
  assert.equal(t.negro, 258456, 'el negro del pie suma las mismas filas que el total')
  assert.equal(t.estimados, 1)
})

test('FUERA DEL MODELO NO CAMBIA NADA: oficina, quincena cerrada y llamador sin entrada del blanco', () => {
  assert.equal(aplicarOverrides(base(94, 'oficina'), {}, 'oficina', null, blancoQ2).sueldo, null)
  assert.equal(sinOverrides(base(94)).sueldo, null)
  const viejo = aplicarOverrides(base(94), {}, 'obreros', null)
  assert.equal(viejo.sueldo, null)
  assert.equal(viejo.cobra, 552156, 'sin entrada del blanco sigue horas × $/h')
})
