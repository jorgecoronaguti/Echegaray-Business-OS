// EL EXTRACTOR DE EXCLUSIONES VE DIEZ REDACCIONES CASTELLANAS, Y DECLARA LAS QUE NO.
//
// La auditoría adversarial midió que 8 de 10 redacciones comunes pasaban de largo. Cada forma se
// prueba AISLADA: si dos patrones cazan la misma frase, sacar uno no rompe nada y la prueba miente.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tramoNegado, terminosDe, exclusionesDelProyecto, delProyecto } from './corpus.mjs'
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

/** Las cuatro formas VERBALES que la re-auditoría encontró ciegas cuando el límite las daba por
 *  cubiertas. «corre por cuenta del comitente» estaba y «queda a cargo del comitente» no: media
 *  forma, que es peor que ninguna porque el límite mentía por defecto. */
const FORMAS_DE_LA_RE_AUDITORIA = [
  ['sufijo · queda a cargo del comitente', 'La pintura queda a cargo del comitente.', 'pintura'],
  ['prefijo · no se encuentra incluido', 'No se encuentra incluido el entrepiso.', 'entrepiso'],
  ['sufijo · quedan exceptuados', 'Los revoques quedan exceptuados del alcance.', 'revoques'],
  ['prefijo · no comprende', 'El presupuesto no comprende la escalera.', 'escalera'],
]

for (const [forma, frase, esperado] of FORMAS_DE_LA_RE_AUDITORIA) {
  test(`ve la forma «${forma}» (re-auditoría)`, () => {
    const t = tramoNegado(frase)
    assert.ok(t, `tramoNegado devolvió null para «${frase}»`)
    assert.ok(terminosDe(t).includes(esperado), `de «${t}» no salió «${esperado}»`)
  })
}

test('las CATORCE formas se leen sin un solo falso positivo', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar cualquiera de las cuatro regex nuevas.
  const todas = [...REDACCIONES, ...FORMAS_DE_LA_RE_AUDITORIA]
  assert.equal(todas.length, 14)
  for (const [, frase, esperado] of todas) {
    assert.ok(terminosDe(tramoNegado(frase) ?? '').includes(esperado), `ciego a: «${frase}»`)
  }
  for (const f of [
    'El contratista ejecutará la mampostería de 520 m2',
    'Se incluye la provisión y colocación de la carpintería.',
    'El plazo de obra es de 90 días corridos.',
    'La obra comprende la totalidad de los trabajos de albañilería.',
  ]) assert.equal(tramoNegado(f), null, `falso positivo en: «${f}»`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UN DOCUMENTO QUE NADIE PUDO LEER NO ES UN DOCUMENTO LEÍDO
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `delProyecto` publicaba `parseado: true` escrito a mano y tiraba la `etapa` que el corpus sí
// traía. Sobre la biblioteca real eso daba por leídos 6 documentos marcados NO_LEIDO en tres
// proyectos, y el motor contaba con ellos para decir que había entendido el proyecto. Es la misma
// forma que ya costó caro en este repo: un control incapaz de decir que no.

const BIBLIOTECA_FALSA = {
  documentos: [
    { id: 'd1', hash: 'h1', titulo: 'x/PRUEBA/leido.pdf', formato: 'PDF', etapa: 'ESTUDIADO' },
    { id: 'd2', hash: 'h2', titulo: 'x/PRUEBA/roto.pdf', formato: 'PDF', etapa: 'NO_LEIDO' },
    { id: 'd3', hash: 'h3', titulo: 'x/PRUEBA/viejo.pdf', formato: 'PDF' },
  ],
  conocimientos: [], huecos: [],
}

test('delProyecto · un documento NO_LEIDO no sale como parseado', () => {
  // MUTACIÓN CORRIDA: volver a `parseado: true` fijo → este test y el siguiente en rojo.
  const { documentos } = delProyecto(BIBLIOTECA_FALSA, 'prueba')
  const porNombre = Object.fromEntries(documentos.map((d) => [d.nombre, d]))
  assert.equal(porNombre['leido.pdf'].parseado, true)
  assert.equal(porNombre['roto.pdf'].parseado, false, 'un NO_LEIDO se publicó como leído')
})

test('delProyecto · sin etapa el estado es DESCONOCIDO, y desconocido no es leído', () => {
  // El matiz que separa este arreglo de uno peor: un documento sin etapa tampoco es `false`. No
  // sabemos si se leyó, y `null` lo dice; `false` afirmaría que falló, que es otra mentira.
  const { documentos } = delProyecto(BIBLIOTECA_FALSA, 'prueba')
  const viejo = documentos.find((d) => d.nombre === 'viejo.pdf')
  assert.equal(viejo.parseado, null)
  assert.notEqual(viejo.parseado, true)
  assert.notEqual(viejo.parseado, false)
})

test('delProyecto · la etapa viaja, no se descarta', () => {
  const { documentos } = delProyecto(BIBLIOTECA_FALSA, 'prueba')
  assert.deepEqual(documentos.map((d) => d.etapa), ['ESTUDIADO', 'NO_LEIDO', null])
})
