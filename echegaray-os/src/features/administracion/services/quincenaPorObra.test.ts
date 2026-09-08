import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarQuincenaPorObra, diasSinMarcar, personasPorObra, SIN_OBRA, totalDeLaQuincena, totalesPorDia,
} from './quincenaPorObra.ts'
import type {
  AsignacionQuincena, ObraRotulo, PersonaRotulo, RegistroQuincena, TramoFuturoFuera,
} from './quincenaPorObra.ts'

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
  // Una obra CERRADA del historial de JORNALES. Está en el catálogo —se puede rotular— pero no
  // admite horas, así que ninguna asignación suya llega marcada como elegible.
  'mamposteria-vieja': {
    id: 'mamposteria-vieja', nombre: 'MAMPOSTERÍA VIEJA', cliente: 'San Francisco', estado: 'cerrada',
  },
}
const PISOS = 'pisos-industriales'
const MAMPO = 'sf-mamposteria'

const CERRADA = 'mamposteria-vieja'

const asig = (
  persona_id: string, nombre: string, obra_id: string, nota: string | null = null,
  desde: string | null = null, hasta: string | null = null, elegible = true,
): AsignacionQuincena => ({ persona_id, nombre, nota, obra_id, desde, hasta, elegible })
const reg = (
  persona_id: string, obra_id: string | null, fecha: string, horas: number,
  tipo_hora = 'normal', notas: string | null = null,
): RegistroQuincena => ({ persona_id, obra_id, fecha, horas, tipo_hora, notas })

const armar = (e: {
  asignaciones: AsignacionQuincena[]; registros: RegistroQuincena[]
  dias?: string[]; noLaborables?: string[]; hoy?: string
  personas?: Record<string, PersonaRotulo>
  tramosFuera?: TramoFuturoFuera[]
}) => armarQuincenaPorObra({
  asignaciones: e.asignaciones, registros: e.registros, obras: OBRAS,
  dias: e.dias ?? DIAS, noLaborables: e.noLaborables, hoy: e.hoy ?? HOY,
  personas: e.personas, tramosFuera: e.tramosFuera,
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

test('con dos vigentes DEL MISMO DÍA manda la de más horas — es el ÚLTIMO desempate, no el primero', () => {
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS), asig('p1', 'Perez Juan', MAMPO)],
    registros: [reg('p1', PISOS, L, 2), reg('p1', MAMPO, L, 8)],
  })
  assert.equal(filas[0].rotuloObra, 'MAMPOSTERÍA')
  assert.equal(filas[0].obraPorDefecto?.id, MAMPO, 'y es la que recibe lo que se escriba')
})

// ═══ EL DEFECTO DEL 08/09/2026: «EMPIEZO A PONER BIEN LA OBRA QUE ESTÁN Y SE ROMPE» ═══
//
// El dueño movió a ALANIZ EMANUEL de PISOS INDUSTRIALES a Quattropani – SALÓN COMERCIAL. La base le
// hizo caso —el acuse decía «Ya estaba en Quattropani»— y el desplegable «Obra actual» seguía
// mostrando PISOS INDUSTRIALES después del refresh. La obra actual se elegía por la obra con MÁS
// HORAS de la quincena, y las horas de la quincena estaban en PISOS: la pantalla desmentía el gesto
// que el dueño acababa de hacer, y volver a intentarlo no cambiaba nada.

test('LA OBRA ACTUAL ES LA ASIGNACIÓN VIGENTE HOY, aunque TODAS las horas estén en la obra anterior', () => {
  const filas = armar({
    asignaciones: [
      // El tramo de PISOS se cerró ayer; sigue en la quincena porque sus horas del lunes al jueves
      // son reales y tienen que verse.
      asig('p1', 'Alaniz Emanuel', PISOS, null, L, J),
      asig('p1', 'Alaniz Emanuel', MAMPO, null, V, null),
    ],
    registros: [reg('p1', PISOS, L, 8.8), reg('p1', PISOS, M, 8.8), reg('p1', PISOS, X, 8.8)],
  })
  assert.equal(filas.length, 1)
  assert.equal(filas[0].obraPorDefecto?.id, MAMPO,
    'el desplegable muestra la obra a la que se lo acaba de mover, no la de sus horas')
  assert.equal(filas[0].rotuloObra, 'MAMPOSTERÍA')
  assert.equal(filas[0].celdas[0].horas, 8.8, 'y las horas del tramo cerrado se siguen viendo')
})

test('CON DOS VIGENTES GANA LA DE `desde` MÁS RECIENTE, aunque la vieja tenga más horas', () => {
  const filas = armar({
    asignaciones: [
      asig('p1', 'Perez Juan', PISOS, null, L, null),
      asig('p1', 'Perez Juan', MAMPO, null, J, null),
    ],
    registros: [reg('p1', PISOS, L, 8.8), reg('p1', PISOS, M, 8.8), reg('p1', MAMPO, J, 2)],
  })
  assert.equal(filas[0].obraPorDefecto?.id, MAMPO, 'la última decisión es la que rige')
  assert.equal(filas[0].rotuloObra, 'MAMPOSTERÍA')
})

test('UNA ASIGNACIÓN QUE EMPIEZA DESPUÉS DE HOY TODAVÍA NO ES LA OBRA ACTUAL', () => {
  // Adelantarla afirmaría un traslado que no ocurrió, y le mandaría a esa obra el costo de las
  // horas que se carguen hoy.
  const filas = armar({
    asignaciones: [
      asig('p1', 'Perez Juan', PISOS, null, L, null),
      asig('p1', 'Perez Juan', MAMPO, null, S, null),
    ],
    registros: [],
  })
  assert.equal(filas[0].obraPorDefecto?.id, PISOS)
})

test('SIN NINGUNA ASIGNACIÓN VIGENTE HOY NO HAY OBRA ACTUAL: «Sin obra» y el rótulo del cliente', () => {
  const filas = armar({
    // Toda su asignación se cerró el miércoles; sus horas siguen en la quincena.
    asignaciones: [asig('p1', 'Gonzalez Carlos', MAMPO, null, L, X)],
    registros: [reg('p1', MAMPO, L, 8.8), reg('p1', MAMPO, M, 8.8)],
  })
  assert.equal(filas[0].obraPorDefecto, null,
    'el desplegable muestra «Sin obra»: no hay a quién imputarle lo que se escriba')
  assert.equal(filas[0].rotuloObra, 'San Francisco', 'y el rótulo cae al CLIENTE de sus horas')
})

test('LOS CHIPS CUENTAN POR ASIGNACIÓN VIGENTE, no por dónde están las horas', () => {
  const filas = armar({
    asignaciones: [
      asig('p1', 'Alaniz Emanuel', PISOS, null, L, J), asig('p1', 'Alaniz Emanuel', MAMPO, null, V, null),
      asig('p2', 'Gomez Ana', PISOS, null, L, J), asig('p2', 'Gomez Ana', MAMPO, null, V, null),
      asig('p3', 'Tello Juan', PISOS, null, L, null),
    ],
    registros: [reg('p1', PISOS, L, 8.8), reg('p2', PISOS, L, 8.8)],
  })
  assert.deepEqual(personasPorObra(filas), [
    { rotulo: 'MAMPOSTERÍA', personas: 2 },
    { rotulo: 'PISOS INDUSTRIALES', personas: 1 },
  ])
})

test('EL ORDEN DE LA GRILLA NO CAMBIA: sigue siendo por nombre, no por obra ni por vigencia', () => {
  const filas = armar({
    asignaciones: [
      asig('p3', 'Zogbe Walter', MAMPO, null, V, null),
      asig('p1', 'Alaniz Emanuel', PISOS, null, L, J),
      asig('p1', 'Alaniz Emanuel', MAMPO, null, V, null),
      asig('p2', 'Gomez Ana', PISOS, null, L, null),
    ],
    registros: [reg('p1', PISOS, L, 8.8)],
  })
  assert.deepEqual(filas.map((f) => f.persona.nombre),
    ['Alaniz Emanuel', 'Gomez Ana', 'Zogbe Walter'])
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
  assert.equal(juan.celdas[4].estado, 'hoy', 'el viernes 11 es hoy: ni reclamo ni futuro')
  assert.deepEqual(juan.reclama, [], 'hoy no se reclama: la jornada todavía está corriendo')
  assert.equal(juan.celdas[1].estado, 'sin_dato', 'el martes no lo cargó nadie, en ninguna obra')
  const ana = filas.find((f) => f.persona.nombre === 'Gomez Ana')!
  assert.equal(ana.celdas[0].estado, 'sin_marcar', 'el lunes SÍ se cargó y a ella no: eso se reclama')
  assert.deepEqual(ana.reclama, [L])
  assert.equal(diasSinMarcar(filas), 1, 'un día reclamado, no dos')
})

test('EL SÁBADO QUE TODAVÍA NO LLEGÓ ES FUTURO, no un «—» de no laborable', () => {
  // EL DEFECTO QUE ATRAPA (captura del dueño, 08/09/2026): en la grilla, el S 12 —que no pasó—
  // salía con un guión mientras los demás días futuros salían vacíos. El calendario se preguntaba
  // antes que el almanaque: un día que no ocurrió no tiene nada para decir, laborable o no.
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS)],
    registros: [reg('p1', PISOS, L, 8.8)],
    noLaborables: [S],
  })
  assert.equal(filas[0].celdas[5].estado, 'futuro', 'el sábado 12 es futuro, no «no laborable»')
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

// ═══ EL DEFECTO DEL 08/09/2026: QUIROGA NO ESTABA EN LA GRILLA ═══
//
// QUIROGA ALEXANDER SEBASTIAN, activo, sin ninguna asignación en la plataforma, con 45 marcas de
// licencia por enfermedad importadas de JORNALES entre el 01/07 y el 07/09. La grilla lo
// descartaba en dos lugares a la vez: no tenía asignación con la que nombrarlo, y sus registros no
// eran horas trabajadas. «No está en la grilla» se lee como «no pasa nada con esa persona», y lo
// que pasaba era una licencia larga.

const QUIROGA: Record<string, PersonaRotulo> = {
  q1: { nombre: 'QUIROGA ALEXANDER SEBASTIAN', nota: 'oficial' },
}

test('UNA PERSONA CON SÓLO LICENCIAS EN LA QUINCENA TIENE SU FILA, con celdas L y total —', () => {
  const filas = armar({
    asignaciones: [],
    personas: QUIROGA,
    registros: [L, M, X].map((f) => reg('q1', MAMPO, f, 9, 'licencia', 'enfermedad')),
  })
  assert.equal(filas.length, 1, 'la fila existe aunque no haya una sola hora trabajada')
  assert.equal(filas[0].persona.nombre, 'QUIROGA ALEXANDER SEBASTIAN')
  assert.equal(filas[0].celdas[0].estado, 'licencia', 'licencia, NO ausencia')
  assert.equal(filas[0].celdas[0].motivo, 'Enfermedad', 'el motivo del catálogo, para el tooltip')
  assert.equal(filas[0].celdas[0].horas, null, 'una licencia NO suma horas trabajadas')
  assert.equal(filas[0].horas, null, 'el total es «—», nunca un 0 que afirme que trabajó cero')
  assert.deepEqual(filas[0].reclama, [], 'un día de licencia no es un día sin marcar')
  // LA OBRA ES LA DE SUS REGISTROS, por el cliente: sin asignación activa no hay obra que mostrar,
  // y el id es una clave técnica que el dueño ya rechazó en pantalla.
  assert.equal(filas[0].rotuloObra, 'San Francisco')
  assert.equal(filas[0].obraPorDefecto, null, 'sin obra activa no se puede escribir en sus celdas')
})

test('LA LICENCIA NO SE DIBUJA COMO AUSENCIA, y una ausencia sigue siendo ausencia', () => {
  // EL DEFECTO QUE ATRAPA: las dos caían en el mismo estado `ausente` y en la misma «A». La
  // diferencia decide si el día se paga: la licencia está autorizada y tiene respaldo documental.
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS)],
    registros: [
      reg('p1', PISOS, L, 9, 'ausencia', 'falta'),
      reg('p1', PISOS, M, 9, 'licencia', 'vacaciones'),
    ],
  })
  assert.equal(filas[0].celdas[0].estado, 'ausente')
  assert.equal(filas[0].celdas[1].estado, 'licencia')
  assert.equal(filas[0].celdas[1].motivo, 'Vacaciones')
})

test('LICENCIA GANA SOBRE AUSENCIA cuando el mismo día trae las dos', () => {
  // La misma regla que la ficha de la persona: degradar a falta un día autorizado le saca un
  // derecho al legajo. Si las dos definiciones discreparan, la grilla y la ficha dirían cosas
  // distintas del mismo día.
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS)],
    registros: [
      reg('p1', PISOS, L, 9, 'ausencia', 'falta'),
      reg('p1', MAMPO, L, 9, 'licencia', 'enfermedad'),
    ],
  })
  assert.equal(filas[0].celdas[0].estado, 'licencia')
})

test('LO TRABAJADO SIGUE GANANDO A LA LICENCIA en el mismo día', () => {
  // Una licencia cargada en una obra no puede borrar horas declaradas en otra: son 8 horas y un
  // dato contradictorio, y el que decide es el trabajo declarado.
  const filas = armar({
    asignaciones: [asig('p1', 'Perez Juan', PISOS)],
    registros: [reg('p1', PISOS, L, 8), reg('p1', MAMPO, L, 9, 'licencia', 'enfermedad')],
  })
  assert.equal(filas[0].celdas[0].estado, 'horas')
  assert.equal(filas[0].celdas[0].horas, 8)
})

test('SIN NOMBRE NO HAY FILA: un registro de alguien que no está en el plantel no se inventa', () => {
  // El límite de la regla anterior. Rotular una fila con el uuid sería mostrarle la plomería al
  // dueño, y ponerle un nombre parecido sería fabricar un dato del legajo.
  const filas = armar({
    asignaciones: [],
    personas: {},
    registros: [reg('fantasma', MAMPO, L, 9, 'licencia', 'enfermedad')],
  })
  assert.equal(filas.length, 0)
})

// ═══ LA VIGENTE ESTÁ EN UNA OBRA CERRADA (producción, 08/09/2026) ═══
//
// AGUERO, OCHOA y GONZALEZ TOBARES tienen su asignación vigente en una obra CERRADA del historial
// de JORNALES. El desplegable sólo lista obras activas, así que la fila terminaba mostrando
// «SF - PISOS INDUSTRIALES» —la primera activa— y el chip del encabezado contaba tres personas de
// más en una obra donde no están. Tres de diecisiete filas afirmaban una obra que la base no dice.

test('LA VIGENTE EN UNA OBRA CERRADA SE MUESTRA COMO ES, y NUNCA como una obra activa', () => {
  const filas = armar({
    asignaciones: [
      asig('p1', 'Aguero Luis', PISOS, null, L, J),
      asig('p1', 'Aguero Luis', CERRADA, null, V, null, false),
    ],
    registros: [reg('p1', PISOS, L, 8.8)],
  })
  assert.equal(filas.length, 1, 'la obra cerrada no crea una fila, pero tampoco la borra')
  assert.deepEqual(filas[0].obraVigenteNoElegible,
    { id: CERRADA, nombre: 'MAMPOSTERÍA VIEJA' },
    'el desplegable tiene que poder mostrar la obra real, deshabilitada')
  assert.equal(filas[0].obraPorDefecto, null,
    'y a una obra cerrada no se le imputa una hora: sin destino no se escribe')
  assert.equal(filas[0].rotuloObra, 'MAMPOSTERÍA VIEJA (cerrada)',
    'el rótulo lleva el estado REAL de la base, no una palabra inventada')
})

test('EL CHIP NO CUENTA A LA VIGENTE-EN-CERRADA DENTRO DE UNA OBRA ACTIVA', () => {
  const filas = armar({
    asignaciones: [
      asig('p1', 'Aguero Luis', PISOS, null, L, J),
      asig('p1', 'Aguero Luis', CERRADA, null, V, null, false),
      asig('p2', 'Gomez Ana', PISOS, null, L, null),
    ],
    registros: [reg('p1', PISOS, L, 8.8)],
  })
  assert.deepEqual(personasPorObra(filas), [
    { rotulo: 'MAMPOSTERÍA VIEJA (cerrada)', personas: 1 },
    { rotulo: 'PISOS INDUSTRIALES', personas: 1 },
  ], 'PISOS tiene UNA persona, no dos: la otra está en una obra cerrada y hay que decidirla')
})

test('UNA ASIGNACIÓN A UNA OBRA CERRADA NO METE A NADIE EN LA GRILLA', () => {
  const filas = armar({
    asignaciones: [asig('p7', 'Fantasma Juan', CERRADA, null, L, null, false)],
    registros: [],
  })
  assert.equal(filas.length, 0,
    'la grilla se llenaría de gente que sólo figura en obras cerradas del historial de JORNALES')
})

// ═══ EL ROL ORGANIZACIONAL VIAJA A LA FILA (08/09/2026) ═══
//
// Orden del dueño: *«dividir en la pestaña asistencia y plantel a los jefes de obra del resto de
// los obreros»*. La grilla no puede decidirlo sola —el puesto no está en la asignación ni en el
// registro—, así que entra por `puestos` y sale en `fila.esJefe`. Clavar `esJefe: false` o
// cambiar la fuente por la categoría pone este test en rojo.
test('esJefe sale de `puestos` y sólo de ahí', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [
      asig('nievas', 'NIEVAS VILLEGAS JUAN PABLO', PISOS),
      asig('acosta', 'ACOSTA RAMON', PISOS),
    ],
    registros: [reg('nievas', PISOS, L, 8), reg('acosta', PISOS, L, 8)],
    obras: OBRAS,
    dias: DIAS,
    hoy: HOY,
    puestos: { nievas: 'JEFE DE OBRA', acosta: null },
  })
  assert.deepEqual(
    filas.map((f) => [f.persona.id, f.esJefe]),
    [['acosta', false], ['nievas', true]],
  )
})

// SIN LA LECTURA DEL PUESTO NADIE ES JEFE — y la grilla queda como estaba. Es lo que sostiene que
// una lectura fallida degrade a «una sola sección» en vez de tirar la quincena entera.
test('sin `puestos` la grilla no inventa jefes', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: [asig('nievas', 'NIEVAS VILLEGAS JUAN PABLO', PISOS)],
    registros: [reg('nievas', PISOS, L, 8)],
    obras: OBRAS, dias: DIAS, hoy: HOY,
  })
  assert.equal(filas[0].esJefe, false)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PRÓXIMO PASE, SIN EL TECHO DE LA QUINCENA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('UN PASE A +20 DÍAS ES EL PRÓXIMO TRAMO — la quincena no es el horizonte del plan', () => {
  // EL DEFECTO QUE ATRAPA: `getQuincenaPorObra` se queda con las asignaciones vivas EN la ventana
  // (`desde <= hasta`), así que un pase al 01/10 —programado el 11/09, dentro de los 60 días que la
  // regla permite— no llegaba a la fila y la línea bajo el desplegable decía «programar cambio»
  // como si no hubiera nada. El panel de la misma persona SÍ lo mostraba: dos pantallas leyendo la
  // misma fila de `obra_asignacion` contestaban distinto.
  const filas = armar({
    asignaciones: [asig('acosta', 'ACOSTA RAMON', PISOS)],
    registros: [reg('acosta', PISOS, L, 8)],
    tramosFuera: [{ persona_id: 'acosta', obra_id: MAMPO, desde: '2026-10-01' }],
  })
  assert.deepEqual(filas[0].proximoTramo, {
    obra_id: MAMPO, nombre: 'MAMPOSTERÍA', desde: '2026-10-01',
  })
})

test('EL PRÓXIMO ES EL MÁS CERCANO DE LAS DOS LISTAS, no el de la que se mire primero', () => {
  // Con un pase dentro de la quincena (sábado 12) y otro a veinte días, el que se anuncia es el del
  // sábado. Quedarse con el de afuera —o concatenar sin ordenar— publicaría un pase que todavía no
  // es el que viene, y quien lo lea va a buscar a la persona a la obra equivocada el lunes.
  const filas = armar({
    asignaciones: [
      asig('acosta', 'ACOSTA RAMON', PISOS),
      asig('acosta', 'ACOSTA RAMON', MAMPO, null, S, null),
    ],
    registros: [reg('acosta', PISOS, L, 8)],
    tramosFuera: [{ persona_id: 'acosta', obra_id: 'la-estrella', desde: '2026-10-01' }],
  })
  assert.equal(filas[0].proximoTramo?.desde, S)
  assert.equal(filas[0].proximoTramo?.nombre, 'MAMPOSTERÍA')
})

test('UNA PERSONA CON SÓLO UN TRAMO FUTURO NO CREA UNA FILA VACÍA EN LA GRILLA', () => {
  // EL DEFECTO QUE ATRAPA, y la razón de que `tramosFuera` sea una entrada aparte y no un
  // ensanchamiento de `asignaciones`: `personasDe` crea una fila por cada asignación a obra activa.
  // Si los pases futuros entraran por ahí, programar a alguien para dentro de veinte días lo
  // metería HOY en la quincena con todas las celdas vacías y días «sin marcar» que nadie puede
  // marcar. Las filas siguen saliendo del plantel y de las horas.
  const filas = armar({
    asignaciones: [asig('acosta', 'ACOSTA RAMON', PISOS)],
    registros: [reg('acosta', PISOS, L, 8)],
    tramosFuera: [
      { persona_id: 'acosta', obra_id: MAMPO, desde: '2026-10-01' },
      { persona_id: 'fantasma', obra_id: PISOS, desde: '2026-10-05' },
    ],
  })
  assert.deepEqual(filas.map((f) => f.persona.id), ['acosta'])
})

test('sin `tramosFuera` la línea se comporta como antes: sólo ve lo de la ventana', () => {
  // El parámetro es opcional a propósito — una lectura que no lo trajo no puede inventar un pase.
  const filas = armar({
    asignaciones: [
      asig('acosta', 'ACOSTA RAMON', PISOS),
      asig('acosta', 'ACOSTA RAMON', MAMPO, null, S, null),
    ],
    registros: [reg('acosta', PISOS, L, 8)],
  })
  assert.equal(filas[0].proximoTramo?.desde, S)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA AUSENCIA ES DE LA PERSONA, NO DE UNA OBRA (dueño, 08/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('UNA AUSENCIA SIN OBRA PONE LA «A» EN LA CELDA: LA PERSONA NO QUEDA SIN MARCAR', () => {
  // El defecto que atrapa: si la fila sin obra se filtrara —como hacía la lectura hasta el
  // 08/09/2026— la grilla diría «sin marcar» sobre alguien que ya está declarado ausente, y la
  // pantalla reclamaría un día que ya se contestó.
  const filas = armar({
    asignaciones: [asig('p1', 'GONZALEZ TOBARES', PISOS)],
    registros: [reg('p1', null, L, 9, 'ausencia', 'enfermedad')],
  })
  assert.equal(filas[0].celdas[0].estado, 'ausente')
  assert.equal(filas[0].celdas[0].horas, null)
})

test('UNA AUSENCIA SIN OBRA NO SE MUESTRA COMO UN TRAMO DE OBRA', () => {
  // Sin esto el panel mostraría un tramo «Sin obra activa» y, con horas en otra obra el mismo día,
  // `tramos.length > 1` diría que el día se repartió entre dos obras.
  const filas = armar({
    asignaciones: [asig('p1', 'GONZALEZ TOBARES', PISOS)],
    registros: [reg('p1', null, L, 9, 'ausencia'), reg('p1', PISOS, M, 8, 'normal')],
  })
  assert.deepEqual(filas[0].celdas[0].tramos, [], 'la ausencia sin obra no es un tramo')
  assert.equal(filas[0].celdas[1].tramos.length, 1)
})

test('UNA AUSENCIA SIN OBRA PONE A SU PERSONA EN LA GRILLA Y NO FABRICA «horas en La Estrella»', () => {
  // EL DEFECTO EXACTO QUE RECHAZÓ EL DUEÑO, y su contraste. Sin asignación vigente, el rótulo de la
  // columna OBRA sale del CLIENTE de la obra donde están sus horas — y la grilla lo muestra abajo
  // del desplegable como «horas en …». La ausencia CON obra (el legado de JORNALES) rotulaba a la
  // persona en La Estrella; sin obra no rotula nada, y la fila igual existe: excluirla la dejaría
  // fuera de la grilla, que es peor que rotularla mal.
  const persona = { p1: { nombre: 'GONZALEZ TOBARES', nota: null } }
  const sinObra = armar({ asignaciones: [], registros: [reg('p1', null, L, 9, 'ausencia')], personas: persona })
  assert.equal(sinObra.length, 1, 'la persona con una ausencia sin obra tiene que estar en la grilla')
  assert.equal(sinObra[0].rotuloObra, SIN_OBRA)
  assert.equal(sinObra[0].obraPorDefecto, null)

  const comoAntes = armar({
    asignaciones: [], registros: [reg('p1', 'la-estrella', L, 9, 'ausencia')], personas: persona,
  })
  assert.equal(comoAntes[0].rotuloObra, 'La Estrella',
    'con obra sí rotula: es lo que hacía la deducción que el dueño rechazó')
})

test('LAS HORAS DE UNA AUSENCIA NO SUMAN A NINGUNA OBRA NI AL TOTAL TRABAJADO', () => {
  const filas = armar({
    asignaciones: [asig('p1', 'GONZALEZ TOBARES', PISOS)],
    registros: [reg('p1', null, L, 9, 'ausencia'), reg('p1', PISOS, M, 8, 'normal')],
  })
  assert.equal(filas[0].horas, 8, 'las 9 hs de la ausencia no son horas trabajadas de ninguna obra')
  assert.equal(totalDeLaQuincena(filas), 8)
})
