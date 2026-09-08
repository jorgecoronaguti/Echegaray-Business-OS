import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarQuincenaPorObra, diasSinMarcar, personasPorObra, totalDeLaQuincenaPorObra, totalesPorDia,
} from './quincenaPorObra.ts'
import type { AsignacionQuincena, RegistroQuincena } from './quincenaPorObra.ts'

// Seis días de la 2ª quincena de septiembre de 2026, del lunes 7 al sábado 12. HOY es el viernes 11:
// en la misma grilla conviven días cerrados, el día en curso y el sábado 12, que todavía no pasó.
const L = '2026-09-07'
const M = '2026-09-08'
const X = '2026-09-09'
const J = '2026-09-10'
const V = '2026-09-11'
const S = '2026-09-12'
const DIAS = [L, M, X, J, V, S]
const HOY = V

const asig = (persona_id: string, nombre: string, obra_id: string, obra: string, nota: string | null = null): AsignacionQuincena =>
  ({ persona_id, nombre, nota, obra_id, obra })
const reg = (persona_id: string, obra_id: string, fecha: string, horas: number, tipo_hora = 'normal'): RegistroQuincena =>
  ({ persona_id, obra_id, fecha, horas, tipo_hora })

const ESTRELLA = ['estrella', 'La Estrella'] as const
const MESSINA = ['messina', 'Messina'] as const

test('QUIEN CAMBIÓ DE OBRA TIENE DOS FILAS, y la segunda queda marcada como repetida', () => {
  // El defecto que atrapa: sumar las dos obras en una sola fila. La pregunta de esta pantalla es
  // cuánta mano de obra consumió CADA obra; un solo número por persona la deja sin respuesta.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Paz', ...ESTRELLA), asig('a', 'Paz', ...MESSINA)],
    registros: [reg('a', 'estrella', L, 8), reg('a', 'estrella', M, 8), reg('a', 'messina', J, 8)],
    dias: DIAS, hoy: HOY,
  })
  assert.equal(filas.length, 2)
  assert.equal(filas[0].repetida, false)
  assert.equal(filas[1].repetida, true)
  assert.equal((filas[0].horas ?? 0) + (filas[1].horas ?? 0), 24)
  assert.notEqual(filas[0].obra.id, filas[1].obra.id)
})

test('EL JUEVES DE LA OBRA VIEJA NO SE RECLAMA: esa persona está marcada en la otra obra', () => {
  // El defecto que atrapa: pintar de rojo el jueves de La Estrella porque ahí no hay registro,
  // cuando la persona sí trabajó ese día — en Messina. El pie terminaría reclamando una carga que
  // ya existe, y el jefe la cargaría dos veces.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Paz', ...ESTRELLA), asig('a', 'Paz', ...MESSINA), asig('b', 'Ríos', ...ESTRELLA)],
    registros: [
      reg('a', 'estrella', L, 8), reg('a', 'messina', J, 8),
      reg('b', 'estrella', L, 8), reg('b', 'estrella', J, 8),
    ],
    dias: [L, J], hoy: HOY,
  })
  const estrellaDePaz = filas.find((f) => f.persona.id === 'a' && f.obra.id === 'estrella')!
  assert.equal(estrellaDePaz.celdas[1].estado, 'otra_obra')
  assert.deepEqual(estrellaDePaz.reclama, [], 'no se le reclama un día que ya está cargado en otra obra')
})

test('SIN MARCAR SE RECLAMA SÓLO SI ESE DÍA ALGUIEN MÁS MARCÓ', () => {
  // Dos silencios distintos: el miércoles otros marcaron y a Molina no (reclamo rojo); el sábado no
  // marcó nadie en ninguna obra, y ahí la grilla NO puede elegir entre «no se trabajó» y «nadie lo
  // cargó». Afirmar cualquiera de las dos sería inventar.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Molina', ...ESTRELLA), asig('b', 'Ríos', ...ESTRELLA)],
    registros: [reg('b', 'estrella', X, 8)],
    dias: [X, S], hoy: '2026-09-13',
  })
  const molina = filas.find((f) => f.persona.id === 'a')!
  assert.equal(molina.celdas[0].estado, 'sin_marcar')
  assert.equal(molina.celdas[1].estado, 'sin_dato')
  assert.deepEqual(molina.reclama, [X])
  assert.equal(diasSinMarcar(filas), 1, 'el sábado sin ningún dato no es un día reclamado')
})

test('UN DÍA QUE TODAVÍA NO PASÓ NO SE RECLAMA', () => {
  // El defecto que atrapa: entrar el lunes a la quincena en curso y encontrarse cuatro días en rojo
  // por no haber cargado horas que todavía no se trabajaron.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Molina', ...ESTRELLA), asig('b', 'Ríos', ...ESTRELLA)],
    registros: [reg('b', 'estrella', L, 8)],
    dias: [L, M, X], hoy: L,
  })
  const molina = filas.find((f) => f.persona.id === 'a')!
  assert.equal(molina.celdas[0].estado, 'sin_marcar')
  assert.equal(molina.celdas[1].estado, 'futuro')
  assert.equal(molina.celdas[2].estado, 'futuro')
  assert.deepEqual(molina.reclama, [L])
})

test('UN FERIADO NO SE RECLAMA aunque otros hayan cargado ese día', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Molina', ...ESTRELLA), asig('b', 'Ríos', ...ESTRELLA)],
    registros: [reg('b', 'estrella', X, 8)],
    dias: [X], noLaborables: [X], hoy: HOY,
  })
  assert.equal(filas.find((f) => f.persona.id === 'a')!.celdas[0].estado, 'no_laborable')
  assert.equal(diasSinMarcar(filas), 0)
})

test('LA AUSENCIA SE VE «A» Y NO SUMA HORAS NI A LA FILA NI A LA COLUMNA', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Molina', ...ESTRELLA), asig('b', 'Ríos', ...ESTRELLA)],
    registros: [reg('a', 'estrella', V, 8.8, 'ausencia'), reg('b', 'estrella', V, 8.8)],
    dias: [V], hoy: HOY,
  })
  const molina = filas.find((f) => f.persona.id === 'a')!
  assert.equal(molina.celdas[0].estado, 'ausente')
  assert.equal(molina.celdas[0].horas, null)
  assert.equal(molina.horas, null, 'de un ausente no se puede decir que trabajó cero: se sabe que no vino')
  assert.deepEqual(totalesPorDia(filas, [V]), [8.8])
  assert.equal(totalDeLaQuincenaPorObra(filas), 8.8)
})

test('UN DÍA SIN NINGUNA HORA NO TOTALIZA CERO: totaliza null', () => {
  // El defecto que atrapa: una fila de totales que dice «0» el sábado. Cero horas es una afirmación
  // sobre el trabajo de ese día; lo que hay es la falta de cualquier registro.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Molina', ...ESTRELLA)],
    registros: [reg('a', 'estrella', L, 8)],
    dias: [L, S], hoy: '2026-09-13',
  })
  assert.deepEqual(totalesPorDia(filas, [L, S]), [8, null])
})

test('LOS CHIPS CUENTAN PERSONAS DISTINTAS POR OBRA, no filas', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [
      asig('a', 'Paz', ...ESTRELLA), asig('b', 'Ríos', ...ESTRELLA), asig('a', 'Paz', ...MESSINA),
    ],
    registros: [],
    dias: [L], hoy: HOY,
  })
  assert.deepEqual(personasPorObra(filas), [
    { obra_id: 'estrella', nombre: 'La Estrella', personas: 2 },
    { obra_id: 'messina', nombre: 'Messina', personas: 1 },
  ])
})

test('HORAS CARGADAS EN UNA OBRA SIN ASIGNACIÓN VIGENTE SIGUEN APARECIENDO', () => {
  // Las horas existen y son de esa obra. Si la fila desapareciera al cerrar la asignación, el costo
  // de mano de obra de esa obra se caería de la pantalla sin que nadie borrara nada.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Paz', ...ESTRELLA)],
    registros: [reg('a', 'messina', L, 8)],
    dias: [L], hoy: HOY,
  })
  assert.equal(filas.length, 2)
  assert.ok(filas.some((f) => f.obra.id === 'messina' && f.horas === 8))
})

test('UNA FILA SIN NINGUNA HORA TOTALIZA null, no cero', () => {
  // El defecto que atrapa: escribir «0» en la columna HORAS de quien no fue marcado. Cero es una
  // afirmación sobre su quincena; lo que hay es la falta de cualquier registro. Y de un ausente
  // tampoco se puede decir que trabajó cero: se sabe que no vino, que es otra cosa.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Molina', ...ESTRELLA), asig('b', 'Ríos', ...ESTRELLA)],
    registros: [reg('b', 'estrella', L, 8)],
    dias: [L], hoy: HOY,
  })
  assert.equal(filas.find((f) => f.persona.id === 'a')!.horas, null)
  assert.equal(filas.find((f) => f.persona.id === 'b')!.horas, 8)
  assert.equal(totalDeLaQuincenaPorObra(filas), 8, 'el total de la quincena no se rompe con un null')
})

test('UNA FILA SÓLO CON AUSENCIAS TOTALIZA null: no vino no es trabajó cero', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('a', 'Molina', ...ESTRELLA)],
    registros: [reg('a', 'estrella', L, 8.8, 'ausencia')],
    dias: [L], hoy: HOY,
  })
  assert.equal(filas[0].horas, null)
})
