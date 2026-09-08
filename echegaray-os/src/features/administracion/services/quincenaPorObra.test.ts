import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarQuincenaPorObra, diasSinMarcar, personasPorObra, SIN_OBRA, totalDeLaQuincena, totalesPorDia,
} from './quincenaPorObra.ts'
import type { AsignacionQuincena, ObraRotulo, RegistroQuincena } from './quincenaPorObra.ts'

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

// EL CATÁLOGO ES LO QUE EVITA EL SLUG. Los ids son slugs de verdad —salieron de la base el
// 08/09/2026— y ninguno puede aparecer en la salida.
const OBRAS: Record<string, ObraRotulo> = {
  'pisos-industriales': { id: 'pisos-industriales', nombre: 'PISOS INDUSTRIALES', cliente: 'ARCOR' },
  'sf-mamposteria': { id: 'sf-mamposteria', nombre: 'MAMPOSTERÍA', cliente: 'San Francisco' },
  'la-estrella': { id: 'la-estrella', nombre: 'La Estrella', cliente: 'La Estrella' },
  'sin-cliente': { id: 'sin-cliente', nombre: 'GALPÓN 4', cliente: null },
}
const PISOS = 'pisos-industriales'
const MAMPO = 'sf-mamposteria'

const asig = (persona_id: string, nombre: string, obra_id: string, nota: string | null = null): AsignacionQuincena =>
  ({ persona_id, nombre, nota, obra_id })
const reg = (persona_id: string, obra_id: string, fecha: string, horas: number, tipo_hora = 'normal'): RegistroQuincena =>
  ({ persona_id, obra_id, fecha, horas, tipo_hora })

const armar = (e: {
  asignaciones: AsignacionQuincena[]; registros: RegistroQuincena[]
  dias?: string[]; noLaborables?: string[]; hoy?: string
}) => armarQuincenaPorObra({
  asignaciones: e.asignaciones, registros: e.registros, obras: OBRAS,
  dias: e.dias ?? DIAS, noLaborables: e.noLaborables, hoy: e.hoy ?? HOY,
})

test('QUIEN TIENE DOS OBRAS TIENE UNA SOLA FILA, y sus horas del día se suman', () => {
  // EL DEFECTO QUE ATRAPA, y que el dueño vio en producción: *"duplicaste personas"*. La versión
  // anterior armaba una fila por par (persona, obra) y el mismo nombre salía dos veces con la
  // leyenda «la misma persona, la otra obra».
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p1', 'Perez Juan', MAMPO)],
    registros: [reg('p1', PISOS, L, 5), reg('p1', MAMPO, L, 3.8), reg('p1', PISOS, M, 8.8)],
  })
  assert.equal(filas.length, 1, 'una persona, una fila')
  assert.equal(filas[0].clave, 'p1')
  const lunes = filas[0].celdas[0]
  assert.equal(lunes.estado, 'horas')
  assert.equal(lunes.horas, 8.8, '5 + 3,8 del mismo día son 8,8 de esa persona')
  assert.equal(filas[0].horas, 17.6, 'y la quincena suma las dos obras')
})

test('el día repartido declara sus dos obras con nombre, para que el panel lo pueda corregir', () => {
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p1', 'Perez Juan', MAMPO)],
    registros: [reg('p1', PISOS, L, 5), reg('p1', MAMPO, L, 3.8)],
  })
  const tramos = filas[0].celdas[0].tramos
  assert.equal(tramos.length, 2)
  assert.deepEqual(tramos.map((t) => t.nombre), ['MAMPOSTERÍA', 'PISOS INDUSTRIALES'])
  assert.deepEqual(tramos.map((t) => t.horas), [3.8, 5])
  assert.equal(filas[0].celdas[1].tramos.length, 0, 'un día sin nada no tiene tramos')
})

test('con dos obras activas manda la de MÁS HORAS, y el rótulo no baila entre recargas', () => {
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p1', 'Perez Juan', MAMPO)],
    registros: [reg('p1', PISOS, L, 2), reg('p1', MAMPO, L, 8)],
  })
  assert.equal(filas[0].rotuloObra, 'MAMPOSTERÍA')
  assert.equal(filas[0].obraPorDefecto?.id, MAMPO, 'y es la que recibe lo que se escriba')
})

test('SIN OBRA ACTIVA, LA COLUMNA OBRA MUESTRA EL CLIENTE', () => {
  // El pedido del dueño, textual: *"si no tiene obra activa, ponele cliente"*. El servicio sólo
  // manda asignaciones de obras ACTIVAS: quien trabajó en una obra cerrada llega con registros y
  // SIN asignación propia. El nombre sale de una asignación de otra obra —así lo resuelve
  // `personasDe`—, y el rótulo del cliente de la obra donde están sus horas.
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('p9', 'Rosales Diego', PISOS)],
    registros: [reg('p9', MAMPO, L, 8.8)],
    obras: OBRAS, dias: DIAS, hoy: HOY,
  })
  assert.equal(filas.length, 1)
  assert.equal(filas[0].rotuloObra, 'PISOS INDUSTRIALES', 'tiene obra activa: manda la obra')

  const sinActiva = armarQuincenaPorObra({
    // p9 aporta el nombre de p9; p5 no tiene ninguna asignación vigente y sólo tiene horas.
    asignaciones: [{ persona_id: 'p5', nombre: 'Zogbe Walter', nota: 'oficial', obra_id: 'obra-cerrada' }],
    registros: [reg('p5', MAMPO, L, 8.8)],
    obras: OBRAS, dias: DIAS, hoy: HOY,
  })
  assert.equal(sinActiva[0].rotuloObra, 'San Francisco', 'el CLIENTE de la obra de sus horas')
  assert.equal(sinActiva[0].obraPorDefecto, null,
    'y sin obra activa la celda no se imputa sola: elegirla movería el costo sin que nadie lo decida')
})

test('quien no tiene nombre en ninguna asignación NO se dibuja', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [], registros: [reg('p4', MAMPO, L, 8.8)],
    obras: OBRAS, dias: DIAS, hoy: HOY,
  })
  assert.equal(filas.length, 0, 'inventarle un nombre sería peor que no mostrarla')
})

test('NINGÚN SLUG SALE JAMÁS DE ACÁ', () => {
  // El defecto que atrapa: escribir `sf-mamposteria` o `la-estrella` en la columna OBRA. El dueño
  // lo prohibió textualmente. Se prueban las tres salidas: el rótulo, el nombre del tramo, y el
  // caso en que la obra NO está en el catálogo (RLS) — ahí tampoco se cae al id.
  const filas = armarQuincenaPorObra({
    asignaciones: [{ persona_id: 'p6', nombre: 'Aguero Cristian', nota: null, obra_id: 'obra-que-no-veo' }],
    registros: [reg('p6', 'obra-que-no-veo', L, 8.8), reg('p6', MAMPO, M, 4)],
    obras: OBRAS, dias: DIAS, hoy: HOY,
  })
  const textos = [
    filas[0].rotuloObra,
    ...filas.flatMap((f) => f.celdas.flatMap((c) => c.tramos.map((t) => t.nombre))),
  ]
  for (const t of textos) {
    assert.ok(!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(t), `«${t}» parece un slug y no puede llegar a la pantalla`)
  }
  // Su asignación es a una obra que la sesión no puede leer: no hay obra activa rotulable, así que
  // manda la regla del cliente sobre la obra de sus horas que SÍ está en el catálogo.
  assert.equal(filas[0].rotuloObra, 'San Francisco')
  assert.equal(filas[0].celdas[0].tramos[0].nombre, SIN_OBRA, 'lo que no puede leer se dice, no se inventa')
})

test('cuando la obra no tiene cliente cargado se usa su NOMBRE, nunca el id', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [{ persona_id: 'p7', nombre: 'Nievas Juan', nota: null, obra_id: 'sin-cliente' }],
    registros: [reg('p7', 'sin-cliente', L, 8)],
    obras: OBRAS, dias: DIAS, hoy: HOY,
  })
  assert.equal(filas[0].rotuloObra, 'GALPÓN 4')
})

test('LO TRABAJADO GANA A LA AUSENCIA CARGADA EN OTRA OBRA', () => {
  // Con la fila por obra, una ausencia era todo el día. Ahora la fila es la persona: si trabajó 8
  // en una obra y en otra alguien le cargó una ausencia, el día NO es una ausencia.
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p1', 'Perez Juan', MAMPO)],
    registros: [reg('p1', PISOS, L, 8), reg('p1', MAMPO, L, 8.8, 'ausencia')],
  })
  assert.equal(filas[0].celdas[0].estado, 'horas')
  assert.equal(filas[0].celdas[0].horas, 8, 'la ausencia no suma horas trabajadas')
  assert.equal(filas[0].celdas[0].tramos.find((t) => t.obra_id === MAMPO)?.ausente, true)
})

test('una ausencia sola sigue siendo una ausencia', () => {
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS)],
    registros: [reg('p1', PISOS, L, 8.8, 'ausencia')],
  })
  assert.equal(filas[0].celdas[0].estado, 'ausente')
  assert.equal(filas[0].celdas[0].horas, null)
  assert.equal(filas[0].horas, null, 'y no suma nada a la quincena')
})

test('EL DÍA QUE NO PASÓ NO SE RECLAMA, y el que nadie cargó tampoco', () => {
  // El defecto que atrapa: entrar el lunes a la quincena en curso y encontrarse cuatro días en rojo
  // acusando a todo el mundo de no fichar.
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p2', 'Gomez Ana', PISOS)],
    registros: [reg('p1', PISOS, L, 8.8)],
  })
  const juan = filas.find((f) => f.persona.nombre === 'Perez Juan')!
  assert.equal(juan.celdas[5].estado, 'futuro', 'el sábado 12 todavía no pasó')
  assert.equal(juan.celdas[1].estado, 'sin_dato', 'el martes no lo cargó nadie, en ninguna obra')
  const ana = filas.find((f) => f.persona.nombre === 'Gomez Ana')!
  assert.equal(ana.celdas[0].estado, 'sin_marcar', 'el lunes SÍ se cargó y a ella no: eso se reclama')
  assert.deepEqual(ana.reclama, [L])
  assert.equal(diasSinMarcar(filas), 1, 'un día reclamado, no dos')
})

test('un no laborable no se reclama ni se suma', () => {
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p2', 'Gomez Ana', PISOS)],
    registros: [reg('p1', PISOS, L, 8.8)],
    noLaborables: [M, X],
  })
  const ana = filas.find((f) => f.persona.nombre === 'Gomez Ana')!
  assert.equal(ana.celdas[1].estado, 'no_laborable')
  assert.deepEqual(ana.reclama, [L], 'sólo el lunes')
})

test('EL TOTAL DE LA QUINCENA ES «—» CUANDO NADIE DECLARÓ UNA HORA', () => {
  // El defecto que atrapa: devolver `0`. Un cero abajo de una columna de guiones afirma que la
  // empresa trabajó cero horas esa quincena, y lo que pasa es que no hay con qué contestar.
  const vacias = armar({ asignaciones: [asig('p1', 'Perez Juan', PISOS)], registros: [] })
  assert.equal(totalDeLaQuincena(vacias), null)
  assert.deepEqual(totalesPorDia(vacias, DIAS), [null, null, null, null, null, null])

  const conHoras = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p2', 'Gomez Ana', PISOS)],
    registros: [reg('p1', PISOS, L, 8.8), reg('p2', PISOS, L, 4)],
  })
  assert.equal(totalDeLaQuincena(conHoras), 12.8)
  assert.equal(totalesPorDia(conHoras, DIAS)[0], 12.8)
  assert.equal(totalesPorDia(conHoras, DIAS)[1], null, 'un día sin dato sigue siendo null')
})

test('una ausencia sola no convierte el total en cero', () => {
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS)],
    registros: [reg('p1', PISOS, L, 8.8, 'ausencia')],
  })
  assert.equal(totalDeLaQuincena(filas), null, 'una ausencia no es «trabajó cero»')
})

test('los chips cuentan personas por rótulo, no por obra técnica', () => {
  const filas = armar({
    asignaciones: [
      asig('p1', 'Perez Juan', PISOS), asig('p2', 'Gomez Ana', PISOS),
      asig('p3', 'Tello Juan', MAMPO),
    ],
    registros: [],
  })
  assert.deepEqual(personasPorObra(filas), [
    { rotulo: 'PISOS INDUSTRIALES', personas: 2 },
    { rotulo: 'MAMPOSTERÍA', personas: 1 },
  ])
})
