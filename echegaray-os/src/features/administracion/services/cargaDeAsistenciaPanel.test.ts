import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  botonDelTelefono, DESTINO_SIN_OBRA, entradaDePase, sinMarcarPorObra,
  type FilaDeCarga, type PersonaDeLaCarga,
} from './cargaDeAsistencia.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN (rediseño aprobado, 17/09/2026):
//  1. Que «Marcar presentes» pise un Ausente o una Licencia, o marque a alguien sin obra en una obra
//     adivinada.
//  2. Que el botón grande del teléfono DESMARQUE un presente con un toque de más.
//  3. Que el panel mande un pase hacia atrás, sin destino, o con `desde` de hoy sin vuelta (la acción
//     usa su propio hoy: a medianoche el pase rebotaría con «hacia atrás»).

const HOY = '2026-09-17'
const persona = (id: string): PersonaDeLaCarga => ({ id, nombre: id, categoria: null, esJefe: false })
const fila = (id: string, obraId: string | null, estado: FilaDeCarga['casilla']['estado'] = null): FilaDeCarga => ({
  persona: persona(id), obraId, porque: obraId ? 'asignacion' : 'sin-obra', casilla: { estado, motivo: null }, horas: null, otrasObras: [],
})

test('marcar presentes: sólo los sin marcar, agrupados por su obra; sin obra se cuenta y no se marca', () => {
  const filas = [fila('a', 'qp'), fila('b', 'qp', 'ausente'), fila('c', 'me'), fila('d', null), fila('e', 'qp', 'licencia')]
  const { porObra, sinObra } = sinMarcarPorObra(filas, {}, (f) => f.obraId)
  assert.deepEqual([...porObra.entries()], [['qp', ['a']], ['me', ['c']]])
  assert.equal(sinObra, 1)
})

test('marcar presentes: manda la casilla local (lo recién tocado), no la del servidor', () => {
  const { porObra } = sinMarcarPorObra([fila('a', 'qp'), fila('b', 'qp')], { a: { estado: 'presente', motivo: null } }, (f) => f.obraId)
  assert.deepEqual(porObra.get('qp'), ['b'])
})

test('marcar presentes: la obra elegida para un día pasado cuenta como obra', () => {
  const { porObra, sinObra } = sinMarcarPorObra([fila('d', null)], {}, () => 'sf')
  assert.deepEqual(porObra.get('sf'), ['d'])
  assert.equal(sinObra, 0)
})

test('el botón del teléfono marca sólo sobre «sin marcar»; sobre cualquier marca abre la ficha', () => {
  assert.equal(botonDelTelefono({ estado: null, motivo: null }).accion, 'marcar')
  for (const estado of ['presente', 'ausente', 'licencia'] as const) {
    assert.equal(botonDelTelefono({ estado, motivo: null }).accion, 'abrir', estado)
  }
  assert.equal(botonDelTelefono({ estado: 'presente', motivo: null }).rotulo, '✓ Presente')
})

test('pase desde hoy sin vuelta: sin `desde`, la acción usa su propio hoy', () => {
  const r = entradaDePase({ personaId: 'p', destino: 'qp', desde: HOY, hasta: null, hoy: HOY })
  assert.deepEqual(r, { ok: true, entrada: { persona_id: 'p', obra_id: 'qp' } })
})

test('pase programado con vuelta: viajan las dos fechas', () => {
  const r = entradaDePase({ personaId: 'p', destino: 'qp', desde: '2026-09-21', hasta: '2026-09-25', hoy: HOY })
  assert.deepEqual(r, { ok: true, entrada: { persona_id: 'p', obra_id: 'qp', desde: '2026-09-21', hasta: '2026-09-25' } })
})

test('pase: sin destino, hacia atrás o con vuelta antes de la ida no viaja', () => {
  assert.equal(entradaDePase({ personaId: 'p', destino: '', desde: HOY, hasta: null, hoy: HOY }).ok, false)
  assert.equal(entradaDePase({ personaId: 'p', destino: 'qp', desde: '2026-09-16', hasta: null, hoy: HOY }).ok, false)
  assert.equal(entradaDePase({ personaId: 'p', destino: 'qp', desde: '2026-09-21', hasta: '2026-09-20', hoy: HOY }).ok, false)
})

test('«Sin obra» elegido a propósito viaja como obra nula', () => {
  const r = entradaDePase({ personaId: 'p', destino: DESTINO_SIN_OBRA, desde: HOY, hasta: null, hoy: HOY })
  assert.deepEqual(r, { ok: true, entrada: { persona_id: 'p', obra_id: null } })
})
