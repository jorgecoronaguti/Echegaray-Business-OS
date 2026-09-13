// EL VALOR HORA IMPLÍCITO DE QUIEN COBRA UN SUELDO MENSUAL (decisión del dueño, 13/09/2026).
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE OFICINA SIGA «SIN TARIFA». Antes de esta regla, Maldonado Batista y Nievas Villegas —con
//      `neto_mensual` y `valor_hora` NULL— no tenían valor hora, y sus horas en obra no costaban.
//  2 · QUE EL SUELDO DEL MES NO CIERRE. Si el divisor no son las horas TRABAJADAS del mes calendario
//      en TODAS las obras —si fuesen las de la quincena, las de una obra, o si licencias sumaran—, la
//      suma sobre obras deja de ser neto × multiplicador. El test del cierre lo mide.
//  3 · QUE UN DIVISOR 0 O UN NETO AUSENTE SE PUBLIQUE COMO $ 0. Tiene que ser `null` (sin tarifa).
//  4 · QUE UN TRAMO SE ESTIRE HACIA ATRÁS. El neto es el vigente al día 1 del mes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alicuotasVigentes, fraseDeValorImplicito, lineasDeObra, multiplicadorDeCosto, valorHoraDeCosto,
  type Alicuota, type TramoDeTarifa,
} from './costoHora.ts'
import {
  horasTrabajadasPorPersona, repartirHorasPorObra, tarifasDeCosto, type FilaDeObra,
} from './costoLecturas.ts'

const OFICINA: TramoDeTarifa[] = [{ desde: '2026-09-01', valorHora: null, netoMensual: 1_800_000 }]
const OBRERO: TramoDeTarifa[] = [{ desde: '2026-01-01', valorHora: 5000, netoMensual: null }]

test('OFICINA SE VALORIZA: neto mensual ÷ horas trabajadas del mes', () => {
  const v = valorHoraDeCosto(OFICINA, '2026-09-10', 180)
  assert.equal(v?.valor, 10_000)
  assert.deepEqual(v?.implicito, { netoMensual: 1_800_000, horasDelMes: 180 })
})

test('QUIEN COBRA POR HORA NO CAMBIA: el divisor no lo toca', () => {
  assert.deepEqual(valorHoraDeCosto(OBRERO, '2026-09-10', 180), { valor: 5000, implicito: null })
  assert.deepEqual(valorHoraDeCosto(OBRERO, '2026-09-10', 0), { valor: 5000, implicito: null })
})

test('DIVISOR 0 O SIN NETO: sin tarifa, NUNCA $ 0', () => {
  assert.equal(valorHoraDeCosto(OFICINA, '2026-09-10', 0), null)
  assert.equal(valorHoraDeCosto(OFICINA, '2026-09-10', Number.NaN), null)
  // ANTES DEL PRIMER TRAMO no hay neto: agosto no se valoriza con el sueldo de septiembre.
  assert.equal(valorHoraDeCosto(OFICINA, '2026-08-20', 180), null)
})

test('UN TRAMO QUE EMPIEZA A MITAD DE MES RIGE DESDE EL SIGUIENTE, no hacia atrás', () => {
  const tramos: TramoDeTarifa[] = [
    { desde: '2026-08-01', valorHora: null, netoMensual: 1_500_000 },
    { desde: '2026-09-20', valorHora: null, netoMensual: 2_000_000 },
  ]
  // El 25/09 ya rige el tramo nuevo por fecha, pero el mes se valoriza con el neto del 01/09: UN neto
  // por mes, para que el mes cierre.
  assert.equal(valorHoraDeCosto(tramos, '2026-09-05', 150)?.valor, 10_000)
  assert.equal(valorHoraDeCosto(tramos, '2026-09-25', 150)?.valor, 10_000)
  assert.equal(valorHoraDeCosto(tramos, '2026-10-05', 200)?.valor, 10_000)
})

const fila = (o: Partial<FilaDeObra>): FilaDeObra => ({
  obra_id: null, obra_canonica_id: 'quattropani', persona_id: 'jefe', horas: '9', tipo_hora: 'normal', ...o,
})

const ALIC: Alicuota[] = [
  { concepto: 'cargas_sociales', desde: '2026-01-01', porcentaje: 26.4, base: 'total', fuente: 't' },
  { concepto: 'art', desde: '2026-01-01', porcentaje: 7.2, base: 'total', fuente: 't' },
]

test('EL MES CIERRA: Σ obras de la mano de obra del jefe = neto mensual × multiplicador', () => {
  // UN MES DEL JEFE: horas en dos obras, una licencia y una ausencia que no pueden dividir.
  const mes: FilaDeObra[] = [
    fila({ obra_canonica_id: 'quattropani', horas: '9' }),
    fila({ obra_canonica_id: 'quattropani', horas: '8.5', tipo_hora: 'extra_50' }),
    fila({ obra_canonica_id: 'sf-pisos', horas: '7.25' }),
    fila({ obra_canonica_id: 'sf-pisos', horas: '3', tipo_hora: 'extra_100' }),
    fila({ obra_canonica_id: null, horas: '9', tipo_hora: 'licencia' }),
    fila({ obra_canonica_id: null, horas: '8', tipo_hora: 'ausencia' }),
    fila({ persona_id: 'obrero', obra_canonica_id: 'quattropani', horas: '9' }),
  ]
  const horasDelMes = horasTrabajadasPorPersona(mes)
  assert.equal(horasDelMes.get('jefe'), 27.75, 'licencia y ausencia no suman al divisor')

  const { porPersona, implicitos } = tarifasDeCosto(
    new Map([['jefe', OFICINA], ['obrero', OBRERO]]), '2026-09-15', horasDelMes)
  const mult = multiplicadorDeCosto(alicuotasVigentes(ALIC, '2026-09-15'), 1).valor as number

  // SÓLO LAS HORAS DEL JEFE, repartidas por obra por el MISMO camino que la solapa.
  const soloJefe = mes.filter((f) => f.persona_id === 'jefe')
  const lineas = lineasDeObra(repartirHorasPorObra(soloJefe, porPersona, () => '', implicitos), new Map(), mult)
  const total = lineas.reduce((s, l) => s + (l.costoReal as number), 0)
  assert.ok(Math.abs(total - 1_800_000 * mult) < 0.05,
    `el mes del jefe suma ${total} y el sueldo con cargas es ${1_800_000 * mult}`)
  assert.equal(lineas.length, 2, 'las dos obras reciben su parte')

  // EL OBRERO NO SE MOVIÓ: 9 h × 5.000.
  const obrero = repartirHorasPorObra(mes.filter((f) => f.persona_id === 'obrero'), porPersona, () => '', implicitos)
  assert.equal(obrero[0].bolsillo, 45_000)
  assert.deepEqual(obrero[0].implicitos, [])
})

test('EL DIVISOR DE LA QUINCENA NO CIERRA EL MES: el control puede dar rojo', () => {
  // La mutación que el cierre existe para atrapar: dividir por las horas de UNA quincena. Con dos
  // quincenas, cada una le cargaría el sueldo entero a las obras y el mes se pagaría dos veces.
  const q1 = [fila({ horas: '10' })]
  const q2 = [fila({ horas: '10' })]
  const bien = tarifasDeCosto(new Map([['jefe', OFICINA]]), '2026-09-30',
    horasTrabajadasPorPersona([...q1, ...q2])).porPersona.get('jefe') as number
  const mal = tarifasDeCosto(new Map([['jefe', OFICINA]]), '2026-09-30',
    horasTrabajadasPorPersona(q2)).porPersona.get('jefe') as number
  assert.equal(bien * 20, 1_800_000)
  assert.notEqual(mal * 20, 1_800_000)
})

test('EL TITLE DICE LA CUENTA: neto mensual ÷ N h del mes', () => {
  const t = fraseDeValorImplicito({ netoMensual: 1_800_000, horasDelMes: 176.5 })
  assert.ok(t.startsWith('valor hora implícito: neto mensual ÷ 176,5 h del mes'), t)
  assert.ok(t.includes('1.800.000'), t)
})
