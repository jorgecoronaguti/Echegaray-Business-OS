import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorPeriodo, fichajePorCuadrilla, pieDeLaBanda, rotuloDePeriodo, VENTANAS, ventanaQueContiene,
} from './hhPorPeriodo.ts'
import { agruparHHSemana, type RegistroHH, type VinculoVigente } from './hhSemanaCuadrillas.ts'

// LOS TRES DEFECTOS QUE ESTE ARCHIVO ATRAPA, Y NINGUNO ES DE DIBUJO:
//
//  1. LEER «EL MES» Y RECORTAR LA SEMANA ADENTRO. La semana va de lunes a domingo y a fin de mes
//     empieza en el mes anterior: la banda mostraría una semana con menos horas de las que tuvo, y
//     nadie lo notaría porque el número igual se ve razonable.
//  2. AGRUPAR LOS TRES PERÍODOS SOBRE LA VENTANA LEÍDA. Si `agruparPorPeriodo` pasara la ventana
//     total en vez de la de cada período, «Esta semana» diría las horas del mes entero.
//  3. CONTAR DOS VECES A QUIEN ESTÁ EN DOS CUADRILLAS. Sus horas tienen que aparecer en las dos
//     filas —cada cuadrilla trabajó con ella— pero UNA sola vez en el total y en el conteo de
//     personas del pie.

const reg = (fecha: string, persona: string, horas: number, tipo = 'normal'): RegistroHH => ({
  persona_id: persona, obra_canonica_id: 'o1', nombre_obra: 'Depósito Norte',
  fecha, horas, tipo_hora: tipo,
})

// El 31/08/2026 es un lunes: la semana que lo contiene arranca ese mismo día. Se elige un día de
// una semana PARTIDA entre dos meses para que el defecto 1 tenga dónde aparecer.
const HOY = '2026-09-02'

test('la ventana leída contiene la semana aunque empiece en el mes anterior', () => {
  const v = VENTANAS(HOY)
  assert.equal(v.mes.desde, '2026-09-01')
  assert.equal(v.semana.desde, '2026-08-31', 'la semana del 02/09/2026 arranca el lunes 31/08')

  const total = ventanaQueContiene(Object.values(v))
  assert.equal(total.desde, '2026-08-31', 'leer sólo el mes dejaría el lunes 31/08 afuera')
  assert.equal(total.hasta, '2026-09-30')
})

test('cada período se agrupa sobre SU ventana, no sobre la leída', () => {
  const vinculos: VinculoVigente[] = [{ cuadrilla_id: 'c1', persona_id: 'p1' }]
  const registros = [
    reg('2026-08-31', 'p1', 8), // lunes de la semana en curso, mes anterior
    reg('2026-09-02', 'p1', 8), // hoy: semana, quincena y mes
    reg('2026-09-20', 'p1', 8), // mismo mes, segunda quincena, otra semana
  ]
  const r = agruparPorPeriodo({ vinculos, registros }, HOY)

  assert.equal(r.semana.total, 16, 'la semana toma el 31/08 y el 02/09, y nada más')
  assert.equal(r.quincena.total, 8, 'la quincena es del 01 al 15: sólo el 02/09')
  assert.equal(r.mes.total, 16, 'el mes es septiembre: el 31/08 queda afuera')
})

test('una ausencia tiene horas y no es trabajo — ni en el total ni en la persona', () => {
  const registros = [reg('2026-09-02', 'p1', 8, 'ausencia'), reg('2026-09-02', 'p2', 8)]
  const r = agruparHHSemana([], registros, '2026-09-01', '2026-09-30')

  assert.equal(r.total, 8)
  assert.equal(r.porPersona.get('p1'), undefined, 'p1 faltó: no puede figurar con 8 HH trabajadas')
  assert.equal(r.porPersona.get('p2'), 8)
})

test('quien está en dos cuadrillas suma en las dos filas y una sola vez en el total', () => {
  const vinculos: VinculoVigente[] = [
    { cuadrilla_id: 'c1', persona_id: 'p1' },
    { cuadrilla_id: 'c2', persona_id: 'p1' },
  ]
  const r = agruparHHSemana(vinculos, [reg('2026-09-02', 'p1', 8)], '2026-09-01', '2026-09-30')

  assert.equal(r.porCuadrilla.get('c1'), 8)
  assert.equal(r.porCuadrilla.get('c2'), 8)
  assert.equal(r.total, 8, 'el total se suma sobre los registros, no sobre el mapa por cuadrilla')
  assert.equal(r.porPersona.get('p1'), 8, 'la persona trabajó 8 horas, no 16')
})

test('una persona SIN registros no está en el mapa: no trabajó cero, no se sabe', () => {
  const r = agruparHHSemana([{ cuadrilla_id: 'c1', persona_id: 'p9' }], [], '2026-09-01', '2026-09-30')
  assert.equal(r.porPersona.has('p9'), false)
  assert.equal(r.porCuadrilla.has('c1'), false)
})

test('el fichaje cuenta personas vigentes, y quien no marcó no queda contado como presente', () => {
  const vinculos: VinculoVigente[] = [
    { cuadrilla_id: 'c1', persona_id: 'p1' },
    { cuadrilla_id: 'c1', persona_id: 'p2' },
    { cuadrilla_id: 'c2', persona_id: 'p1' },
  ]
  const f = fichajePorCuadrilla(vinculos, new Set(['p1']))

  assert.deepEqual(f.get('c1'), { integrantes: 2, fichados: 1 })
  assert.deepEqual(f.get('c2'), { integrantes: 1, fichados: 1 })
})

test('el mismo vínculo repetido no infla la dotación de la cuadrilla', () => {
  const f = fichajePorCuadrilla(
    [{ cuadrilla_id: 'c1', persona_id: 'p1' }, { cuadrilla_id: 'c1', persona_id: 'p1' }],
    new Set(),
  )
  assert.deepEqual(f.get('c1'), { integrantes: 1, fichados: 0 })
})

test('el pie cuenta a la persona de dos cuadrillas una sola vez', () => {
  const vinculos: VinculoVigente[] = [
    { cuadrilla_id: 'c1', persona_id: 'p1' },
    { cuadrilla_id: 'c2', persona_id: 'p1' },
    { cuadrilla_id: 'c2', persona_id: 'p2' },
  ]
  assert.equal(pieDeLaBanda(1158, 2, vinculos), '1.158 HH en 2 cuadrillas · 2 personas')
})

test('el mes se nombra y los otros dos se dicen en relación a hoy', () => {
  assert.equal(rotuloDePeriodo('mes', '2026-08-26'), 'Agosto 2026')
  assert.equal(rotuloDePeriodo('quincena', '2026-08-26'), 'Quincena en curso')
  assert.equal(rotuloDePeriodo('semana', '2026-08-26'), 'Esta semana')
})
