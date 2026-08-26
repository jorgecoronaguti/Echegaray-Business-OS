import test from 'node:test'
import assert from 'node:assert/strict'
import { horaDe, jornadaPorObra, titularDeLaJornada } from './presenciaPorObra.ts'
import type { Esperado, FilaPresencia } from './presencia.ts'

// LOS DEFECTOS QUE ATRAPA:
//
//  1. UN DENOMINADOR QUE NO COINCIDE CON LA LISTA. «5 de 6» tiene que salir de la MISMA gente que se
//     dibuja debajo: si saliera de otra consulta, la fracción diría una cosa y las tarjetas otra.
//  2. ESCONDER AL QUE FICHÓ SIN OBRA. Está trabajando y sus horas no van a ninguna obra: meterlo en
//     una obra cualquiera o dejarlo afuera son las dos formas de perderlo.
//  3. LLAMAR AUSENTE AL QUE NO FICHÓ. El titular no puede publicar una cuenta de faltas.

const marca = (persona: string, obraId: string | null, obra: string | null, entrada: string | null): FilaPresencia => ({
  persona_id: persona, nombre_completo: persona, categoria: 'oficial', puesto: null,
  fecha: '2026-08-26', obra_id: obraId, obra, entrada, salida: null, incidencias: 0,
  motivo: null, lat: null, lon: null, precision_m: null, origen: 'app', estado: 'activo',
})

const esperado = (id: string, obraId: string | null, obra: string | null): Esperado => ({
  id, nombre_completo: id, categoria: 'ayudante', obra_actual_id: obraId, obra_actual: obra, cuadrilla: null,
})

test('el denominador sale de la misma gente que se dibuja', () => {
  const j = jornadaPorObra(
    [marca('a', 'o1', 'Depósito Norte', '2026-08-26T07:00:00'), marca('b', 'o1', 'Depósito Norte', '2026-08-26T07:05:00')],
    [esperado('c', 'o1', 'Depósito Norte')],
  )
  assert.equal(j.obras.length, 1)
  assert.equal(j.obras[0].gente.length, 2)
  assert.equal(j.obras[0].esperados, 3, '2 fichados + 1 que no fichó')
})

test('una obra donde NADIE fichó igual aparece, con su gente esperada', () => {
  const j = jornadaPorObra([], [esperado('c', 'o9', 'Salón Comercial')])
  assert.equal(j.obras.length, 1)
  assert.deepEqual(j.obras[0].gente, [])
  assert.equal(j.obras[0].esperados, 1)
})

test('quien fichó sin obra no se mete en ninguna: queda en su propio grupo', () => {
  const j = jornadaPorObra([marca('a', null, null, '2026-08-26T07:12:00')], [])
  assert.equal(j.obras.length, 0)
  assert.equal(j.sinObra.length, 1)
  assert.equal(j.sinObra[0].entrada, '07:12')
})

test('las obras se ordenan por cuánta gente hay, y a igualdad por nombre', () => {
  const j = jornadaPorObra(
    [
      marca('a', 'o2', 'Bravo', '2026-08-26T07:00:00'),
      marca('b', 'o1', 'Alfa', '2026-08-26T07:00:00'),
      marca('c', 'o1', 'Alfa', '2026-08-26T07:00:00'),
    ],
    [],
  )
  assert.deepEqual(j.obras.map((o) => o.nombre), ['Alfa', 'Bravo'])
})

test('el titular no publica una cuenta de ausencias', () => {
  const j = jornadaPorObra([marca('a', 'o1', 'Alfa', '2026-08-26T07:00:00')], [esperado('b', 'o1', 'Alfa')])
  const t = titularDeLaJornada(j)
  assert.match(t, /sin fichar todavía/)
  assert.doesNotMatch(t, /ausen|falt(a|ó)/i, '«no fichó» no es «ausente» hasta que cierre la jornada')
})

test('sin nadie esperado ni fichado se dice, en vez de publicar 0 de 0', () => {
  assert.match(titularDeLaJornada(jornadaPorObra([], [])), /Todavía no marcó nadie/)
})

test('una hora ilegible no se inventa', () => {
  assert.equal(horaDe(null), null)
  assert.equal(horaDe('no es una fecha'), null)
})
