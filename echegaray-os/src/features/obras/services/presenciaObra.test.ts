// LO QUE ATRAPAN: que la 09 llame «ausente» a quien no fichó, que esconda a quien fichó sin estar
// asignado, y que publique una jornada cerrada sobre alguien que volvió a entrar.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  avisosDelDia, estadoDeFila, horasDeHoy, hoyEnObra, SIN_CUADRILLA,
  type AsignadoDeObra, type MarcaDelDia,
} from './presenciaObra.ts'

const asignado = (p: Partial<AsignadoDeObra>): AsignadoDeObra => ({
  persona_id: 'p1', persona_nombre: 'Juan Tello', rol: 'integrante', cuadrilla: 'Cuadrilla 1',
  hasta: null, ...p,
})

const marca = (p: Partial<MarcaDelDia>): MarcaDelDia => ({
  persona_id: 'p1', nombre_completo: 'Juan Tello', categoria: 'oficial', puesto: null,
  entrada: '2026-08-24T10:05:00Z', salida: null, estado: 'activo',
  lat: null, lon: null, precision_m: null, ...p,
})

test('SIN MARCA ES «SIN FICHAR», NUNCA «AUSENTE»: no se declara una falta con la ausencia de un dato', () => {
  const r = hoyEnObra([asignado({})], [])
  assert.equal(r.sinFichar, 1)
  assert.equal(r.enObra, 0)
  const [fila] = r.grupos[0].filas
  assert.equal(estadoDeFila(fila).texto, 'sin fichar')
  assert.equal(estadoDeFila(fila).tono, 'nulo', 'no lleva punto: la ausencia de dato no es un estado')
})

test('cero marcas no es cero personas: el grupo sigue diciendo cuántos se esperaban', () => {
  const r = hoyEnObra([asignado({ persona_id: 'a' }), asignado({ persona_id: 'b' })], [])
  assert.equal(r.grupos[0].asignados, 2)
  assert.equal(r.grupos[0].presentes, 0)
})

test('quien fichó en esta obra SIN asignación vigente aparece igual, no se lo esconde', () => {
  const r = hoyEnObra([], [marca({ persona_id: 'x', nombre_completo: 'Externo' })])
  assert.equal(r.sinAsignacion, 1)
  assert.equal(r.grupos[0].cuadrilla, SIN_CUADRILLA)
  assert.equal(r.grupos[0].filas[0].asignado, false)
  assert.equal(r.grupos[0].asignados, 0, 'no estaba asignado: sumarlo inventaría un plantel')
})

test('la asignación CERRADA no cuenta como plantel de hoy', () => {
  const r = hoyEnObra([asignado({ hasta: '2026-07-31' })], [])
  assert.deepEqual(r.grupos, [])
  assert.equal(r.asignados, 0)
})

test('DOS MARCAS EL MISMO DÍA: gana la jornada abierta, no la que ya cerró', () => {
  // Cerró a mediodía y volvió a entrar. Publicar la cerrada diría que ya se fue.
  const r = hoyEnObra([asignado({})], [
    marca({ estado: 'cerrada', entrada: '2026-08-24T10:00:00Z', salida: '2026-08-24T15:00:00Z' }),
    marca({ estado: 'activo', entrada: '2026-08-24T16:00:00Z' }),
  ])
  assert.equal(r.enObra, 1)
  assert.equal(r.grupos[0].filas[0].marca?.entrada, '2026-08-24T16:00:00Z')
})

test('el que le falta la salida no se cuenta como en obra, y lo dice', () => {
  const r = hoyEnObra([asignado({})], [marca({ estado: 'falta_salida' })])
  assert.equal(r.enObra, 0)
  assert.equal(r.cerraron, 1)
  assert.equal(estadoDeFila(r.grupos[0].filas[0]).texto, 'falta la salida')
})

test('los grupos y las filas salen en orden estable: la lista no puede bailar entre dos cargas', () => {
  const r = hoyEnObra([
    asignado({ persona_id: 'c', persona_nombre: 'Zulema', cuadrilla: 'Cuadrilla 2' }),
    asignado({ persona_id: 'a', persona_nombre: 'Ana', cuadrilla: 'Cuadrilla 2' }),
    asignado({ persona_id: 'b', persona_nombre: 'Beto', cuadrilla: 'Cuadrilla 1' }),
  ], [])
  assert.deepEqual(r.grupos.map((g) => g.cuadrilla), ['Cuadrilla 1', 'Cuadrilla 2'])
  assert.deepEqual(r.grupos[1].filas.map((f) => f.nombre), ['Ana', 'Zulema'])
})

test('sin cuadrilla cargada la persona no desaparece: cae en su propio grupo', () => {
  const r = hoyEnObra([asignado({ cuadrilla: '   ' })], [])
  assert.equal(r.grupos[0].cuadrilla, SIN_CUADRILLA)
})

// ═══ EL PANEL «ATENCIÓN DE HOY» Y LOS KPIS DEL CANÓNICO 09 ═══
//
// LO QUE ATRAPAN: que el panel emita renglones en 0 (que es cómo un panel de excepciones se vuelve
// invisible), que cuente dos veces al que fichó sin asignación, que la banda publique «0 HH» en una
// jornada donde todavía nadie imputó, y que una ausencia cargada se cuente como trabajo.

test('un aviso en 0 NO se emite: cuatro renglones que dicen cero enseñan a no mirar el panel', () => {
  const r = hoyEnObra([asignado({})], [marca({})])
  assert.deepEqual(avisosDelDia(r), [], 'todos ficharon y nadie fichó de más: no hay nada que atender')
})

test('el que fichó sin asignación NO se cuenta además como «sin cuadrilla»: es un problema, no dos', () => {
  const r = hoyEnObra([], [marca({ persona_id: 'x', nombre_completo: 'Ajeno' })])
  const claves = avisosDelDia(r).map((a) => a.clave)
  assert.deepEqual(claves, ['sin_asignacion'])
  assert.equal(avisosDelDia(r)[0].n, 1)
})

test('el panel NUNCA emite un aviso de ausencia: el OS no tiene ese dato y no lo va a deducir', () => {
  const r = hoyEnObra([asignado({ persona_id: 'a' }), asignado({ persona_id: 'b' })], [])
  const avisos = avisosDelDia(r)
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].clave, 'sin_fichar')
  assert.equal(avisos[0].titulo, 'Sin fichar')
  assert.ok(
    !JSON.stringify(avisos).toLowerCase().includes('ausen'),
    'dos asignados sin marca no son dos ausentes: pueden no tener teléfono',
  )
})

test('el asignado a la obra sin cuadrilla tiene su propio aviso, y no se mezcla con el ajeno', () => {
  const r = hoyEnObra(
    [asignado({ persona_id: 'a', cuadrilla: null })],
    [marca({ persona_id: 'a' }), marca({ persona_id: 'z', nombre_completo: 'Ajeno' })],
  )
  const por = new Map(avisosDelDia(r).map((a) => [a.clave, a.n]))
  assert.equal(por.get('sin_cuadrilla'), 1, 'el asignado sin frente')
  assert.equal(por.get('sin_asignacion'), 1, 'el que fichó de más — y son personas distintas')
})

test('SIN NINGÚN REGISTRO IMPUTADO EL TOTAL ES null, NUNCA 0: a las diez no se trabajó cero', () => {
  assert.equal(horasDeHoy([], '2026-08-24').total, null)
  assert.equal(
    horasDeHoy([{ persona_id: 'a', fecha: '2026-08-23', horas: 8, tipo_hora: 'normal' }], '2026-08-24').total,
    null,
    'lo de ayer no es lo de hoy',
  )
})

test('una ausencia tiene horas cargadas y NO es trabajo: no entra en las HH imputadas del día', () => {
  const r = horasDeHoy([
    { persona_id: 'a', fecha: '2026-08-24', horas: 8, tipo_hora: 'normal' },
    { persona_id: 'b', fecha: '2026-08-24', horas: 8, tipo_hora: 'ausencia' },
    { persona_id: 'c', fecha: '2026-08-24', horas: 8, tipo_hora: 'licencia' },
  ], '2026-08-24')
  assert.equal(r.total, 8)
  assert.equal(r.porPersona.get('b'), undefined, 'el ausente no muestra 8 HH en su fila')
})

test('el registro semanal legacy (sin fecha) no se atribuye a un día: repartirlo sería fabricarlo', () => {
  const r = horasDeHoy([{ persona_id: 'a', fecha: null, horas: 40, tipo_hora: 'normal' }], '2026-08-24')
  assert.equal(r.total, null)
  assert.equal(r.porPersona.size, 0)
})

test('las extras suman al día y a la persona: son horas trabajadas, con recargo o sin él', () => {
  const r = horasDeHoy([
    { persona_id: 'a', fecha: '2026-08-24', horas: 8, tipo_hora: 'normal' },
    { persona_id: 'a', fecha: '2026-08-24', horas: 2, tipo_hora: 'extra_50' },
  ], '2026-08-24')
  assert.equal(r.total, 10)
  assert.equal(r.porPersona.get('a'), 10, 'se guardan reales: 2 al 50 % son 2, no 3')
})
