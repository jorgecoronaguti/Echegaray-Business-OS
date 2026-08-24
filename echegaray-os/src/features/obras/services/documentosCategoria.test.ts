// LOS DOCUMENTOS DE OBRA, AGRUPADOS POR PARA QUÉ SIRVEN — canon 23/08, pantalla 12.
//
// Los defectos que atrapa este archivo:
//
// 1. Que un grupo del canon sin papeles adentro DESAPAREZCA. Es el defecto que hacía que una obra
//    sin contrato cargado se viera igual que una con el contrato cargado.
// 2. Que «Planos», «planos» y «PLANOS» aparezcan como tres secciones distintas — texto libre
//    escrito por tres personas.
// 3. Que lo que nadie clasificó se mezcle con una categoría real y desaparezca del trabajo pendiente.
// 4. Que se adivine la categoría por el nombre del archivo AL AGRUPAR. La sugerencia por nombre
//    existe (`documentosSugerencia.ts`) pero se muestra; no mueve el papel de grupo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORIAS, CATEGORIAS_CANONICAS, categoriaDeclarada, paraQueSirve, porCategoria,
  porCategoriaFiltrado, SIN_CLASIFICAR,
} from './documentosCategoria.ts'

const doc = (drive_file_id: string, rol: string | null) => ({
  drive_file_id, rol, tipo: 'archivo', name: drive_file_id, path: null,
  mime_type: null, origen: 'confirmado', creado_en: null, modified_time: null, actividad_id: null,
}) as never

const rotulos = (docs: unknown[]) => porCategoria(docs as never).map((g) => g.categoria)

// ═══ EL DEFECTO 1: EL GRUPO VACÍO QUE DESAPARECE ═══

test('las cuatro categorías del canon se dibujan siempre, también con cero adentro', () => {
  const g = porCategoria([doc('a.pdf', CATEGORIAS.PLANOS)] as never)
  assert.deepEqual(g.map((x) => x.categoria), [...CATEGORIAS_CANONICAS, SIN_CLASIFICAR],
    'un grupo del canon sin papeles desapareció: la obra sin contrato se ve igual que la que lo tiene')
  assert.equal(g.find((x) => x.categoria === CATEGORIAS.CONTRATO)?.docs.length, 0)
})

test('sin ningún documento están los cinco grupos igual', () => {
  assert.equal(porCategoria([]).length, 5)
})

test('el orden es el del ciclo de la obra y «Sin clasificar» va último', () => {
  const g = porCategoria([doc('a', CATEGORIAS.EVIDENCIA), doc('b', null), doc('c', 'Compras')] as never)
  assert.deepEqual(g.map((x) => x.categoria), [
    CATEGORIAS.PLANOS, CATEGORIAS.CONTRATO, CATEGORIAS.SEGURIDAD, CATEGORIAS.EVIDENCIA,
    // Lo que alguien escribió a mano y no entra en el canon va DESPUÉS de las cuatro y ANTES de
    // «Sin clasificar»: no está sin clasificar, está clasificado con otra palabra.
    'Compras', SIN_CLASIFICAR,
  ])
})

// ═══ EL DEFECTO 2: LA MISMA CATEGORÍA ESCRITA DE TRES FORMAS ═══

test('la misma categoría escrita de tres formas es UNA sola', () => {
  const g = porCategoria([
    doc('a', 'Seguridad e higiene'), doc('b', 'seguridad e higiene'), doc('c', 'SEGURIDAD E HIGIENE'),
  ] as never)
  assert.equal(g.find((x) => x.categoria === CATEGORIAS.SEGURIDAD)?.docs.length, 3,
    'quedaron como tres secciones distintas')
  assert.equal(rotulos([doc('a', 'seguridad e higiene')]).filter((c) => c === CATEGORIAS.SEGURIDAD).length, 1)
})

test('los rótulos viejos del datalist caen en su categoría del canon', () => {
  // `rol` se ofrecía antes como «Contrato», «Planos», «Certificaciones», «Seguridad». Esos textos
  // pueden estar en la base: se traducen al leer, sin tocar la base.
  assert.equal(categoriaDeclarada('Planos'), CATEGORIAS.PLANOS)
  assert.equal(categoriaDeclarada('Certificaciones'), CATEGORIAS.CONTRATO)
  assert.equal(categoriaDeclarada('Seguridad'), CATEGORIAS.SEGURIDAD)
  // «Compras» NO se traduce: el canon no tiene grupo para el respaldo del costo, y meterlo en
  // «Contrato y cliente» mezclaría lo que se cobra con lo que se paga.
  assert.equal(categoriaDeclarada('Compras'), 'Compras')
})

// ═══ EL DEFECTO 3: LO NO CLASIFICADO QUE SE MEZCLA ═══

test('lo que nadie clasificó se llama «Sin clasificar» y no se mezcla', () => {
  const g = porCategoria([doc('a', null), doc('b', CATEGORIAS.CONTRATO), doc('c', '   ')] as never)
  const ultimo = g.at(-1)
  assert.equal(ultimo?.categoria, SIN_CLASIFICAR)
  assert.equal(ultimo?.docs.length, 2, 'el rol vacío y el rol en blanco son lo mismo: nadie lo miró')
})

// ═══ EL DEFECTO 4: ADIVINAR AL AGRUPAR ═══

test('no se clasifica por el nombre del archivo — sólo por lo que alguien declaró', () => {
  // «contrato_v3_final.pdf» puede ser el borrador que el cliente rechazó. La sugerencia se muestra;
  // el papel no se mueve de grupo hasta que una persona confirma.
  const g = porCategoria([doc('contrato_v3_final.pdf', null)] as never)
  assert.equal(g.at(-1)?.docs.length, 1, 'agrupó por el nombre del archivo')
  assert.equal(g.find((x) => x.categoria === CATEGORIAS.CONTRATO)?.docs.length, 0)
})

// ═══ PARA QUÉ SIRVE ═══

test('la frase del grupo sale sólo de las categorías del canon', () => {
  assert.equal(paraQueSirve(CATEGORIAS.CONTRATO), 'para cobrar')
  assert.equal(paraQueSirve(CATEGORIAS.SEGURIDAD), 'para poder trabajar')
  assert.equal(paraQueSirve('Compras'), null, 'le inventó una función a una categoría libre')
  assert.equal(paraQueSirve(SIN_CLASIFICAR), 'nadie dijo todavía para qué sirve')
})

// ═══ LOS DOS FILTROS ═══

test('el chip deja UN grupo, también cuando está vacío', () => {
  const g = porCategoriaFiltrado([doc('a', CATEGORIAS.PLANOS)] as never, '', CATEGORIAS.CONTRATO)
  assert.deepEqual(g.map((x) => x.categoria), [CATEGORIAS.CONTRATO])
  assert.equal(g[0].docs.length, 0, 'el vacío ES la respuesta: no hay ningún papel de ese grupo')
})

test('buscar por categoría trae el grupo entero y no deja cabeceras vacías', () => {
  const docs = [
    doc('nomina.xlsx', CATEGORIAS.SEGURIDAD), doc('art.pdf', CATEGORIAS.SEGURIDAD),
    doc('acta.pdf', CATEGORIAS.CONTRATO),
  ]
  const g = porCategoriaFiltrado(docs as never, 'segur')
  assert.deepEqual(g.map((x) => x.categoria), [CATEGORIAS.SEGURIDAD],
    'quedó una cabecera con cero filas: se lee como «este grupo está vacío»')
  assert.equal(g[0].docs.length, 2)
})

test('buscar por nombre recorta dentro del grupo y conserva su cabecera', () => {
  const docs = [
    doc('plano-columnas.pdf', CATEGORIAS.PLANOS), doc('plano-losa.pdf', CATEGORIAS.PLANOS),
    doc('acta.pdf', CATEGORIAS.CONTRATO),
  ]
  const g = porCategoriaFiltrado(docs as never, 'columnas')
  assert.deepEqual(g.map((x) => x.categoria), [CATEGORIAS.PLANOS], 'la fila que coincide perdió su grupo')
  assert.equal(g[0].docs.length, 1)
})

test('sin texto ni chip no filtra nada: la lista completa es la lista completa', () => {
  const docs = [doc('a.pdf', CATEGORIAS.PLANOS), doc('b.pdf', null)]
  assert.equal(porCategoriaFiltrado(docs as never, '   ').length, porCategoria(docs as never).length)
})
