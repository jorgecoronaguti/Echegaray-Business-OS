// LA GRILLA DEL CLIENTE, Y LAS TRES FILAS QUE SE PERDÍAN EN SILENCIO.
//
// Las entradas de estas pruebas NO son inventadas: son las filas literales de
// «ARSJ Planilla de computo - Filtro Sanitario ESTRUCTURAS METALICAS - FINAL FINAL.xlsx» y de
// «PEDIDO DE COTIZACION.xlsx», bajadas de Drive el 30/08/2026 y leídas con `leerLibro()`. Si mañana
// alguien cambia la forma de esa lectura, estas pruebas se ponen rojas antes que el informe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computosDePlanilla, computoDeItem, porQueNoEsComputo, itemsPerdidosEnRubros, itemsRepetidos,
  issuesDePlanilla, pareceItem, idDeItem, plataDelHueco,
} from './planilla-cliente.mjs'

/** Un ítem tal como sale de `leerPlanillaSemantica`. */
const it = (x) => ({ hoja: 'Planilla de cotización', fila: 10, item: '1.1', descripcion: 'algo', unidad: 'kg', cantidad: 1, material: null, manoDeObra: null, precioUnitario: null, importe: null, errores: [], ambiguos: [], sinCantidad: null, sinPrecio: null, rubro: null, ...x })

/** La lectura REAL de la planilla del Filtro Sanitario, recortada a lo que estas pruebas usan. */
const FILTRO = {
  ok: true,
  hoja: 'Planilla de cotización',
  items: [
    it({ fila: 10, item: '1.1', unidad: 'kg', cantidad: 250.79999999999998, importe: 1095648, descripcion: 'Fabricación y montaje de columnas C1 de perfil sección 100x100x2,50mm. Materiales a cargo de ARCOR' }),
    it({ fila: 11, item: '1.2', unidad: 'Un', cantidad: 15, importe: 64926.52892072701, descripcion: 'Fabricación y provisión de placas de acero e: 1/4" de sección 15x20cm. Materiales a cargo de ARCOR' }),
    it({ fila: 18, item: '1.9', unidad: 'ml', cantidad: 106.3, importe: 654968, descripcion: 'Provision y colocacion de junta compriband para sellado de crestas de chapa' }),
    it({ fila: 23, item: '5.3', unidad: 'Un', cantidad: 1, importe: 222720, descripcion: 'Montaje de puerta de rebatir P1 de marco y hoja de aluminio línea Módena. Medidas 1,00x2,05m' }),
  ],
  rubros: [
    { hoja: 'Planilla de cotización', fila: 9, item: '1', titulo: 'ESTRUCTURAS METALICAS', total: 10825697.420577016 },
    // ═══ LA FILA 19 ═══ El ítem 1.10 quedó guardado como el número 1.1 y no tiene ni unidad ni
    // cantidad, así que el lector —que distingue rubro de ítem POR LA UNIDAD— lo puso acá.
    { hoja: 'Planilla de cotización', fila: 19, item: '1.1', titulo: 'Provision y montaje de zocalo sanitario de PVC en todo el contorno de la obra, asegurar estanquedidad', total: null },
    { hoja: 'Planilla de cotización', fila: 20, item: '5', titulo: 'CARPINTERIAS', total: 1735360 },
  ],
  cierre: [], notas: [],
}

test('EL ÍTEM 1.10 QUE EL LECTOR CUENTA COMO RUBRO no desaparece: sale como hueco con su fila', () => {
  const r = computosDePlanilla(FILTRO, { documento: 'FINAL FINAL.xlsx' })
  const perdido = r.huecos.find((h) => h.tipo === 'ITEM_LEIDO_COMO_RUBRO')
  assert.ok(perdido, 'el zócalo sanitario de la fila 19 tiene que aparecer como hueco')
  assert.equal(perdido.fila, 19)
  assert.match(perdido.descripcion, /zocalo sanitario/)
  // Y NO se convierte en cómputo: no tiene con qué cotizarse.
  assert.equal(r.computos.some((c) => c.evidencia.fila === 19), false)
  // Los dos rubros de verdad no se tocan.
  assert.equal(itemsPerdidosEnRubros(FILTRO.rubros).length, 1)
})

test('LA ETIQUETA 1.1 REPETIDA es un CONFLICTO, no un detalle de formato', () => {
  const r = computosDePlanilla(FILTRO, { documento: 'FINAL FINAL.xlsx' })
  const c = r.conflictos.find((x) => x.item === '1.1')
  assert.ok(c, 'la fila 10 y la fila 19 comparten la etiqueta 1.1')
  assert.deepEqual(c.filas, [10, 19])
  const bloq = issuesDePlanilla(r).filter((i) => i.severity === 'BLOQUEANTE')
  assert.equal(bloq.length, 1)
  assert.equal(bloq[0].type, 'CONFLICTO')
  // Un conflicto de etiqueta no lo cierra un botón: lo cierra quien tenga el archivo.
  assert.equal(bloq[0].recommended_action, null)
})

test('EL CONTROL PUEDE DECIR QUE NO: una planilla sin etiquetas repetidas no inventa el conflicto', () => {
  const limpia = { ...FILTRO, rubros: FILTRO.rubros.map((x) => (x.fila === 19 ? { ...x, item: '1.10' } : x)) }
  const r = computosDePlanilla(limpia)
  assert.equal(r.conflictos.length, 0)
  // Pero el ítem SIGUE perdido: arreglar la etiqueta no le devuelve la unidad ni la cantidad.
  assert.equal(r.huecos.filter((h) => h.tipo === 'ITEM_LEIDO_COMO_RUBRO').length, 1)
})

test('UNA FILA SIN UNIDAD O SIN CANTIDAD NO ES UN CÓMPUTO — y el motivo dice cuál de las dos falta', () => {
  assert.equal(porQueNoEsComputo(it({ unidad: 'kg', cantidad: 3 })), null)
  assert.match(porQueNoEsComputo(it({ unidad: null, cantidad: 3 })), /no trae unidad/)
  assert.match(porQueNoEsComputo(it({ unidad: 'kg', cantidad: null })), /no trae cantidad/)
  assert.match(porQueNoEsComputo(it({ unidad: null, cantidad: null })), /ni unidad ni cantidad/)

  const conFallas = { ...FILTRO, items: [...FILTRO.items, it({ fila: 40, item: '9.1', unidad: null, cantidad: null, descripcion: 'ítem sin nada' })] }
  const r = computosDePlanilla(conFallas)
  assert.equal(r.computos.length, 4, 'la fila rota no entra al cómputo')
  assert.equal(r.huecos.filter((h) => h.tipo === 'ITEM_SIN_COMPUTO').length, 1)
})

test('LA FILA SIN NÚMERO DE ÍTEM se computa igual, pero queda declarada como no citable', () => {
  // Es la demolición de muro de «PEDIDO DE COTIZACION.xlsx», fila 17: 6 m² y sin código.
  const conSinNumero = { ...FILTRO, items: [...FILTRO.items, it({ fila: 17, item: null, unidad: 'm2', cantidad: 6, importe: 1474631.2, descripcion: 'Demolicion de muro de mamposteria para nuevo ingreso a filtro sanitario' })] }
  const r = computosDePlanilla(conSinNumero)
  assert.equal(r.computos.length, 5, 'tiene cantidad y unidad: se computa')
  const h = r.huecos.find((x) => x.tipo === 'ITEM_SIN_ETIQUETA')
  assert.ok(h)
  assert.equal(h.fila, 17)
  // Es BAJA, no ALTA: la partida se cotiza, lo que falta es la etiqueta para citarla.
  const i = issuesDePlanilla(r).find((x) => x.entity.includes('s/n'))
  assert.equal(i.severity, 'BAJA')
})

test('EL PRECIO QUE TRAE LA PLANILLA NO ENTRA AL CÓMPUTO: viaja aparte y no puede confundirse con costo', () => {
  const c = computoDeItem(it({ material: 400, manoDeObra: 3968.6, precioUnitario: 4368.6, importe: 1095648 }))
  assert.equal(c.cantidad.valor, 1)
  assert.equal(c.cantidad.fuente, 'DATO_REAL')
  assert.equal(c.precioEnLaPlanilla.importe, 1095648)
  // Nada del precio se filtra a los campos que el selector y el costeo miran.
  assert.equal(c.material, null)
  assert.equal(c.especificacion, null)
  assert.equal('subtotal' in c, false)
  assert.equal('precio' in c, false)
})

test('LA DESCRIPCIÓN VIAJA ENTERA: el selector puntúa la sección técnica que vive al final del párrafo', () => {
  const largo = 'Fabricacion y montaje de correas K2 de perfil sección C100x50x20x2,50mm. A montarse en cerramiento superior de filtro. Longitud total aproximada: 37,00m'
  const c = computoDeItem(it({ descripcion: largo }))
  assert.equal(c.nombre, largo)
  assert.equal(c.evidencia.textoLiteral, largo)
})

test('LA CITA ES EL PRODUCTO: el id lleva hoja y fila, y dos filas distintas nunca colisionan', () => {
  assert.equal(idDeItem({ item: '1.1', hoja: 'Planilla de cotización', fila: 10 }), 'ARSJ-1.1-Planilla_de_cotización-f10')
  const r = computosDePlanilla(FILTRO)
  assert.equal(new Set(r.computos.map((c) => c.id)).size, r.computos.length)
  assert.ok(r.computos.every((c) => c.evidencia.fila && c.evidencia.hoja))
})

test('UNA PLANILLA QUE NO SE PUDO LEER devuelve la misma forma, con el motivo y sin cómputos', () => {
  const r = computosDePlanilla({ ok: false, porQue: 'ninguna pestaña tiene encabezado de cotización' })
  assert.equal(r.ok, false)
  assert.deepEqual(r.computos, [])
  assert.match(r.porQue, /encabezado/)
  assert.equal(r.resumen.items, 0)
})

test('LA PLATA DE UN HUECO SIN IMPORTE ES null, NUNCA 0 — un hueco sin medir no va al fondo de la cola', () => {
  assert.equal(plataDelHueco({ importe: 654968 }), 654968)
  assert.equal(plataDelHueco({ importe: 0 }), null)
  assert.equal(plataDelHueco({ importe: null }), null)
  assert.equal(plataDelHueco({}), null)
  const i = issuesDePlanilla(computosDePlanilla(FILTRO)).find((x) => x.entity.includes('f19'))
  assert.equal(i.impact, null, 'la fila 19 no trae importe: el impacto es desconocido, no cero')
})

test('pareceItem distingue el rubro «1» del ítem «1.4», que es de lo que depende todo lo anterior', () => {
  assert.equal(pareceItem('1'), false)
  assert.equal(pareceItem('5'), false)
  assert.equal(pareceItem('1.1'), true)
  assert.equal(pareceItem('1,10'), true)
  assert.equal(pareceItem(null), false)
  assert.equal(pareceItem('ESTRUCTURAS METALICAS'), false)
})

test('itemsRepetidos cuenta filas, no descripciones: dos filas con el mismo texto y distinta etiqueta no chocan', () => {
  const rep = itemsRepetidos([{ item: '2.1', fila: 3, descripcion: 'x' }, { item: '2.2', fila: 4, descripcion: 'x' }])
  assert.deepEqual(rep, [])
  const rep2 = itemsRepetidos([{ item: '2.1', fila: 3, descripcion: 'a' }, { item: '2.1', fila: 9, descripcion: 'b' }])
  assert.equal(rep2.length, 1)
  assert.deepEqual(rep2[0].filas, [3, 9])
})
