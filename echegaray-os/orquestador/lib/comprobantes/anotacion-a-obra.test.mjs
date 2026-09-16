// LO ESCRITO A MANO → LA OBRA. El contrato son las ocho anotaciones del fajo dc2d0273 (15/09/2026):
// si una sola deja de dar su código, el defecto que el dueño reportó volvió.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  anotacionAObra, anotacionDelComprobante, completarDesdeAnotacion, indiceDeAnotacion,
  nombreSinPrefijo, deLaLista, CONFIANZA, UMBRAL, UNIDAD,
} from './anotacion-a-obra.mjs'
import { CATALOGO, CASOS_15_09 } from './anotacion-a-obra.fixture.mjs'
import { MARCA_A_MANO } from './lectura.mjs'
import { validarValorDeObra } from '../obra-destino.mjs'

const codigoDe = (valor) => String(valor ?? '').split(' · ')[0]

test('los 8 del fajo dc2d0273: cada anotación llega a SU obra, con la confianza suficiente para escribirla', () => {
  for (const c of CASOS_15_09) {
    const r = anotacionAObra(c.anotacion, CATALOGO)
    assert.equal(codigoDe(r.valor), c.codigo, `«${c.anotacion}» → ${r.valor ?? 'nada'} (${r.porque})`)
    assert.ok(r.confianza >= UMBRAL, `«${c.anotacion}» resolvió con confianza ${r.confianza}`)
    assert.equal(r.unidad, c.unidad, `«${c.anotacion}»: Unidad`)
    if (c.detalle) assert.equal(r.detalle, c.detalle, `«${c.anotacion}»: Detalle`)
  }
})

test('lo que se propone escribir en la columna Obra ES una opción del desplegable', () => {
  // El valor no se compara contra una constante del test: se valida contra la MISMA función que
  // gobierna la cola de la app. Un rótulo que ella rechaza deja la celda en rojo en el Sheet.
  for (const c of CASOS_15_09) {
    const r = anotacionAObra(c.anotacion, CATALOGO)
    assert.equal(validarValorDeObra(r.valor, CATALOGO.obras, CATALOGO.clienteAlias), null, `«${r.valor}»`)
  }
})

test('la obra se resuelve con el código escrito a mano, aunque esté pegado o en minúscula', () => {
  for (const t of ['OB-0011', 'ob 0011 pisos', 'OB0011']) {
    const r = anotacionAObra(t, CATALOGO)
    assert.equal(codigoDe(r.valor), 'OB-0011', t)
    assert.equal(r.confianza, CONFIANZA.CODIGO)
  }
})

test('se tolera el error de lectura y la abreviatura, que es como escribe una mano sobre un papel', () => {
  // «Messino» por MESSINA (una letra), «FÁB.» por FÁBRICA (abreviatura), «Dilucion» sin tilde.
  assert.equal(codigoDe(anotacionAObra('Mesina playon dilucion', CATALOGO).valor), 'OB-0022')
  assert.equal(codigoDe(anotacionAObra('Estrella oficina y fab', CATALOGO).valor), 'OB-0006')
})

test('EMPATE = NADA: dos clientes en la misma anotación no eligen obra', () => {
  const r = anotacionAObra('Messina y San Francisco', CATALOGO)
  assert.equal(r.valor, null)
  assert.match(r.porque, /no elijo entre dos clientes/)
})

test('una palabra suelta que viven varias obras no alcanza', () => {
  // «pisos» está en SF - PISOS INDUSTRIALES y en ME - PISOS 120 M² Y RAMPA: sin el cliente, nada.
  const r = anotacionAObra('pisos', CATALOGO)
  assert.equal(r.valor, null)
  assert.ok(r.confianza < UMBRAL)
})

test('el cliente sin obra: se PROPONE «Sin obra – X» pero por debajo del umbral de escritura', () => {
  const r = anotacionAObra('Quattropani - Melisa García SAS c/c', CATALOGO)
  assert.equal(codigoDe(r.valor), 'OB-0008', 'con UNA sola obra viva no hay nada que decidir')
  const m = anotacionAObra('Messina', CATALOGO)
  assert.equal(m.valor, 'Sin obra – MESSINA')
  assert.ok(m.confianza < UMBRAL, 'no se escribe sola: decidir que no va a ninguna obra es de una persona')
  assert.match(m.porque, /no dice cuál/)
})

test('una obra CERRADA no recibe un gasto nuevo por parecido, y se dice', () => {
  // «estrella» es alias de OB-0003 (LE - OBRA GENERAL), cerrada. Antes del freno entraba con 0,95.
  const r = anotacionAObra('Estrella', CATALOGO)
  assert.equal(r.valor, 'Sin obra – LA ESTRELLA')
  assert.ok(r.confianza < UMBRAL)
  assert.match(r.porque, /OB-0003.*CERRADA/)
  // Con el código escrito a mano sí: ahí no hay parecido, hay una decisión.
  assert.ok(anotacionAObra('OB-0003', CATALOGO).confianza >= UMBRAL)
})

test('sin anotación, sin catálogo o sin nada reconocible: null con el motivo, nunca una obra', () => {
  assert.match(anotacionAObra(null, CATALOGO).porque, /no hay nada escrito a mano/)
  assert.match(anotacionAObra('Messina', null).porque, /sin catálogo/)
  assert.equal(anotacionAObra('remito 4471 firmado', CATALOGO).valor, null)
})

test('vehículos, patentes y taller van a ES-TAL; oficina y sueldos, a ES-ADM', () => {
  assert.equal(codigoDe(anotacionAObra('Hilux service', CATALOGO).valor), 'ES-TAL')
  assert.equal(anotacionAObra('EEA-885', CATALOGO).detalle, 'Vehiculos')
  assert.equal(codigoDe(anotacionAObra('almacen', CATALOGO).valor), 'ES-TAL')
  assert.equal(codigoDe(anotacionAObra('sueldos oficina', CATALOGO).valor), 'ES-ADM')
  assert.equal(anotacionAObra('Hilux service', CATALOGO).unidad, UNIDAD.ESTRUCTURA)
})

test('la obra le gana a la palabra de estructura: «OFICINA Y FÁB.» es una obra, no la administración', () => {
  assert.equal(codigoDe(anotacionAObra('Estrella Filtraciones OFICINA Y FÁB. · c/c', CATALOGO).valor), 'OB-0006')
  // Y la mezcla de las dos familias no elige: es una anotación que hay que leer con el papel delante.
  const mezcla = anotacionAObra('camioneta para la oficina', CATALOGO)
  assert.equal(mezcla.valor, null)
  assert.match(mezcla.porque, /a la vez/)
})

test('la Unidad sale del TIPO de la obra, no de una opinión: mantenimiento es «Mantenimiento»', () => {
  assert.equal(anotacionAObra('OB-0001', CATALOGO).unidad, UNIDAD.MANTENIMIENTO)
  assert.equal(anotacionAObra('OB-0011', CATALOGO).unidad, UNIDAD.OBRA)
})

test('la anotación del cargador se lee del concepto: ahí es donde viaja `· a mano: "…"`', () => {
  const c = { concepto: `Cemento x 20 ${MARCA_A_MANO} "SF Pisos Industriales"` }
  assert.equal(anotacionDelComprobante(c), 'SF Pisos Industriales')
  assert.equal(anotacionDelComprobante({ anotacion: 'QUATTROPANI' }), 'QUATTROPANI')
  assert.equal(anotacionDelComprobante({ concepto: 'Cemento x 20' }), null)
})

test('completarDesdeAnotacion escribe las CUATRO columnas y las marca, sin pisar lo que ya había', () => {
  const listas = { obras: ['LA ESTRELLA', 'San Francisco', 'Taller'], unidades: ['Civil', 'Estructura'] }
  const c = { concepto: `Hierro ${MARCA_A_MANO} "SF Pisos Industriales"` }
  const { aplicado } = completarDesdeAnotacion(c, CATALOGO, { listas })
  assert.deepEqual(aplicado, ['obraFila', 'obra', 'unidad', 'detalle'])
  assert.equal(c.obraFila, 'OB-0011 · SF - PISOS INDUSTRIALES')
  assert.equal(c.obra, 'San Francisco') // el rótulo EXACTO del desplegable, no el cliente canónico
  assert.equal(c.unidad, 'Civil')
  assert.equal(c.detalle, 'PISOS INDUSTRIALES')
  assert.equal(c.obraViaVia ?? c.obraVia, 'anotacion')
  // Lo que ya venía del papel no se toca.
  const d = { anotacion: 'SF Pisos Industriales', unidad: 'Estructura', detalle: 'Galpón 3' }
  completarDesdeAnotacion(d, CATALOGO, { listas })
  assert.equal(d.unidad, 'Estructura')
  assert.equal(d.detalle, 'Galpón 3')
})

test('la J y la I sólo se escriben con un valor que el desplegable tenga letra por letra', () => {
  const c = { anotacion: 'SF Pisos Industriales' }
  completarDesdeAnotacion(c, CATALOGO, { listas: { obras: ['ARCOR'], unidades: [] } })
  assert.equal(c.obraFila, 'OB-0011 · SF - PISOS INDUSTRIALES', 'la columna Obra no depende del desplegable de la J')
  assert.equal(c.obra, undefined)
  assert.equal(c.unidad, undefined)
  assert.equal(deLaLista('civil', ['Civil']), 'Civil')
  assert.equal(deLaLista('Civil', null), null)
})

test('el texto del chat es la SEGUNDA fuente: sólo cuando el papel no dijo nada', () => {
  const c = { concepto: `Arena ${MARCA_A_MANO} "QUATTROPANI"` }
  completarDesdeAnotacion(c, CATALOGO, { texto: 'SF Pisos Industriales' })
  assert.equal(codigoDe(c.obraFila), 'OB-0008', 'manda el papel')
  const d = { concepto: 'Arena' }
  completarDesdeAnotacion(d, CATALOGO, { texto: 'SF Pisos Industriales' })
  assert.equal(codigoDe(d.obraFila), 'OB-0011')
  // Sin nada escrito a mano, el motivo que se muestra es el del MENSAJE: es lo único que hubo.
  assert.match(completarDesdeAnotacion({ concepto: 'x' }, CATALOGO, { texto: 'lo de siempre' }).resultado.porque, /en el mensaje/)
})

test('el índice se puede armar una vez y reusar, y acepta los catálogos crudos del cargador', () => {
  const idx = indiceDeAnotacion(CATALOGO)
  assert.equal(idx.esIndice, true)
  assert.equal(codigoDe(anotacionAObra('QUATTROPANI', idx).valor), 'OB-0008')
  assert.equal(codigoDe(anotacionAObra('QUATTROPANI', { canonicas: CATALOGO.obras, clienteAlias: CATALOGO.clienteAlias, alias: CATALOGO.alias }).valor), 'OB-0008')
  assert.equal(nombreSinPrefijo('SF - PISOS INDUSTRIALES'), 'PISOS INDUSTRIALES')
})
