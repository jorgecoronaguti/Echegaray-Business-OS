import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abarca, porMes, porSemana, rotuloDeMes, rotuloDeSemana, trazaDe } from './cronologiaHH.ts'
import { seCorrigio } from './hhPersonaService.ts'
import type { ImputacionHH } from '../types/index.ts'

// La semana del 31 de agosto al 5 de septiembre de 2026: a caballo de dos meses, que es el caso que
// rompe cualquier agrupación ingenua.
const r = (p: Partial<ImputacionHH>): ImputacionHH => ({
  id: p.id ?? `${p.fecha}-${p.tipo_hora ?? 'normal'}`,
  fecha: '2026-09-07', fecha_inicio_semana: '2026-09-07',
  obra_canonica_id: 'estrella', obra_nombre: 'La Estrella',
  actividad_id: null, actividad_nombre: null,
  horas: 8.8, tipo_hora: 'normal', notas: null, fuente_legacy: 'web:asistencia-obra',
  creado_en: null, cargo: null, corregido_en: null, corrigio: null, ...p,
})

test('LA SEMANA SALE DE fecha_inicio_semana, la que deriva Postgres — no de una cuenta propia', () => {
  // El defecto que atrapa: calcular el lunes en TypeScript. Dos definiciones de «lunes» discrepan un
  // día cada domingo y el total de la semana deja de cerrar sin que nadie vea un error.
  const filas = [
    r({ fecha: '2026-09-07', fecha_inicio_semana: '2026-09-07' }),
    r({ fecha: '2026-09-08', fecha_inicio_semana: '2026-09-07' }),
    r({ fecha: '2026-09-14', fecha_inicio_semana: '2026-09-14' }),
  ]
  const tramos = porSemana(filas)
  assert.deepEqual(tramos.map((t) => t.clave), ['2026-09-14', '2026-09-07'], 'lo último primero')
  assert.equal(tramos[1].horas, 17.6)
  assert.equal(tramos[1].dias, 2)
})

test('EL MES SE CORTA POR EL DÍA, no por el lunes de la semana', () => {
  // Una semana a caballo (lunes 31/08, martes 01/09) pertenece a los dos meses. Agruparla entera en
  // agosto correría horas de septiembre a agosto sin que nadie lo pidiera — y esas horas se liquidan.
  const filas = [
    r({ fecha: '2026-08-31', fecha_inicio_semana: '2026-08-31', horas: 8 }),
    r({ fecha: '2026-09-01', fecha_inicio_semana: '2026-08-31', horas: 8 }),
  ]
  assert.deepEqual(porSemana(filas).map((t) => t.clave), ['2026-08-31'], 'una sola semana')
  const meses = porMes(filas)
  assert.deepEqual(meses.map((t) => t.clave), ['2026-09', '2026-08'])
  assert.equal(meses[0].horas, 8)
  assert.equal(meses[1].horas, 8)
})

test('UNA AUSENCIA NO SUMA HORAS AL TRAMO, y se cuenta aparte', () => {
  const filas = [
    r({ fecha: '2026-09-07', horas: 8.8 }),
    r({ fecha: '2026-09-08', horas: 8.8, tipo_hora: 'ausencia' }),
  ]
  const [semana] = porSemana(filas)
  assert.equal(semana.horas, 8.8, 'las 8,8 de la ausencia no pueden entrar')
  assert.equal(semana.ausencias, 1)
  assert.equal(semana.dias, 1, 'el día que faltó no es un día trabajado')
})

test('DOS FILAS DEL MISMO DÍA SON UN DÍA, no dos', () => {
  // Normales + extras del mismo día. Contar filas diría que trabajó dos días con 10,8 horas.
  const filas = [
    r({ id: 'a', fecha: '2026-09-07', horas: 8.8 }),
    r({ id: 'b', fecha: '2026-09-07', horas: 2, tipo_hora: 'extra_50' }),
  ]
  const [semana] = porSemana(filas)
  assert.equal(semana.dias, 1)
  assert.equal(semana.horas, 10.8)
})

test('UNA FILA SIN DÍA NO SE UBICA EN NINGÚN MES, y va al final de su semana', () => {
  // Las 19 filas legacy del Sheet de JORNALES tienen semana y no día. Inventarles un día para
  // poder ordenarlas las metería en un mes al que puede que no pertenezcan.
  const filas = [
    r({ id: 'legacy', fecha: null, fecha_inicio_semana: '2026-09-07', fuente_legacy: 'jornales' }),
    r({ id: 'hoy', fecha: '2026-09-09', fecha_inicio_semana: '2026-09-07' }),
  ]
  const [semana] = porSemana(filas)
  assert.deepEqual(semana.registros.map((x) => x.id), ['hoy', 'legacy'])
  assert.deepEqual(porMes(filas).map((t) => t.clave), ['2026-09'])
  assert.equal(porMes(filas)[0].registros.length, 1, 'la legacy no entra en ningún mes')
})

test('EL RANGO SE MIDE SOBRE LOS DÍAS QUE EXISTEN, y sin ninguno es null', () => {
  assert.deepEqual(abarca([r({ fecha: '2026-09-09' }), r({ fecha: '2026-08-03' })]),
    { desde: '2026-08-03', hasta: '2026-09-09' })
  assert.equal(abarca([r({ fecha: null })]), null)
  assert.equal(abarca([]), null)
})

test('UNA FILA RECIÉN CREADA NO SE DECLARA CORREGIDA', () => {
  // El defecto que atrapa: `actualizado_en` tiene `default now()`, así que toda fila nace con un
  // valor. Sin el margen, CADA imputación del sistema diría «corregida» el día que se cargó — y una
  // pantalla donde todo está corregido no permite encontrar lo que sí se corrigió.
  assert.equal(seCorrigio('2026-09-07T10:00:00.000Z', '2026-09-07T10:00:00.004Z'), false)
  assert.equal(seCorrigio('2026-09-07T10:00:00.000Z', '2026-09-09T15:22:00.000Z'), true)
  assert.equal(seCorrigio(null, '2026-09-09T15:22:00.000Z'), false)
  assert.equal(seCorrigio('2026-09-07T10:00:00.000Z', null), false)
})

test('LA TRAZA DICE QUIÉN Y CUÁNDO, y calla cuando no lo sabe', () => {
  assert.equal(trazaDe(r({ creado_en: '2026-09-07T10:00:00Z', cargo: 'Rodrigo' })), 'Rodrigo · 07/09')
  assert.equal(
    trazaDe(r({ creado_en: '2026-09-07T10:00:00Z', cargo: 'Rodrigo', corregido_en: '2026-09-09T10:00:00Z', corrigio: 'Ana' })),
    'corrigió Ana el 09/09',
  )
  // Las filas legacy vinieron sin autor: «cargó el sistema» sería inventarlo.
  assert.equal(trazaDe(r({ creado_en: null, cargo: null })), null)
})

test('LOS RÓTULOS SE LEEN EN CASTELLANO', () => {
  assert.equal(rotuloDeSemana('2026-09-07'), 'semana del 7 de septiembre')
  assert.equal(rotuloDeMes('2026-09'), 'septiembre 2026')
})
