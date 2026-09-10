// LA REGLA QUE IMPUTA UN COBRO A UNA OBRA, CONTRA LOS TEXTOS REALES DE LA COLUMNA H.
//
// Todos los textos de este archivo están COPIADOS de `public.cobranzas` el 10/09/2026 —columna H
// (`orden_compra`) y columna I (`concepto`)—. No hay ni un caso inventado: un corpus de fantasía
// probaría que la expresión regular funciona contra sí misma.
//
// EL DEFECTO QUE ATRAPAN: hasta hoy las 24 filas de Messina se imputaban a la obra bolsa `messina`
// porque la única fuente era `obra_cliente`, que nombra al CLIENTE. Si alguien revierte la cadena
// —saca el paso de la OC, saca el del alias, o los invierte— los tests de abajo se ponen rojos con
// el nombre de la obra que dejó de recibir su cobro.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ocDeclarada, obrasNombradas, resolverObraDeCobranza } from './cobranza-obra.mjs'

// ── EL DICCIONARIO DE MESSINA, tal como lo arma la SQL para ese cliente ─────────────────────────
const OC_DE_MESSINA = new Map([
  ['2-279', 'messina-bsa'],
  ['2-1864', 'messina-bases-tanque-so2'],
  ['2-1923', 'messina-bases-tanque-so2'],
  ['2-1984', 'messina-bsa'],
  ['2-1985', 'messina-bsa'],
  ['2-2097', 'messina-pisos-120-rampa'],
  ['2-2162', 'limpieza-de-escombros'],
  ['2-2173', 'messina-playon-azufre'],
  ['2-2226', 'messina-pisos-120-rampa'],
  ['2-2256', 'messina-adicional-tercer-muro'],
  ['2-2266', 'messina-playon-dilucion-acido'],
])
const ALIAS_DE_MESSINA = [
  { alias: 'pilon', obraId: 'pilon' },
  { alias: 'playon azufre', obraId: 'messina-playon-azufre' },
  { alias: 'bases tanque so2', obraId: 'messina-bases-tanque-so2' },
  { alias: 'relevamiento topografico', obraId: 'relevamiento-topografico' },
  { alias: 'pisos 120m2', obraId: 'messina-pisos-120-rampa' },
  { alias: 'bsa planta', obraId: 'messina-bsa' },
]
const MESSINA = { obraPorOc: OC_DE_MESSINA, aliasesLibres: ALIAS_DE_MESSINA, bolsa: 'messina' }

test('la columna H declara su OC escrita de las cinco maneras que usa el Sheet', () => {
  // Pelada, como la escribe Messina.
  assert.equal(ocDeclarada('00002-00002097'), '2-2097')
  assert.equal(ocDeclarada('02-00002097'), '2-2097', 'el punto de venta con y sin ceros es la MISMA orden')
  // Pelada con la condición de pago pegada atrás.
  assert.equal(ocDeclarada('00002-00002226 · cta. cte. 15 días'), '2-2226')
  assert.equal(ocDeclarada('00002-00002256 · cta. cte. 30 días'), '2-2256')
  // Con rótulo, como la escribe ARCOR.
  assert.equal(ocDeclarada('OC 53239034'), '53239034')
  assert.equal(ocDeclarada('OC 53241303 - 50%'), '53241303', 'el «- 50%» no es otra orden')
  assert.equal(ocDeclarada('OC 53239034 - FIN'), '53239034')
  // Pelada con el ítem de la orden pegado atrás.
  assert.equal(ocDeclarada('53312775 6A'), '53312775', 'el ítem «6A» no forma parte del número')
  // Con rótulo DENTRO de una frase larga llena de otros números.
  assert.equal(
    ocDeclarada('Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. OC 00002-00002173 '
      + '(11/08/2026) — 50% anticipado / 50% contra entrega'),
    '2-2173', 'los $65.000.000 y la fecha no son órdenes de compra')
  assert.equal(
    ocDeclarada('Resto 50% s/ total 65.000.000 — certificación quincenal 1/2 · OC 00002-00002173'),
    '2-2173')
})

test('un texto sin OC no inventa una: el número suelto sólo cuenta al principio', () => {
  // EL CASO QUE OBLIGA A LA REGLA: tres números y ninguno es una orden.
  assert.equal(ocDeclarada('Resto 50% s/ total 37.500.000 — certificación quincenal 1/2'), null)
  assert.equal(ocDeclarada('Anticipo inicio de obra 50% Negro $37.500.000 Playon de Azufre. Cargar OC'), null,
    '«Cargar OC» es un pendiente, no una orden')
  assert.equal(ocDeclarada('RECLAMAR OC!'), null, 'el rótulo sin número no declara nada')
  assert.equal(ocDeclarada('Anticipo 50% s/ contrato $40.000.000 — 1ª de 2 cuotas quincenales'), null)
  assert.equal(ocDeclarada('Anticipo inicio obra Pisos Industriales - Total Obra: $47.590.272'), null)
  assert.equal(ocDeclarada('Certificado 2'), null, 'un certificado no es una orden de compra')
  // EL AÑO NO ES UNA ORDEN. Es el texto REAL de la fila 64 antes de que llegara la OC —la fila 65
  // sigue hoy con «Cargar OC»—: sin el ancla al principio, «2026» de la fecha entraría como número
  // de orden y el cobro se imputaría a la obra de una orden que no existe.
  assert.equal(
    ocDeclarada('Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. (11/08/2026) '
      + '— 50% anticipado / 50% contra entrega'),
    null, 'el año de la fecha no es un número de orden de compra')
  assert.equal(ocDeclarada(null), null)
  assert.equal(ocDeclarada(''), null)
})

test('dos órdenes citadas con rótulo no eligen ninguna', () => {
  assert.equal(ocDeclarada('OC 53239034 y OC 53241303'), null)
  assert.equal(ocDeclarada('OC 53239034 · OC 02-00053239034'), null)
  assert.equal(ocDeclarada('OC 53239034 repetida en OC 53239034'), '53239034', 'la misma dos veces es UNA')
})

test('el alias nombra la obra dentro del texto, y sólo con borde de palabra', () => {
  assert.deepEqual(obrasNombradas('BASES TANQUE SO2 - Cancelación', ALIAS_DE_MESSINA), ['messina-bases-tanque-so2'])
  assert.deepEqual(obrasNombradas('PILON - Pago parcial (07/05)', ALIAS_DE_MESSINA), ['pilon'])
  assert.deepEqual(obrasNombradas('Playon Azufre - Negro - Certificación 1/2', ALIAS_DE_MESSINA),
    ['messina-playon-azufre'])
  // «Playon de Azufre» con artículo: `normObra` lo tira de los dos lados y el alias sigue entrando.
  assert.deepEqual(obrasNombradas('Anticipo inicio de obra 50% Negro $37.500.000 Playon de Azufre. Cargar OC',
    ALIAS_DE_MESSINA), ['messina-playon-azufre'])
  assert.deepEqual(obrasNombradas('Relevamiento topográfico', ALIAS_DE_MESSINA), ['relevamiento-topografico'])
  // NO matchea dentro de otra palabra: sin borde, «pilon» entraría en «pilonaje» o «apilonado».
  assert.deepEqual(obrasNombradas('Trabajos de apilonado de escombros', ALIAS_DE_MESSINA), [])
  assert.deepEqual(obrasNombradas('Certificación de avance', ALIAS_DE_MESSINA), [])
})

test('la fila 94 prueba el ORDEN: el papel le gana al texto', () => {
  // «Adicional tercer muro … Playon de Azufre» NOMBRA el Playón y PERTENECE al Adicional Tercer
  // Muro según su OC. Si el alias ganara, $12.100.000 se imputarían a la obra equivocada.
  const fila = {
    orden_compra: '00002-00002256 · cta. cte. 30 días',
    concepto: 'Adicional tercer muro (armado 20 m) Playon de Azufre — adicional al contrato',
    obra_cliente: 'MESSINA',
  }
  assert.deepEqual(obrasNombradas(fila.concepto, ALIAS_DE_MESSINA), ['messina-playon-azufre'],
    'el texto SÍ nombra el Playón: por eso el orden importa')
  const r = resolverObraDeCobranza(fila, MESSINA)
  assert.equal(r.obraId, 'messina-adicional-tercer-muro')
  assert.equal(r.imputacion, 'oc')
})

test('las 24 filas reales de Messina caen donde el papel y el texto dicen', () => {
  // sheet_id, H, concepto, obra esperada, imputación esperada — el Sheet al 10/09/2026.
  const FILAS = [
    ['27', '00002-00001864', 'BASES TANQUE SO2 - Anticipo', 'messina-bases-tanque-so2', 'oc'],
    ['28', null, 'PILON - Pago parcial (07/05)', 'pilon', 'alias'],
    ['30', null, 'PILON', 'pilon', 'alias'],
    ['34', '00002-00001864', 'BASES TANQUE SO2', 'messina-bases-tanque-so2', 'oc'],
    ['38', '00002-00001923', 'ADICIONAL - BASE DE TANQUE SO2', 'messina-bases-tanque-so2', 'oc'],
    ['41', '00002-00000279', 'PLANTA DE BSA - 26M3 A FAVOR H-17 - 50%', 'messina-bsa', 'oc'],
    ['42', '00002-00001984', 'ACTUALIZACION DE PRECIOS OC 02-00000279', 'messina-bsa', 'oc'],
    ['43', '00002-00001985', 'PLANTA DE BSA - ADICIONAL', 'messina-bsa', 'oc'],
    ['51', '02-00002097', 'Pisos 120m2 -  Anticipo 50%', 'messina-pisos-120-rampa', 'oc'],
    ['52', '02-00002097', 'Pisos 120m2 - Restante 50%', 'messina-pisos-120-rampa', 'oc'],
    ['61', '02-00002135', 'Relevamiento topográfico', 'relevamiento-topografico', 'alias'],
    ['64', 'Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. OC 00002-00002173 '
      + '(11/08/2026) — 50% anticipado / 50% contra entrega', 'Playon Azufre', 'messina-playon-azufre', 'oc'],
    ['65', 'Anticipo inicio de obra 50% Negro $37.500.000 Playon de Azufre. Cargar OC',
      'Playon Azufre', 'messina-playon-azufre', 'alias'],
    ['70', 'Resto 50% s/ total 65.000.000 — certificación quincenal 1/2 · OC 00002-00002173',
      'Playon Azufre - Blanco - Certificación 1/2', 'messina-playon-azufre', 'oc'],
    ['71', 'Resto 50% s/ total 65.000.000 — certificación quincenal 2/2 · OC 00002-00002173',
      'Playon Azufre - Blanco - Certificación 2/2', 'messina-playon-azufre', 'oc'],
    ['72', 'Resto 50% s/ total 37.500.000 — certificación quincenal 1/2',
      'Playon Azufre - Negro - Certificación 1/2', 'messina-playon-azufre', 'alias'],
    ['73', 'Resto 50% s/ total 37.500.000 — certificación quincenal 2/2',
      'Playon Azufre - Negro - Certificación 2/2', 'messina-playon-azufre', 'alias'],
    ['83', '02-00002162', 'Limpieza de Escombros - Embolsado', 'limpieza-de-escombros', 'oc'],
    ['89', '00002-00000279', 'PLANTA DE BSA - 50%', 'messina-bsa', 'oc'],
    ['92', '00002-00002226 · cta. cte. 15 días', 'Rampa para Piso 120 m2 — inicio 07/09, 1 semana',
      'messina-pisos-120-rampa', 'oc'],
    ['94', '00002-00002256 · cta. cte. 30 días',
      'Adicional tercer muro (armado 20 m) Playon de Azufre — adicional al contrato',
      'messina-adicional-tercer-muro', 'oc'],
    ['95', '00002-00002266 · cta. cte. 30 días', 'Playón para Dilución de Ácido — Anticipo financiero 50%',
      'messina-playon-dilucion-acido', 'oc'],
    ['96', '00002-00002266 · cta. cte. 30 días', 'Playón para Dilución de Ácido — Saldo 50%, facturable',
      'messina-playon-dilucion-acido', 'oc'],
    ['98', null, 'BASES TANQUE SO2 - Cancelación', 'messina-bases-tanque-so2', 'alias'],
  ]
  for (const [id, h, concepto, obra, imputacion] of FILAS) {
    const r = resolverObraDeCobranza({ obra_cliente: 'MESSINA', orden_compra: h, concepto }, MESSINA)
    assert.deepEqual({ obraId: r.obraId, imputacion: r.imputacion }, { obraId: obra, imputacion },
      `fila ${id} («${concepto}») — ${r.porque}`)
  }
  // NINGUNA de las 24 queda en la bolsa: ése es el defecto que se cierra.
  assert.equal(FILAS.filter((f) => f[3] === 'messina').length, 0)
})

test('cuando no se puede, la fila queda con el cliente y lo DICE', () => {
  // ARCOR: la OC está en H y en `cliente_orden`, pero sus obras no están dadas de alta. No se
  // inventa una: bolsa del cliente, imputación 'cliente', y el motivo escrito.
  const arcor = { obraPorOc: new Map(), aliasesLibres: [], bolsa: 'arcor' }
  const r = resolverObraDeCobranza(
    { obra_cliente: 'ARCOR', orden_compra: 'OC 53239034', concepto: 'Hormigón en Ecopatio' }, arcor)
  assert.deepEqual({ obraId: r.obraId, imputacion: r.imputacion }, { obraId: 'arcor', imputacion: 'cliente' })
  assert.match(r.porque, /53239034/, 'tiene que decir QUÉ orden no pudo resolver')

  // San Francisco no tiene obra bolsa —«IMOTOR/San Francisco/JAVI SANCHEZ» no está en `obra_alias`,
  // y declararlo lo firma el dueño, no una migración—: la fila se queda SIN obra y se dice.
  const sf = { obraPorOc: new Map(), aliasesLibres: [], bolsa: null }
  const s = resolverObraDeCobranza(
    { obra_cliente: 'IMOTOR/San Francisco/JAVI SANCHEZ', orden_compra: 'Certificado 2', concepto: '' }, sf)
  assert.deepEqual({ obraId: s.obraId, imputacion: s.imputacion }, { obraId: null, imputacion: null })
  assert.match(s.porque, /bolsa/)
})

test('el texto que nombra DOS obras del cliente no elige ninguna', () => {
  const dicc = {
    obraPorOc: new Map(),
    aliasesLibres: [{ alias: 'pilon', obraId: 'pilon' }, { alias: 'playon azufre', obraId: 'messina-playon-azufre' }],
    bolsa: 'messina',
  }
  const r = resolverObraDeCobranza(
    { obra_cliente: 'MESSINA', orden_compra: null, concepto: 'Pilon y Playon Azufre — pago conjunto' }, dicc)
  assert.equal(r.obraId, 'messina')
  assert.equal(r.imputacion, 'cliente')
  assert.match(r.porque, /2 obras/)
})
