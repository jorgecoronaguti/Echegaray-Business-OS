import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatosEnFrase, completarPorCatalogo, resolverParametro } from './xsas-argumentos-catalogo.mjs'

const CATALOGOS = {
  obras: ['Quattropani', 'San Francisco', 'San Francisco II', 'Nave Industrial ARCOR'],
  proveedores: ['ALUMETAL S.A.', 'Hormigonera del Oeste'],
}

test('el nombre canónico se saca de la frase sin llamar a nadie', () => {
  const r = resolverParametro('analizá los planos de quattropani', 'proyecto', CATALOGOS)
  // Devuelve el nombre EXACTO del catálogo, no lo que escribió la persona: eso es lo que la base
  // espera, y es la ventaja que un modelo no tiene — no conoce el universo de respuestas válidas.
  assert.deepEqual(r, { valor: 'Quattropani' })
})

test('gana el nombre más largo cuando uno contiene al otro', () => {
  const r = resolverParametro('cómo viene San Francisco II', 'obra', CATALOGOS)
  // «San Francisco» también coincide. Quedarse con la corta contestaría sobre OTRA obra, con la
  // pantalla diciendo que todo salió bien.
  assert.deepEqual(r, { valor: 'San Francisco II' })
})

test('dos obras distintas en la frase NO se resuelven: se declara el empate', () => {
  const r = resolverParametro('comparame Quattropani contra ARCOR', 'obra', {
    obras: ['Quattropani', 'ARCOR'],
  })
  assert.ok(r.ambiguo)
  assert.deepEqual(r.ambiguo.sort(), ['ARCOR', 'Quattropani'])
  assert.equal(r.valor, undefined, 'eligió una de dos obras sin base para hacerlo')
})

test('un ambiguo sigue FALTANDO, y se dice cuáles eran', () => {
  const r = completarPorCatalogo({
    texto: 'comparame Quattropani contra ARCOR',
    falta: ['obra'],
    catalogos: { obras: ['Quattropani', 'ARCOR'] },
  })
  assert.deepEqual(r.falta, ['obra'])
  assert.equal(r.args.obra, undefined)
  // Se ofrecen las dos opciones en vez de un «no entendí».
  assert.deepEqual(r.ambiguos.obra.sort(), ['ARCOR', 'Quattropani'])
})

test('no resuelve por parecido: un nombre que no está en la frase no aparece', () => {
  // `identidad.mjs` ya midió que el parecido textual no vincula entidades en este OS. Un match por
  // similitud metería la obra equivocada con la misma cara de certeza que una correcta.
  assert.equal(resolverParametro('cómo viene Cuatropani', 'obra', CATALOGOS), null)
  assert.equal(resolverParametro('los planos de la obra nueva', 'obra', CATALOGOS), null)
})

test('un nombre de catálogo demasiado corto no matchea media frase', () => {
  // Un catálogo con «SA» o «II» encontraría coincidencias en cualquier oración del castellano.
  assert.deepEqual(candidatosEnFrase('la obra va bien', ['SA', 'II', 'va']), [])
})

test('un parámetro sin catálogo declarado no se toca', () => {
  assert.equal(resolverParametro('desde el 1 de agosto', 'desde', CATALOGOS), null)
  const r = completarPorCatalogo({ texto: 'x', falta: ['desde'], catalogos: CATALOGOS })
  assert.deepEqual(r.falta, ['desde'], 'el camino de siempre sigue intacto')
  assert.deepEqual(r.resueltos, [])
})

test('un catálogo vacío no rompe ni inventa', () => {
  assert.equal(resolverParametro('Quattropani', 'obra', { obras: [] }), null)
  assert.equal(resolverParametro('Quattropani', 'obra', {}), null)
})

test('los ya resueltos se informan, para poder medir cuánto se ahorró de modelo', () => {
  const r = completarPorCatalogo({
    texto: 'compras de Quattropani a ALUMETAL S.A.',
    falta: ['obra', 'proveedor', 'desde'],
    catalogos: CATALOGOS,
  })
  assert.deepEqual(r.resueltos.sort(), ['obra', 'proveedor'])
  assert.equal(r.args.obra, 'Quattropani')
  assert.equal(r.args.proveedor, 'ALUMETAL S.A.')
  assert.deepEqual(r.falta, ['desde'], 'sólo lo que la regla no pudo sube al modelo')
})

// ── Y LA INTEGRACIÓN: que la regla CORTE la llamada, no que la acompañe ──────────────────────────

import { completarArgumentos } from './xsas-argumentos.mjs'

const TOOL = {
  schema: {
    name: 'analizar_planos_y_cotizar',
    input_schema: { type: 'object', properties: { proyecto: { type: 'string', description: 'la obra' }, desde: { type: 'string' } } },
  },
}

test('si la regla llena todo, NO se llama al modelo', async () => {
  let llamadas = 0
  const ia = { pedirTextoONull: async () => { llamadas += 1; return '{}' } }
  const r = await completarArgumentos({
    ia, texto: 'analizá los planos de Quattropani', tool: TOOL,
    falta: ['proyecto'], catalogos: CATALOGOS,
  })
  assert.equal(r.args.proyecto, 'Quattropani')
  assert.deepEqual(r.falta, [])
  // ÉSTA es la aserción de la que depende el ahorro: no que el valor esté bien, sino que NO se
  // pagó una llamada para obtenerlo.
  assert.equal(llamadas, 0, 'se llamó al modelo para algo que la regla ya había resuelto')
  assert.deepEqual(r.porRegla, ['proyecto'])
})

test('lo que la regla no puede sube al modelo, y sólo eso', async () => {
  const pedidos = []
  const ia = { pedirTextoONull: async ({ mensajes }) => { pedidos.push(mensajes[0].content); return '{"desde":"2026-08-01"}' } }
  const r = await completarArgumentos({
    ia, texto: 'planos de Quattropani desde el 1 de agosto', tool: TOOL,
    falta: ['proyecto', 'desde'], catalogos: CATALOGOS,
  })
  assert.equal(r.args.proyecto, 'Quattropani', 'la obra la puso la regla')
  assert.equal(r.args.desde, '2026-08-01', 'la fecha la puso el modelo')
  assert.deepEqual(r.porRegla, ['proyecto'], 'el caller tiene que poder distinguir catálogo de modelo')
  assert.equal(pedidos.length, 1)
  // Se mira SÓLO la lista de parámetros pedidos: el prompt trae además un ejemplo fijo que dice
  // `{"proyecto":"Quattropani"}`, y buscar la palabra en todo el texto daba un rojo falso — el
  // test estaba mal escrito, el código hacía lo correcto.
  const listados = pedidos[0].split('PARÁMETROS que faltan:')[1].split('Devolvés')[0]
  assert.ok(listados.includes('"desde"'), 'el pedido menciona el parámetro que falta')
  assert.ok(!listados.includes('"proyecto"'), 'se le volvió a pedir al modelo algo ya resuelto')
})

test('sin catálogos el comportamiento es exactamente el de antes', async () => {
  let llamadas = 0
  const ia = { pedirTextoONull: async () => { llamadas += 1; return '{"proyecto":"Quattropani"}' } }
  const r = await completarArgumentos({ ia, texto: 'planos de Quattropani', tool: TOOL, falta: ['proyecto'] })
  assert.equal(llamadas, 1)
  assert.equal(r.args.proyecto, 'Quattropani')
})
