// EL CONTRATO, LA ESTRUCTURA Y LAS PETICIONES DEL MOTOR DE DOCUMENTOS. Todo puro: sin red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { idDeTitulo, validarDocumento } from './documento-contrato.mjs'
import { leerEstructura, seccionPorId, textoDelCuerpo } from './documento-estructura.mjs'
import {
  construirBloques, construirCuerpo, requestsDeCeldas, requestsDeCuerpo, requestsDeTablas,
  requestsDeVaciadoDeSeccion, requestsDeVariables, textoPlanoDeBloques,
} from './documento-requests.mjs'
import { cuerpo } from './doble-drive.apoyo.mjs'

const DOC = {
  titulo: 'Informe de prueba',
  secciones: [
    { titulo: 'Resumen', bloques: [{ tipo: 'parrafo', texto: 'El mes cerró con dos frentes abiertos.' }] },
    { titulo: 'Partidas', bloques: [{ tipo: 'tabla', columnas: ['Ítem', 'Monto'], filas: [['Hormigón', '$ 1'], ['Acero', '$ 2']] }] },
    { titulo: 'Resumen', bloques: [{ tipo: 'lista', items: ['uno', 'dos'] }] },
  ],
}

test('el id de una sección sale del título, sin acentos y estable', () => {
  assert.equal(idDeTitulo('Ejecutado en el período'), 'ejecutado_en_el_periodo')
  assert.equal(idDeTitulo('  ¿Y esto? '), 'y_esto')
})

test('dos secciones con el mismo título NO comparten id: «actualizá X» tiene que tocar una sola', () => {
  const v = validarDocumento(DOC)
  assert.equal(v.ok, true)
  assert.deepEqual(v.doc.secciones.map((s) => s.id), ['resumen', 'partidas', 'resumen_2'])
})

test('una fila más corta que su encabezado NO pasa: sería una tabla corrida un lugar', () => {
  const v = validarDocumento({ titulo: 'x', secciones: [{ titulo: 'T', bloques: [{ tipo: 'tabla', columnas: ['a', 'b'], filas: [['1']] }] }] })
  assert.equal(v.ok, false)
  assert.match(v.errores[0], /no tienen 2 celdas/)
})

test('los offsets del cuerpo apuntan al texto que dicen apuntar', () => {
  const plan = construirCuerpo(validarDocumento(DOC).doc)
  for (const h of plan.encabezados) {
    const trozo = plan.texto.slice(h.desde, h.hasta)
    assert.match(trozo, /\n$/, 'un encabezado abarca hasta su salto de línea')
  }
  const titulo = plan.encabezados[0]
  assert.equal(plan.texto.slice(titulo.desde, titulo.hasta), 'Informe de prueba\n')
  assert.equal(plan.encabezados.find((h) => h.estilo === 'HEADING_1' && plan.texto.slice(h.desde, h.hasta) === 'Partidas\n') !== undefined, true)
})

test('el texto va en UNA sola petición y va primera: es la única que corre los índices', () => {
  const plan = construirCuerpo(validarDocumento(DOC).doc)
  const reqs = requestsDeCuerpo(plan)
  assert.equal(reqs.filter((r) => r.insertText).length, 1)
  assert.ok(reqs[0].insertText, 'insertText tiene que ir primera')
  assert.equal(reqs[0].insertText.location.index, 1)
  // Y los rangos de estilo caen dentro del texto insertado.
  const fin = 1 + plan.texto.length
  for (const r of reqs.slice(1)) {
    const rango = r.updateParagraphStyle?.range ?? r.createParagraphBullets?.range ?? r.updateTextStyle?.range
    assert.ok(rango.startIndex >= 1 && rango.endIndex <= fin, `rango fuera del texto: ${JSON.stringify(rango)}`)
  }
})

test('las tablas se insertan de la ÚLTIMA a la PRIMERA', () => {
  const doc = validarDocumento({
    titulo: 'T',
    secciones: [
      { titulo: 'A', bloques: [{ tipo: 'tabla', columnas: ['x'], filas: [['1']] }] },
      { titulo: 'B', bloques: [{ tipo: 'tabla', columnas: ['y'], filas: [['2']] }] },
    ],
  }).doc
  const plan = construirCuerpo(doc)
  const reqs = requestsDeTablas(plan)
  assert.equal(reqs.length, 2)
  assert.ok(reqs[0].insertTable.location.index > reqs[1].insertTable.location.index,
    'si se insertara de la primera a la última, la segunda entraría en un índice ya corrido')
  assert.equal(reqs[0].insertTable.rows, 2, 'filas + encabezado')
})

test('las celdas también se llenan al revés, y una tabla de menos NO se completa a medias', () => {
  const documento = {
    body: {
      content: [
        { startIndex: 1, paragraph: { elements: [{ textRun: { content: 'x\n' } }] } },
        {
          startIndex: 10,
          table: {
            tableRows: [
              { tableCells: [{ content: [{ startIndex: 12 }] }, { content: [{ startIndex: 14 }] }] },
              { tableCells: [{ content: [{ startIndex: 16 }] }, { content: [{ startIndex: 18 }] }] },
            ],
          },
        },
      ],
    },
  }
  const tablas = [{ columnas: ['A', 'B'], filas: [['1', '2']] }]
  const r = requestsDeCeldas(documento, tablas)
  assert.equal(r.error, undefined)
  const indices = r.requests.map((q) => q.insertText.location.index)
  assert.deepEqual(indices, [...indices].sort((a, b) => b - a), 'de mayor a menor índice')
  assert.deepEqual(r.requests.map((q) => q.insertText.text), ['2', '1', 'B', 'A'])

  const faltante = requestsDeCeldas(documento, [...tablas, { columnas: ['C'], filas: [['3']] }])
  assert.match(faltante.error, /declara 2/)
})

test('las variables se reemplazan por la API, no a mano sobre índices que se mueven', () => {
  const reqs = requestsDeVariables({ cliente: 'Quattropani', obra: '' })
  assert.equal(reqs.length, 2)
  assert.equal(reqs[0].replaceAllText.containsText.text, '{{cliente}}')
  assert.equal(reqs[0].replaceAllText.containsText.matchCase, true)
  assert.equal(reqs[1].replaceAllText.replaceText, '')
})

test('la estructura sale del estilo del párrafo, y una sección termina en el próximo título de nivel ≤', () => {
  const doc = cuerpo([
    ['Informe', 'TITLE'],
    ['Resumen', 'HEADING_1'],
    ['algo pasó', 'NORMAL_TEXT'],
    ['Detalle', 'HEADING_2'],
    ['el detalle', 'NORMAL_TEXT'],
    ['Cierre', 'HEADING_1'],
    ['fin', 'NORMAL_TEXT'],
  ])
  const e = leerEstructura(doc)
  // El TÍTULO del documento no es una sección: si lo fuera, «actualizá la primera sección» le
  // reescribiría la portada al informe.
  assert.deepEqual(e.secciones.map((s) => s.id), ['resumen', 'detalle', 'cierre'])
  const resumen = seccionPorId(e, 'resumen')
  assert.match(resumen.texto, /algo pasó/)
  assert.match(resumen.texto, /el detalle/, 'la sección de nivel 1 se lleva puesto su subtítulo')
  assert.equal(seccionPorId(e, 'cierre').texto.includes('el detalle'), false)
  assert.equal(seccionPorId(e, 'no_existe'), null)
  assert.match(textoDelCuerpo(doc), /^Informe\nResumen\n/)
})

test('vaciar una sección borra su contenido y NO su título', () => {
  const e = leerEstructura(cuerpo([['A', 'HEADING_1'], ['uno', 'NORMAL_TEXT'], ['B', 'HEADING_1']]))
  const s = seccionPorId(e, 'a')
  const [req] = requestsDeVaciadoDeSeccion(s)
  assert.equal(req.deleteContentRange.range.startIndex, s.contenido_inicio)
  assert.ok(req.deleteContentRange.range.startIndex > s.inicio, 'el título queda')
  assert.deepEqual(requestsDeVaciadoDeSeccion({ contenido_inicio: 5, fin: 5 }), [], 'una sección vacía no genera un borrado')
})

test('el texto plano de los bloques es lo que después se busca en la relectura', () => {
  const bloques = [
    { tipo: 'parrafo', texto: 'hola' },
    { tipo: 'lista', items: ['a'] },
    { tipo: 'datos', pares: [{ clave: 'Cliente', valor: 'X' }] },
    { tipo: 'tabla', columnas: ['C'], filas: [['1']] },
  ]
  assert.deepEqual(textoPlanoDeBloques(bloques), ['hola', 'a', 'Cliente: X', 'C', '1'])
  const plan = construirBloques(bloques)
  assert.equal(plan.encabezados.length, 0, 'los bloques sueltos no traen títulos: el título ya está en el documento')
  assert.equal(plan.negritas.length, 1, 'la clave de un par va en negrita')
})
