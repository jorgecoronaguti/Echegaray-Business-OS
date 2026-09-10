import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  declaracionDeCorreccion, declaracionesDeJornada, estadoDeAusencia, planDeDeclaracion,
  seQuitaLaPresencia, seRetiraLaPresencia,
} from './presenciaPorHoras.ts'
import type { DeclaracionPedida, PresenciaEnLaBase } from './presenciaPorHoras.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. QUE CARGAR HORAS NO DECLARE NADA. Es el defecto que el dueño vio el 08/09/2026 18:15:
//     Nievas, Ochoa y Pastrán con 9 hs cargadas a mano y el Plantel diciendo «sin marcar».
//  2. QUE SE FABRIQUE PRESENCIA SIN HORAS. Un envío con horas en cero no puede afirmar que la
//     persona estuvo: sería exactamente lo que la regla E del 08/09 prohíbe.
//  3. QUE UNA CARGA DE HORAS PISE LO QUE EL JEFE DECLARÓ. Marcó «no vino» a la mañana; a la tarde
//     alguien carga la cuadrilla entera y el día pasa a «presente» sin que nadie lo afirmara.
//  4. QUE LA CORRECCIÓN DE ADMINISTRACIÓN NO PUEDA CORREGIR. El caso simétrico del anterior: si el
//     select «Qué pasó ese día» entrara como presencia deducida, el panel no podría arreglar nada.
//  5. QUE GUARDAR DOS VECES REESCRIBA LA FIRMA. `marcado_por` terminaría diciendo el nombre de
//     quien sólo volvió a apretar Guardar.
//  6. QUE «no vino → vacaciones» quede como ausencia (o al revés): son hechos con consecuencias
//     distintas y la diferencia la decide el motivo, no una casilla aparte.
//  7. QUE BORRAR LAS HORAS BORRE UNA DECLARACIÓN. Sacar lo cargado no es decir que no estuvo.
//  8. QUE SE BORRE ADIVINANDO. Antes de que la migración aplique `origen`, el origen es
//     desconocido: ahí no se retira nada.

const enLaBase = (
  persona_id: string, estado: PresenciaEnLaBase['estado'],
  origen: PresenciaEnLaBase['origen'], motivo: string | null = null,
): PresenciaEnLaBase => ({ persona_id, fecha: '2026-09-08', estado, motivo, origen })

// ── 1 · QUÉ DECLARA UNA CARGA DE HORAS ───────────────────────────────────────────────────────────

test('cargar horas > 0 declara PRESENTE, con origen «horas» y sin motivo', () => {
  const d = declaracionesDeJornada(
    [{ persona_id: 'p1', estado: 'presente', horas: 9 }], '2026-09-08', 'obra-1')
  assert.deepEqual(d, [{
    persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-1',
    estado: 'presente', motivo: null, origen: 'horas',
  }])
})

test('cero horas NO declara presencia: sin horas escritas no hay nada que afirmar', () => {
  const d = declaracionesDeJornada(
    [{ persona_id: 'p1', estado: 'presente', horas: 0 }], '2026-09-08', 'obra-1')
  assert.deepEqual(d, [])
})

test('la «A» de la grilla declara AUSENTE, y entra como declarada: la eligió una persona', () => {
  const d = declaracionesDeJornada(
    [{ persona_id: 'p1', estado: 'ausente', horas: 9, motivo: 'falta' }], '2026-09-08', 'obra-1')
  assert.equal(d[0].estado, 'ausente')
  assert.equal(d[0].motivo, 'falta')
  assert.equal(d[0].origen, 'declarada')
})

test('el MOTIVO decide ausencia o licencia, igual que el tipo_hora', () => {
  assert.equal(estadoDeAusencia('vacaciones'), 'licencia')
  assert.equal(estadoDeAusencia('enfermedad'), 'licencia')
  assert.equal(estadoDeAusencia('falta'), 'ausente')
  assert.equal(estadoDeAusencia(null), 'ausente')
  const d = declaracionesDeJornada(
    [{ persona_id: 'p1', estado: 'ausente', horas: 9, motivo: 'vacaciones' }], '2026-09-08', 'o')
  assert.equal(d[0].estado, 'licencia')
})

test('el panel de escritorio declara siempre a mano: «Trabajó» y «No vino» son actos', () => {
  const trabajo = declaracionDeCorreccion({
    persona_id: 'p1', fecha: '2026-09-08', obra: 'obra-1', estado: 'presente', motivo: null })
  assert.deepEqual(trabajo, {
    persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-1',
    estado: 'presente', motivo: null, origen: 'declarada',
  })
  const noVino = declaracionDeCorreccion({
    persona_id: 'p1', fecha: '2026-09-08', obra: null, estado: 'ausente', motivo: 'enfermedad' })
  assert.equal(noVino.estado, 'licencia')
  assert.equal(noVino.origen, 'declarada')
})

// ── 2 · UNA «horas» NO PISA UNA «declarada» ──────────────────────────────────────────────────────

const porHoras: DeclaracionPedida = {
  persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-1',
  estado: 'presente', motivo: null, origen: 'horas',
}

test('cargar horas NO pisa el «no vino» que declaró el jefe', () => {
  const plan = planDeDeclaracion([porHoras], [enLaBase('p1', 'ausente', 'declarada', 'falta')])
  assert.deepEqual(plan.escribir, [])
  assert.equal(plan.omitidas.length, 1)
  assert.match(plan.omitidas[0].porque, /a mano/)
})

test('sin la columna origen todavía aplicada, lo guardado se protege igual', () => {
  // `origen: null` es la base sin la migración. Todas esas filas las escribió la pantalla móvil.
  const plan = planDeDeclaracion([porHoras], [enLaBase('p1', 'ausente', null, 'falta')])
  assert.deepEqual(plan.escribir, [])
})

test('la corrección de Administración SÍ pisa lo declarado en el celular', () => {
  const aMano = declaracionDeCorreccion({
    persona_id: 'p1', fecha: '2026-09-08', obra: 'obra-1', estado: 'presente', motivo: null })
  const plan = planDeDeclaracion([aMano], [enLaBase('p1', 'ausente', 'declarada', 'falta')])
  assert.deepEqual(plan.escribir, [aMano])
})

test('una presencia deducida SÍ escribe cuando no había nada declarado — el defecto del 08/09', () => {
  const plan = planDeDeclaracion([porHoras], [])
  assert.deepEqual(plan.escribir, [porHoras])
})

test('una presencia deducida corrige a otra deducida: es la misma clase de dato', () => {
  const plan = planDeDeclaracion([porHoras], [enLaBase('p1', 'ausente', 'horas', 'falta')])
  assert.deepEqual(plan.escribir, [porHoras])
})

test('lo idéntico no se reescribe: la firma del marcado_por no se pisa por volver a guardar', () => {
  const plan = planDeDeclaracion([porHoras], [enLaBase('p1', 'presente', 'horas')])
  assert.deepEqual(plan.escribir, [])
  assert.equal(plan.omitidas[0].porque, 'ya estaba así')
})

test('cambiar el motivo de una ausencia SÍ se escribe', () => {
  const a = declaracionDeCorreccion({
    persona_id: 'p1', fecha: '2026-09-08', obra: null, estado: 'ausente', motivo: 'lluvia' })
  const plan = planDeDeclaracion([a], [enLaBase('p1', 'ausente', 'declarada', 'falta')])
  assert.deepEqual(plan.escribir, [a])
})

test('el tramo de licencia produce una declaración POR DÍA', () => {
  const dias = ['2026-09-08', '2026-09-09', '2026-09-10'].map((fecha) => declaracionDeCorreccion({
    persona_id: 'p1', fecha, obra: null, estado: 'ausente', motivo: 'vacaciones' }))
  const plan = planDeDeclaracion(dias, [enLaBase('p1', 'licencia', 'declarada', 'vacaciones')])
  // El primer día ya estaba asentado igual; los otros dos entran. Cada día es su propia fila.
  assert.deepEqual(plan.escribir.map((d) => d.fecha), ['2026-09-09', '2026-09-10'])
  assert.equal(plan.escribir.every((d) => d.estado === 'licencia'), true)
})

// ── 3 · RETIRAR LO QUE PRODUJERON LAS HORAS ──────────────────────────────────────────────────────

test('borrar las horas retira la presencia que salió de esas horas', () => {
  assert.equal(seRetiraLaPresencia(enLaBase('p1', 'presente', 'horas'), false), true)
})

test('borrar las horas NO retira lo que alguien declaró a mano', () => {
  assert.equal(seRetiraLaPresencia(enLaBase('p1', 'presente', 'declarada'), false), false)
})

test('si al día le quedan horas o una ausencia, no se retira nada', () => {
  assert.equal(seRetiraLaPresencia(enLaBase('p1', 'presente', 'horas'), true), false)
})

test('sin poder saber el origen no se borra: un control que no distingue, no adivina', () => {
  assert.equal(seRetiraLaPresencia(enLaBase('p1', 'presente', null), false), false)
})

test('sin presencia guardada no hay nada que retirar', () => {
  assert.equal(seRetiraLaPresencia(null, false), false)
})

// ── 4 · QUITAR EL PRESENTE A MANO (dueño, 10/09/2026) ────────────────────────────────────────────
//
// EL DEFECTO QUE ATRAPAN: que una marca declarada no se pueda revocar. Textual: *«si quiero
// sacarle el presente a alguien que lo tiene, no puedo actualmente»*. `seRetiraLaPresencia` decía
// que no —y con razón, porque responde otra pregunta: si BORRAR LAS HORAS arrastra la marca—, y esa
// negativa se había convertido en la respuesta a las dos preguntas. Si alguien vuelve a exigir
// `origen === 'horas'` acá, estos dos casos se ponen rojos.

test('quitar el presente a mano SÍ revoca una marca declarada', () => {
  assert.deepEqual(seQuitaLaPresencia(enLaBase('p1', 'presente', 'declarada')), { quita: true })
})

test('quitar también alcanza a la marca que produjeron las horas', () => {
  assert.deepEqual(seQuitaLaPresencia(enLaBase('p1', 'presente', 'horas')), { quita: true })
})

test('sin saber el origen igual se quita: es un acto, no una deducción', () => {
  // Al revés que `seRetiraLaPresencia`, donde no saber el origen obliga a no tocar nada: allá el
  // sistema decide solo, acá alguien está mirando la fila y lo pidió.
  assert.deepEqual(seQuitaLaPresencia(enLaBase('p1', 'presente', null)), { quita: true })
})

test('sin marca guardada no hay nada que quitar, y se dice por qué', () => {
  const r = seQuitaLaPresencia(null)
  assert.equal(r.quita, false)
  assert.match(r.quita === false ? r.porque : '', /ninguna marca/i)
})
