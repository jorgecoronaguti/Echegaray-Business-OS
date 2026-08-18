// LOS DOCUMENTOS DE OBRA, AGRUPADOS POR LO QUE ALGUIEN ESCRIBIÓ — no por lo que parece.
//
// El dueño (20/08): *"Organizar visualmente por categorías si ya existe metadata suficiente"* ·
// *"No inventar clasificación automática insegura"*.
//
// El defecto que atrapa este archivo NO es visual: es que «Planos», «planos» y «PLANOS» aparezcan
// como tres secciones distintas, que es lo que pasa con texto libre escrito por tres personas. Y el
// segundo, más caro: que lo que nadie clasificó se mezcle con una categoría real y desaparezca de
// la lista de trabajo pendiente.

import test from 'node:test'
import assert from 'node:assert/strict'
import { porCategoria, SIN_CLASIFICAR, CATEGORIAS_SUGERIDAS } from './documentosCategoria.ts'

const doc = (drive_file_id: string, rol: string | null) => ({
  drive_file_id, rol, tipo: 'archivo', name: drive_file_id, path: null,
  mime_type: null, origen: 'confirmado', creado_en: null,
}) as never

test('la misma categoría escrita de tres formas es UNA sola', () => {
  const g = porCategoria([doc('a', 'Planos'), doc('b', 'planos'), doc('c', 'PLANOS')])
  assert.equal(g.length, 1, '«Planos», «planos» y «PLANOS» quedaron como tres secciones')
  assert.equal(g[0].docs.length, 3)
  // Y se muestra tal como lo escribieron la PRIMERA vez: agrupar es ordenar, no corregirle la
  // letra a quien lo cargó.
  assert.equal(g[0].categoria, 'Planos')
})

test('lo que nadie clasificó se llama «Sin clasificar» y va al final', () => {
  const g = porCategoria([doc('a', null), doc('b', 'Contrato'), doc('c', '   ')])
  assert.equal(g.at(-1)?.categoria, SIN_CLASIFICAR)
  assert.equal(g.at(-1)?.docs.length, 2, 'el rol vacío y el rol en blanco son lo mismo: nadie lo miró')
  assert.equal(g[0].categoria, 'Contrato')
})

test('las sugeridas van en el orden del ciclo de obra, y las inventadas después', () => {
  const g = porCategoria([
    doc('a', 'Seguridad'), doc('b', 'Acta de medición'), doc('c', 'Contrato'), doc('d', 'Planos'),
  ])
  assert.deepEqual(g.map((x) => x.categoria), ['Contrato', 'Planos', 'Seguridad', 'Acta de medición'])
  // El orden de las sugeridas es el de la constante, no el alfabético: es el orden en que las cosas
  // pasan en una obra. Si fuera alfabético, «Certificaciones» iría antes que «Contrato».
  assert.deepEqual([...CATEGORIAS_SUGERIDAS].slice(0, 2), ['Contrato', 'Planos'])
})

test('no se clasifica por el nombre del archivo — sólo por el rol que alguien escribió', () => {
  // «contrato_v3_final.pdf» puede ser el borrador que el cliente rechazó. Archivarlo solo bajo
  // «Contrato» convierte una suposición en un hecho que después alguien cita.
  const g = porCategoria([doc('contrato_v3_final.pdf', null)])
  assert.equal(g[0].categoria, SIN_CLASIFICAR, 'adivinó la categoría por el nombre del archivo')
})
