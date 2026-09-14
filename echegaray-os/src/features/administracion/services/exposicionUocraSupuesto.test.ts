// «TODOS LOS OBREROS SON UOCRA»: un convenio vacío en el legajo de un obrero no lo saca de la comparación.
//
// 14/09/2026: en la solapa Convenios, ROSALES DIEGO JOSE salía en gris «sin convenio en el legajo»
// porque `personas.convenio_colectivo` estaba en null —el único del plantel—. El dato se corrigió en
// la base; esto es para que un legajo incompleto no vuelva a esconder a alguien que cobra bajo el
// básico. Regla del dueño: todos los obreros son UOCRA. El supuesto se DECLARA, no se esconde.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONVENIO_UOCRA, exponerAlPiso, type FilaEscala } from './exposicionConvenio.ts'

const ESCALA: FilaEscala[] = [
  { convenio: CONVENIO_UOCRA, categoria: 'Oficial', desde: '2026-08-01', valorHora: 6348, fuente: 'acuerdo UOCRA ago-2026' },
]

test('oficial con convenio vacío y $/h 5874 contra un piso UOCRA de 6348: bajo el piso, −7,5 %, supuesto declarado', () => {
  const l = exponerAlPiso({
    personaId: 'r', nombre: 'ROSALES DIEGO JOSE', convenio: null, categoria: 'oficial',
    valorHora: 5874, origenTarifa: 'test',
  }, ESCALA, '2026-09-15', 71)
  assert.equal(l.porQueNoSeCompara, null)
  assert.equal(l.bajoElPiso, true)
  assert.equal(Math.round((l.brechaPct ?? 0) * 10) / 10, -7.5)
  assert.equal(l.convenioSupuesto, 'convenio vacío en el legajo: se asume UOCRA')
})

test('las cuatro categorías de obrero asumen UOCRA; con convenio cargado no hay supuesto', () => {
  for (const categoria of ['ayudante', 'medio_oficial', 'Oficial', 'oficial_especializado']) {
    const l = exponerAlPiso({ personaId: 'x', nombre: 'X', convenio: '', categoria, valorHora: 1, origenTarifa: null }, [], '2026-09-15', 71)
    assert.notEqual(l.porQueNoSeCompara, 'sin convenio en el legajo', `${categoria} no queda «sin convenio»`)
    assert.equal(l.convenioSupuesto, 'convenio vacío en el legajo: se asume UOCRA')
  }
  const cargado = exponerAlPiso({ personaId: 'y', nombre: 'Y', convenio: CONVENIO_UOCRA, categoria: 'oficial', valorHora: 5874, origenTarifa: null }, ESCALA, '2026-09-15', 71)
  assert.equal(cargado.convenioSupuesto, null)
})

test('sin categoría de obrero sigue «sin convenio en el legajo»: la regla es de obreros, no de todos', () => {
  const administrativo = exponerAlPiso({
    personaId: 'a', nombre: 'ADMINISTRATIVO', convenio: null, categoria: 'administrativo', valorHora: 5000, origenTarifa: null,
  }, ESCALA, '2026-09-15', 71)
  assert.equal(administrativo.porQueNoSeCompara, 'sin convenio en el legajo')
  assert.equal(administrativo.bajoElPiso, false)
  assert.equal(administrativo.convenioSupuesto, null)
})
