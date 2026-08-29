// EL EXTRACTOR DE EXCLUSIONES VE DIEZ REDACCIONES CASTELLANAS, Y DECLARA LAS QUE NO.
//
// La auditoría adversarial midió que 8 de 10 redacciones comunes pasaban de largo. Cada forma se
// prueba AISLADA: si dos patrones cazan la misma frase, sacar uno no rompe nada y la prueba miente.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tramoNegado, terminosDe, exclusionesDelProyecto } from './corpus.mjs'
import { ALCANCE } from './alcance.mjs'

/** Una por FORMA, no una por sinónimo. */
const REDACCIONES = [
  ['prefijo · no se contempla', 'No se contempla entrepiso ni escalera.', 'entrepiso'],
  ['prefijo · sin incluir', 'Sin incluir entrepiso ni escalera.', 'entrepiso'],
  ['prefijo · se excluye', 'Se excluye de la presente cotización el entrepiso.', 'entrepiso'],
  ['prefijo · se deja fuera', 'Se deja expresamente fuera de alcance la escalera metálica.', 'escalera'],
  ['prefijo · quedan fuera de X', 'Quedan fuera del presente presupuesto los revoques y la pintura.', 'revoques'],
  ['sufijo · no está incluido', 'El entrepiso no está incluido en el presente presupuesto.', 'entrepiso'],
  ['sufijo · no forma parte', 'Los revoques no forman parte del alcance.', 'revoques'],
  ['sufijo · quedan excluidas', 'Se ratifica que el entrepiso y su escalera quedan completamente excluidas de los trabajos', 'entrepiso'],
  ['sufijo · por cuenta del comitente', 'La pintura corre por cuenta del comitente.', 'pintura'],
  ['encabezado de lista', 'EXCLUSIONES: entrepiso, escalera y revoques.', 'escalera'],
]

for (const [forma, frase, esperado] of REDACCIONES) {
  test(`ve la forma «${forma}»`, () => {
    const t = tramoNegado(frase)
    assert.ok(t, `tramoNegado devolvió null para «${frase}»`)
    assert.ok(terminosDe(t).includes(esperado), `de «${t}» no salió «${esperado}»`)
  })
}

test('una frase de obra NORMAL no se lee como exclusión: el extractor puede decir que no', () => {
  for (const f of [
    'El contratista ejecutará la mampostería de 520 m2',
    'Se incluye la provisión y colocación de la carpintería.',
    'El plazo de obra es de 90 días corridos.',
  ]) assert.equal(tramoNegado(f), null, `leyó una exclusión donde no hay: «${f}»`)
})

test('la CORROBORACIÓN sigue mandando: una forma nueva no se aplica sola', () => {
  // MUTACIÓN QUE LO PONE ROJO: `minDocumentos = 1`.
  const enUno = exclusionesDelProyecto([
    { evidencia: { categoria: 'EXCLUSION', archivo: 'Pliego.pdf' }, afirmacion: 'EXCLUSIONES: pintura.' },
  ])
  assert.deepEqual(enUno.entradas, [])
  assert.deepEqual(enUno.candidatas.map((c) => c.patron), ['pintura'])
  const enDos = exclusionesDelProyecto([
    { evidencia: { categoria: 'EXCLUSION', archivo: 'Pliego.pdf' }, afirmacion: 'EXCLUSIONES: pintura.' },
    { evidencia: { categoria: 'EXCLUSION', archivo: 'Contrato.pdf' }, afirmacion: 'La pintura no está incluida.' },
  ])
  assert.deepEqual(enDos.entradas.map((c) => c.patron), ['pintura'])
  assert.equal(enDos.entradas[0].estado, ALCANCE.EXCLUIDO)
})
