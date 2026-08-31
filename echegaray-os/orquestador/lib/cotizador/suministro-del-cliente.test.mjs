// EL MATERIAL QUE EL CLIENTE YA COMPRÓ Y LA PARTIDA VUELVE A COMPRAR.
//
// Los textos de estas pruebas son literales de las planillas de ARCOR bajadas de Drive el
// 30/08/2026, y las composiciones son las filas reales de `analisis_linea` de T1064 y T1028. La
// prueba que importa no es la que confirma el choque: es la que confirma que este control PUEDE
// decir que no —«miré las 8 líneas de material y ninguna es pintura»— porque un control que sólo
// sabe dar rojo se apaga a la semana, igual que uno que sólo sabe dar verde.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  suministrosDeclarados, quienProvee, lineasAlcanzadas, plataDeLineas,
  choqueDeSuministro, issueDeSuministro, barrerSuministros, normal,
} from './suministro-del-cliente.mjs'

const mat = (codigo, nombre, cantidad, desperdicio = 0) => ({ recursoCodigo: codigo, nombre, tipo: 'material', cantidad, desperdicio })
const mo = (codigo, nombre, cantidad) => ({ recursoCodigo: codigo, nombre, tipo: 'mano_obra', cantidad })

// T1064 · PUERTA 1,00x2,05 c/BA — composición vigente, tal cual está en la base.
const T1064 = [
  mo('MO-OFE', 'OFICIAL ESPECIALIZADO', 4.5), mo('MO-AY', 'AYUDANTE', 2.5),
  mat('M-PUE', 'PUERTA 1,00x2,05', 1),
  mat('M-BAR', 'BARRAL ANTIPÁNICO SIMPLE CON CERRADURA', 1),
]
// T1028 · CIELORRASO SUSPENDIDO AL YESO (DURLOCK) — ocho materiales y ninguno es pintura.
const T1028 = [
  mo('MO-OFE', 'OFICIAL ESPECIALIZADO', 2), mo('MO-AY', 'AYUDANTE', 1.5),
  mat('M-SOL', 'SOLERA 0,35 X 2,6', 0.577), mat('M-MON', 'MONTANTE 0,34 X 2,6', 1.154),
  mat('M-FIJ', 'FIJACIONES COMPLETAS 8 X 1000 C/T', 0.04), mat('M-TT1', 'TT1 AGUJA 8 X 1/2 X 1000', 15),
  mat('M-PLA', 'PLACA DE YESO 12,5 X 2,4 X 1,2', 0.38), mat('M-TT2', 'TT2 AGUJA 6 X 1 X 1000', 12),
  mat('M-CIN', 'CINTA DE PAPEL X 75 M', 0.08), mat('M-MAS', 'MASILLA X 7KG', 0.3),
]

const TEXTO_1_1 = 'Fabricación y montaje de columnas C1 de perfil sección 100x100x2,50mm. Prever soldaduras en taller. Altura aproximada: 2,90m. Materiales a cargo de ARCOR'
const TEXTO_1_8 = 'Provisión y colocación de cielorraso suspendido junta tomada con placas de Yeso e: 9mm. Incluye sistema completo. La pintura queda a cargo de ARCOR'
const TEXTO_5_1 = 'Montaje de paño fijo V1 de aluminio línea Módena. Medidas aproximadas 1,70x1,10m. Vidrio laminado 3+3. Paño a cargo de ARCOR'
const TEXTO_PERMISOS = 'Queda a cargo del contratista la gestión de permisos municipales y de ingreso a planta'

test('LA FRASE SE LEE CON SU SUJETO: «Materiales» es genérico, «Paño» y «pintura» no lo son', () => {
  const a = suministrosDeclarados(TEXTO_1_1, { cliente: 'ARCOR' })
  assert.equal(a.length, 1)
  assert.equal(a[0].sujeto, 'materiales')
  assert.equal(a[0].generico, true)

  // `pano` y no `paño`: la ñ se descompone como el resto de los diacríticos, igual que en
  // `palabras()`. Tiene que ser así o «Paño» nunca emparejaría con «PANO FIJO» del catálogo.
  const b = suministrosDeclarados(TEXTO_5_1, { cliente: 'ARCOR' })
  assert.equal(b[0].sujeto, 'pano')
  assert.equal(b[0].generico, false)

  const c = suministrosDeclarados(TEXTO_1_8, { cliente: 'ARCOR' })
  assert.equal(c[0].sujeto, 'pintura')
  assert.equal(c[0].generico, false)
})

test('«A CARGO DEL CONTRATISTA» ES LO CONTRARIO Y NO DISPARA NADA — son 6 apariciones en el corpus', () => {
  assert.deepEqual(suministrosDeclarados(TEXTO_PERMISOS, { cliente: 'ARCOR' }), [])
  assert.equal(quienProvee('el contratista', { cliente: 'ARCOR' }), 'NOSOTROS')
  assert.equal(quienProvee('ARCOR', { cliente: 'ARCOR' }), 'CLIENTE')
  assert.equal(quienProvee('el comitente', {}), 'CLIENTE')
  assert.equal(quienProvee('MAHPI', { cliente: 'ARCOR' }), 'OTRO')
})

test('EL CHOQUE REAL: el ítem 5.3 cierra contra T1064, que COMPRA la puerta que ARCOR ya compró', () => {
  const r = choqueDeSuministro({
    texto: 'Montaje de puerta de rebatir P1 de marco y hoja de aluminio línea Módena. Medidas 1,00x2,05m. Puerta a cargo de ARCOR',
    tarea: { codigo: 'T1064' }, composicion: T1064, cliente: 'ARCOR',
    costoPorRecurso: { 'M-PUE': 300000, 'M-BAR': 90000 }, cantidad: 1,
  })
  assert.equal(r.hayChoque, true)
  assert.deepEqual(r.lineas.map((l) => l.recursoCodigo), ['M-PUE'])
  assert.equal(r.plataUnitaria, 300000)
  assert.equal(r.plataEnRiesgo, 300000)
  assert.match(r.porQue, /paga dos veces/)
  const i = issueDeSuministro(r, { elemento: 'ARSJ-5.3' })
  assert.equal(i.severity, 'BLOQUEANTE')
  assert.equal(i.impact, 300000)
  assert.equal(i.recommended_action, null, 'quién compra el caño lo decide el contrato, no un botón')
})

test('EL SUJETO GENÉRICO ALCANZA TODA LA COMPOSICIÓN, y la plata escala con la cantidad', () => {
  const r = choqueDeSuministro({
    texto: TEXTO_1_1, tarea: { codigo: 'T9999' },
    composicion: [mo('MO-OF', 'OFICIAL', 1), mat('M-CAN', 'CAÑO ESTRUCTURAL 100x100x2,5', 2, 0.1), mat('M-ELE', 'ELECTRODO 3,25mm', 0.5)],
    cliente: 'ARCOR', costoPorRecurso: { 'M-CAN': 1000, 'M-ELE': 200 }, cantidad: 250.8,
  })
  assert.equal(r.hayChoque, true)
  assert.equal(r.generico, true)
  assert.equal(r.lineas.length, 2, 'los dos materiales, no la mano de obra')
  assert.equal(r.plataUnitaria, 2 * 1000 * 1.1 + 0.5 * 200)
  assert.equal(Math.round(r.plataEnRiesgo), Math.round(2300 * 250.8))
})

test('EL CONTROL PUEDE DECIR QUE NO: «la pintura a cargo de ARCOR» no bloquea a T1028, que no tiene pintura', () => {
  const r = choqueDeSuministro({ texto: TEXTO_1_8, tarea: { codigo: 'T1028' }, composicion: T1028, cliente: 'ARCOR', cantidad: 35 })
  assert.equal(r.hayChoque, false)
  assert.equal(r.declarados.length, 1, 'la frase SÍ se detectó')
  assert.match(r.porQue, /ninguna de las 8 línea\(s\) de material/)
  assert.match(r.porQue, /se miró y no hay choque/)
  assert.equal(issueDeSuministro(r), null)
})

test('SIN LA FRASE NO HAY CHOQUE, y el motivo lo dice — no es lo mismo que no haber mirado', () => {
  const r = choqueDeSuministro({ texto: 'Provision y colocacion de junta compriband para sellado de crestas de chapa', tarea: { codigo: 'T1' }, composicion: T1064, cliente: 'ARCOR' })
  assert.equal(r.hayChoque, false)
  assert.deepEqual(r.declarados, [])
  assert.match(r.porQue, /no declara ningún suministro/)
})

test('UNA PARTIDA SIN MATERIALES NO PUEDE COTIZAR DOS VECES NADA, aunque la frase esté', () => {
  const r = choqueDeSuministro({ texto: TEXTO_1_1, tarea: { codigo: 'T-MO' }, composicion: [mo('MO-OF', 'OFICIAL', 1)], cliente: 'ARCOR' })
  assert.equal(r.hayChoque, false)
  assert.match(r.porQue, /no tiene ninguna línea de material/)
})

test('EL RIESGO SIN PRECIO ES null, NUNCA 0', () => {
  const r = choqueDeSuministro({ texto: TEXTO_1_1, tarea: { codigo: 'T1064' }, composicion: T1064, cliente: 'ARCOR', costoPorRecurso: {}, cantidad: 1 })
  assert.equal(r.hayChoque, true)
  assert.equal(r.plataUnitaria, null)
  assert.equal(r.plataEnRiesgo, null)
  assert.equal(plataDeLineas([mat('X', 'x', 1)], {}), null)
  assert.equal(issueDeSuministro(r).impact, null)
})

test('EL BARRIDO SÓLO REVISA LAS QUE CERRARON: una AMBIGUO no se cuenta dos veces', () => {
  const composiciones = new Map([['id-1064', T1064], ['id-1028', T1028]])
  const mapeo = (estado, tareaId, codigo, texto, id) => ({
    estado, tarea: tareaId ? { id: tareaId, codigo } : null,
    computo: { id, nombre: texto, cantidad: { valor: 1 } },
  })
  const r = barrerSuministros([
    mapeo('MAPEADA', 'id-1064', 'T1064', 'Montaje de puerta P1. Puerta a cargo de ARCOR', 'E1'),
    mapeo('MAPEADA', 'id-1028', 'T1028', TEXTO_1_8, 'E2'),
    mapeo('AMBIGUO', null, null, TEXTO_1_1, 'E3'),
    mapeo('PARTIDA_CANDIDATA', null, null, TEXTO_1_1, 'E4'),
  ], { composiciones, cliente: 'ARCOR', costoPorRecurso: { 'M-PUE': 300000 } })
  assert.equal(r.revisados.length, 2, 'sólo las dos MAPEADAS')
  assert.equal(r.conChoque.length, 1)
  assert.equal(r.conChoque[0].elemento, 'E1')
  assert.equal(r.plataEnRiesgo, 300000)
  assert.match(r.porQue, /2 partida\(s\) cerrada\(s\) revisada\(s\) · 1 con material/)
})

test('EL BARRIDO SIN CHOQUES DEVUELVE plataEnRiesgo null, no 0', () => {
  const r = barrerSuministros([{ estado: 'MAPEADA', tarea: { id: 'id-1028', codigo: 'T1028' }, computo: { id: 'E2', nombre: TEXTO_1_8, cantidad: { valor: 35 } } }],
    { composiciones: new Map([['id-1028', T1028]]), cliente: 'ARCOR' })
  assert.equal(r.conChoque.length, 0)
  assert.equal(r.plataEnRiesgo, null)
})

test('lineasAlcanzadas empareja por raíz, no por igualdad exacta: «paños» encuentra «PAÑO FIJO»', () => {
  const comp = [mat('A', 'PAÑO FIJO DE ALUMINIO', 1), mat('B', 'TORNILLO AUTOPERFORANTE', 4)]
  assert.deepEqual(lineasAlcanzadas('paños', comp).map((l) => l.recursoCodigo), ['A'])
  assert.deepEqual(lineasAlcanzadas('', comp), [], 'un sujeto vacío no alcanza nada')
  assert.equal(lineasAlcanzadas('lo que sea', comp, { generico: true }).length, 2)
})

test('normal saca tildes y no rompe la comparación de nombres de cliente', () => {
  assert.equal(normal('  ARCOR   San   Juan '), 'arcor san juan')
  assert.equal(normal('Añejo'), 'anejo')
  assert.equal(normal(null), '')
})
