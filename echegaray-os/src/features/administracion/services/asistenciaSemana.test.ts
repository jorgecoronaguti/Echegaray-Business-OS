import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarFilas, correrDias, derivarCelda, diasDe, estadoDeLaFila, etiquetaDia, horasEntre, rotuloSemana,
  semanaDe, totalDeLaSemana,
} from './asistenciaSemana.ts'
import type { Celda, DiaMarcado } from './asistenciaSemana.ts'

// La semana del ejemplo del diseño: lunes 17 a viernes 21 de agosto de 2026. HOY es el viernes 21,
// así que en la misma semana conviven días pasados, el día en curso y —en las pruebas de la semana
// siguiente— días futuros. Todo entra por parámetro: probar «qué pasa el jueves» no puede depender
// de esperar al jueves.
const HOY = '2026-08-21'
const dia = (fecha: string, entrada: string | null, salida: string | null): DiaMarcado =>
  ({ fecha, entrada, salida, obra_id: 'o1' })
const celda = (fecha: string, estado: Celda['estado'], horas: number | null = null): Celda =>
  ({ fecha, estado, horas })

test('UN DÍA SIN MARCAS NO ES UNA FALTA: sin registro es sin registro', () => {
  // El defecto que atrapa: pintar de rojo al que no tiene teléfono. Una falta es un hecho DECLARADO
  // en registros_hh; la ausencia de marcas es ignorancia, y convertirla en ausencia fabrica una
  // novedad de liquidación que nadie cargó.
  const sinNada = derivarCelda('2026-08-19', undefined, undefined, { hoy: HOY })
  assert.equal(sinNada.estado, 'sin_registrar')
  assert.equal(sinNada.horas, null)

  const declarada = derivarCelda('2026-08-19', undefined, { fecha: '2026-08-19', tipo_hora: 'ausencia' }, { hoy: HOY })
  assert.equal(declarada.estado, 'falta', 'la ausencia declarada dejó de verse como falta')

  const licencia = derivarCelda('2026-08-19', undefined, { fecha: '2026-08-19', tipo_hora: 'licencia' }, { hoy: HOY })
  assert.equal(licencia.estado, 'licencia', 'una licencia no es una falta')
})

test('EL DÍA EN CURSO no tiene horas, y ayer sin salida tampoco es lo mismo', () => {
  // Entró y no cerró. Hoy es una jornada corriendo; el mismo dato en un día pasado es una salida que
  // falta —lo que la bandeja de correcciones existe para resolver— y no puede sumar horas: un total
  // que crece solo hasta que alguien marque es un total que después se liquida.
  const enCurso = derivarCelda(HOY, dia(HOY, '2026-08-21T11:00:00Z', null), undefined, { hoy: HOY })
  assert.equal(enCurso.estado, 'en_curso')
  assert.equal(enCurso.horas, null, 'una jornada abierta publicó horas')

  const ayer = derivarCelda('2026-08-20', dia('2026-08-20', '2026-08-20T11:00:00Z', null), undefined, { hoy: HOY })
  assert.equal(ayer.estado, 'sin_cerrar')
  assert.equal(ayer.horas, null)
})

test('EL FERIADO no acusa a nadie — pero si alguien trabajó, manda el hecho', () => {
  const feriado = derivarCelda('2026-08-17', undefined, undefined, { hoy: HOY, noLaborable: true })
  assert.equal(feriado.estado, 'no_laborable', 'el feriado apareció como día sin registrar')

  // Y el que sí fue: la celda muestra la jornada, no el feriado. Es, casi siempre, la hora al 100%.
  const trabajado = derivarCelda(
    '2026-08-17', dia('2026-08-17', '2026-08-17T11:00:00Z', '2026-08-17T19:00:00Z'), undefined,
    { hoy: HOY, noLaborable: true, jornadaHoras: 8 },
  )
  assert.equal(trabajado.estado, 'jornada')
  assert.equal(trabajado.horas, 8)
})

test('EXTRA sólo contra la jornada REAL de la obra, nunca contra un 8 inventado', () => {
  const nueve = dia('2026-08-18', '2026-08-18T11:00:00Z', '2026-08-18T20:00:00Z')
  assert.equal(derivarCelda('2026-08-18', nueve, undefined, { hoy: HOY, jornadaHoras: 8 }).estado, 'extra')
  // La misma jornada de 9 horas en una obra que pacta 9 NO es extra.
  assert.equal(derivarCelda('2026-08-18', nueve, undefined, { hoy: HOY, jornadaHoras: 9 }).estado, 'jornada')
  // Y sin jornada conocida no se afirma nada: el umbral sería una constante inventada.
  assert.equal(derivarCelda('2026-08-18', nueve, undefined, { hoy: HOY }).estado, 'jornada')
})

test('EL FUTURO no es un hueco: el viernes no acusa al miércoles', () => {
  const miercoles = '2026-08-19'
  assert.equal(derivarCelda('2026-08-21', undefined, undefined, { hoy: miercoles }).estado, 'futuro')
  assert.equal(derivarCelda('2026-08-18', undefined, undefined, { hoy: miercoles }).estado, 'sin_registrar')
})

test('una salida ANTES de la entrada no publica horas negativas', () => {
  assert.equal(horasEntre('2026-08-18T19:00:00Z', '2026-08-18T11:00:00Z'), null)
  assert.equal(horasEntre('2026-08-18T11:00:00Z', null), null)
  assert.equal(horasEntre('2026-08-18T11:00:00Z', '2026-08-18T17:48:00Z'), 6.8)
})

test('el TOTAL suma sólo las jornadas cerradas', () => {
  const celdas = [
    celda('2026-08-17', 'jornada', 8), celda('2026-08-18', 'extra', 9),
    celda('2026-08-19', 'falta'), celda('2026-08-20', 'sin_cerrar'),
    celda('2026-08-21', 'en_curso'),
  ]
  assert.equal(totalDeLaSemana(celdas), 17)
})

test('ESTADO de la fila: lo que todavía se puede arreglar va primero, y la falta no se pierde', () => {
  const conFalta = [celda('2026-08-17', 'jornada', 8), celda('2026-08-19', 'falta'), celda(HOY, 'jornada', 8)]
  assert.equal(estadoDeLaFila(conFalta, { hoy: HOY }).texto, '1 falta')

  // Una corrección pendiente gana —es lo único que hay que resolver hoy— pero la falta sigue a la
  // vista: el defecto sería que el pedido de corrección tapara la novedad de liquidación.
  const conPedido = estadoDeLaFila(conFalta, { hoy: HOY, correccionPendiente: true })
  assert.equal(conPedido.clave, 'correccion')
  assert.equal(conPedido.texto, 'Corrección pend. · 1 falta')

  const sinFichar = [celda('2026-08-17', 'jornada', 8), celda(HOY, 'sin_registrar')]
  assert.equal(estadoDeLaFila(sinFichar, { hoy: HOY }).clave, 'sin_fichar_hoy')

  const completa = [celda('2026-08-17', 'jornada', 8), celda(HOY, 'extra', 9), celda('2026-08-18', 'no_laborable')]
  assert.equal(estadoDeLaFila(completa, { hoy: HOY }).texto, 'Completa')

  // Un hueco en un día pasado NO es una falta: se dice como lo que es.
  const conHueco = [celda('2026-08-17', 'jornada', 8), celda('2026-08-18', 'sin_registrar'), celda(HOY, 'jornada', 8)]
  const e = estadoDeLaFila(conHueco, { hoy: HOY })
  assert.equal(e.clave, 'sin_registrar')
  assert.equal(e.texto, '1 día sin registrar')

  // Semana entera de feriado/licencia: no se trabajó, así que no es «Completa».
  assert.equal(estadoDeLaFila([celda('2026-08-17', 'no_laborable')], { hoy: HOY }).clave, 'sin_datos')
})

test('la semana empieza el LUNES y se navega de a siete días', () => {
  assert.deepEqual(semanaDe(HOY), { desde: '2026-08-17', hasta: '2026-08-23' })
  assert.deepEqual(semanaDe(HOY, -1), { desde: '2026-08-10', hasta: '2026-08-16' })
  assert.deepEqual(semanaDe(HOY, 1), { desde: '2026-08-24', hasta: '2026-08-30' })
  // Un lunes pertenece a SU semana, no a la anterior.
  assert.equal(semanaDe('2026-08-17').desde, '2026-08-17')
  // Y un domingo cierra la semana que empezó el lunes anterior.
  assert.equal(semanaDe('2026-08-23').desde, '2026-08-17')
  assert.equal(correrDias('2026-08-31', 1), '2026-09-01')
})

test('el SÁBADO sólo aparece si hay algo que mostrar', () => {
  const s = semanaDe(HOY)
  assert.equal(diasDe(s).length, 5)
  assert.deepEqual(diasDe(s, ['2026-08-22']), [
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22',
  ])
  // El domingo no abre columna ni con marcas: eso no es una columna más, es una conversación.
  assert.equal(diasDe(s, ['2026-08-23']).length, 5)
})

test('la grilla armada: dos obras el mismo día son UN día, no dos medias jornadas', () => {
  // El defecto que atrapa: `presencia_del_dia` agrupa por (persona, fecha, OBRA). Quien entró en una
  // obra a las 8 y salió de otra a las 17 vuelve en dos filas; quedarse con una publicaría media
  // jornada —o ninguna, si la fila elegida es la que no tiene salida.
  const filas = armarFilas({
    personas: [{ persona_id: 'p1', nombre_completo: 'Miguel Ángel Gómez', categoria: 'oficial' }],
    dias: diasDe(semanaDe(HOY)),
    marcas: [
      { persona_id: 'p1', fecha: '2026-08-17', entrada: '2026-08-17T11:00:00Z', salida: null, obra_id: 'A' },
      { persona_id: 'p1', fecha: '2026-08-17', entrada: null, salida: '2026-08-17T20:00:00Z', obra_id: 'B' },
    ],
    declaraciones: [],
    noLaborables: [],
    correccionesPendientes: [],
    hoy: HOY,
    jornadaPorObra: { A: 8, B: 8 },
  })
  assert.equal(filas[0].celdas[0].horas, 9, 'la jornada partida en dos obras se publicó incompleta')
  assert.equal(filas[0].celdas[0].estado, 'extra')
  assert.equal(filas[0].total, 9)
})

test('la grilla armada: el feriado, la ausencia declarada y el pedido pendiente llegan a la fila', () => {
  const filas = armarFilas({
    personas: [
      { persona_id: 'p1', nombre_completo: 'Pablo Andrés Sosa', categoria: 'ayudante' },
      { persona_id: 'p2', nombre_completo: 'Ramón Ernesto Díaz', categoria: 'ayudante' },
    ],
    dias: diasDe(semanaDe(HOY)),
    marcas: [
      { persona_id: 'p2', fecha: '2026-08-18', entrada: '2026-08-18T11:00:00Z', salida: '2026-08-18T19:00:00Z', obra_id: 'A' },
    ],
    declaraciones: [{ persona_id: 'p2', fecha: '2026-08-19', tipo_hora: 'ausencia' }],
    noLaborables: ['2026-08-17'],
    correccionesPendientes: ['p1'],
    hoy: HOY,
    jornadaPorObra: { A: 8 },
  })
  assert.equal(filas[0].estado.clave, 'correccion')
  assert.equal(filas[0].total, 0, 'una persona sin marcas publicó horas')
  assert.equal(filas[1].celdas[0].estado, 'no_laborable', 'el feriado no llegó a la grilla')
  assert.equal(filas[1].celdas[2].estado, 'falta')
  assert.equal(filas[1].estado.texto, 'Sin fichar hoy · 1 falta')
  assert.equal(filas[1].total, 8)
})

test('los rótulos dicen de qué semana se habla, incluso cruzando de mes', () => {
  assert.equal(etiquetaDia('2026-08-17'), 'LUN 17')
  assert.equal(etiquetaDia('2026-08-21'), 'VIE 21')
  assert.equal(rotuloSemana(diasDe(semanaDe(HOY))), 'Semana del 17 al 21 de agosto')
  assert.equal(
    rotuloSemana(diasDe(semanaDe('2026-09-02'))),
    'Semana del 31 de agosto al 4 de septiembre',
  )
})
