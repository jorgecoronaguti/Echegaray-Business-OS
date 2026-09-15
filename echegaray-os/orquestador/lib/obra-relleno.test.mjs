import test from 'node:test'
import assert from 'node:assert/strict'
import { normAlias } from './jornales-a-registros-hh.mjs'
import { destinosDeObra } from './comprobantes/obra-y-destino.mjs'
import { numeroCanonico } from './ordenes-identidad.mjs'
import {
  CONFIANZA, diccionariosDeCobranzas, indiceDePalabras, obraPorPalabras, paraElDueno, palabras,
  propuestaCobranza, propuestaCompra,
} from './obra-relleno.mjs'

// LOS CASOS DEL DUEÑO (14/09/2026) CON LA FORMA DE LA BASE REAL: nombres «CÓDIGO - NOMBRE», el alias
// «bsa planta» (no «planta de bsa»), «bases tanque so2», una obra fusionada y la bolsa del cliente.
// Copiados de una lectura del 15/09 como EJEMPLO: el test no afirma el estado vivo de la base.

const OBRAS = [
  { id: 'messina', codigo: 'OB-0004', nombre: 'ME - OBRA GENERAL', cliente_texto: 'Messina', fusionada_en: null, cliente_id: 'c-me' },
  { id: 'bsa-planta', codigo: 'OB-0013', nombre: 'ME - BSA PLANTA', cliente_texto: 'Messina', fusionada_en: 'messina-bsa', cliente_id: 'c-me' },
  { id: 'messina-bsa', codigo: 'OB-0019', nombre: 'ME - BSA', cliente_texto: 'MESSINA', fusionada_en: null, cliente_id: 'c-me' },
  { id: 'messina-bases-tanque-so2', codigo: 'OB-0024', nombre: 'ME - BASES TANQUE SO2', cliente_texto: 'MESSINA', fusionada_en: null, cliente_id: 'c-me' },
  { id: 'le-galpon-9', codigo: 'OB-0007', nombre: 'LE - GALPÓN 9', cliente_texto: 'La Estrella', fusionada_en: null, cliente_id: 'c-le' },
  { id: 'le-galpon-7', codigo: 'OB-0068', nombre: 'LE - GALPÓN 7', cliente_texto: 'La Estrella', fusionada_en: null, cliente_id: 'c-le' },
  { id: 'quattropani', codigo: 'OB-0008', nombre: 'QP - SALÓN COMERCIAL', cliente_texto: 'Quattropani - Melisa García SAS', fusionada_en: null, cliente_id: 'c-qp' },
  { id: 'san-francisco', codigo: 'OB-0005', nombre: 'SF - GALPONES, MAMPOSTERÍA Y CANCHA DE PÁDEL', cliente_texto: 'San Francisco', fusionada_en: null, cliente_id: 'c-sf' },
  { id: 'pisos-industriales', codigo: 'OB-0011', nombre: 'SF - PISOS INDUSTRIALES', cliente_texto: 'San Francisco', fusionada_en: null, cliente_id: 'c-sf' },
]
const n = (s) => normAlias(s)
const CATALOGOS = {
  canonicas: OBRAS,
  alias: new Map([
    [n('bsa planta'), 'messina-bsa'], [n('bases tanque so2'), 'messina-bases-tanque-so2'],
    [n('galpon 9'), 'le-galpon-9'], [n('galpon 7'), 'le-galpon-7'], [n('salones comerciales'), 'quattropani'],
  ]),
  clienteAlias: new Map([
    [n('MESSINA'), 'MESSINA'], [n('Messinas'), 'MESSINA'], [n('LA ESTRELLA'), 'LA ESTRELLA'],
    [n('QUATTROPANI - MELISA GARCIA SAS'), 'QUATTROPANI'], [n('Quattropani - Melisa García SAS'), 'QUATTROPANI'],
    [n('SAN FRANCISCO'), 'SAN FRANCISCO'],
  ]),
}
const destinos = destinosDeObra(CATALOGOS)
const ctx = { destinos, palabras: indiceDePalabras(CATALOGOS, destinos), guardadas: new Map() }
const compra = (p) => ({ fila: 900, sheet_id: 896, proveedor: 'Corralon Progreso', unidad_negocio: 'Civil', obra_texto: null, detalle_obra: null, concepto: null, ...p })

test('LA ESTRELLA · Galpon 9 y Quattropani · Salones Comerciales: alta, por el alias exacto', () => {
  const g9 = propuestaCompra(compra({ obra_texto: 'LA ESTRELLA', detalle_obra: 'Galpon 9 - combustible' }), ctx)
  assert.deepEqual([g9.valor, g9.confianza], ['OB-0007 · LE - GALPÓN 9', CONFIANZA.ALTA])
  const qp = propuestaCompra(compra({ obra_texto: 'Quattropani - Melisa García SAS', detalle_obra: 'Salones Comerciales' }), ctx)
  assert.deepEqual([qp.valor, qp.confianza], ['OB-0008 · QP - SALÓN COMERCIAL', CONFIANZA.ALTA])
})

test('MESSINA · Planta de BSA: las mismas palabras que «bsa planta», en otro orden → media, a la obra VIVA', () => {
  const p = propuestaCompra(compra({ obra_texto: 'MESSINA', detalle_obra: 'Planta de BSA' }), ctx)
  assert.deepEqual([p.valor, p.confianza, p.obra_id], ['OB-0019 · ME - BSA', CONFIANZA.MEDIA, 'messina-bsa'])
})

test('MESSINA · Bases de Tanque: contenida en «bases tanque so2» → baja, y va a la lista del dueño', () => {
  const p = propuestaCompra(compra({ obra_texto: 'MESSINA', detalle_obra: 'Bases de Tanque' }), ctx)
  assert.deepEqual([p.valor, p.confianza], ['OB-0024 · ME - BASES TANQUE SO2', CONFIANZA.BAJA])
  assert.equal(paraElDueno(p), true)
})

test('San Francisco sin detalle: ambigua, con sus obras y «Sin obra» como CANDIDATAS, no como propuesta', () => {
  const p = propuestaCompra(compra({ proveedor: 'Gerson Castro', obra_texto: 'San Francisco', detalle_obra: '' }), ctx)
  assert.equal(p.valor, null)
  assert.equal(p.confianza, CONFIANZA.AMBIGUA)
  assert.deepEqual(p.candidatos, ['OB-0005 · SF - GALPONES, MAMPOSTERÍA Y CANCHA DE PÁDEL', 'OB-0011 · SF - PISOS INDUSTRIALES', 'Sin obra – SAN FRANCISCO'])
})

test('Administracion · Refaccion Oficina → ES-ADM; con Unidad Civil → ambigua (la J y la I se contradicen)', () => {
  const adm = propuestaCompra(compra({ obra_texto: 'Administracion', detalle_obra: 'Refaccion Oficina', unidad_negocio: 'Estructura' }), ctx)
  assert.deepEqual([adm.valor, adm.confianza], ['ES-ADM · Estructura – Administración', CONFIANZA.ALTA])
  const choca = propuestaCompra(compra({ obra_texto: 'Administracion', detalle_obra: 'Bases de Tanque', unidad_negocio: 'Civil' }), ctx)
  assert.deepEqual([choca.valor, choca.confianza], [null, CONFIANZA.AMBIGUA])
})

test('«Almacen» no es cliente ni tiene opción fija: ambigua con ES-ADM/ES-TAL de candidatas', () => {
  const p = propuestaCompra(compra({ obra_texto: 'Almacen', unidad_negocio: 'Estructura' }), ctx)
  assert.deepEqual([p.valor, p.confianza, p.candidatos.length], [null, CONFIANZA.AMBIGUA, 2])
})

test('impuestos, cargas y financieros: fuera de Compras, sin obra', () => {
  for (const f of [{ proveedor: 'UOCRA', obra_texto: 'UOCRA', unidad_negocio: 'Impuestos' }, { proveedor: 'ARCA' }, { proveedor: 'Banco', obra_texto: 'Credito Prendario', unidad_negocio: 'Financiero' }]) {
    assert.equal(propuestaCompra(compra(f), ctx).confianza, CONFIANZA.FUERA, JSON.stringify(f))
  }
})

test('una propuesta que contradice la asignación guardada baja a «baja» y lo dice', () => {
  const guardadas = new Map([['896', { referencia: '896', obra_id: 'le-galpon-7' }]])
  const p = propuestaCompra(compra({ obra_texto: 'LA ESTRELLA', detalle_obra: 'Galpon 9' }), { ...ctx, guardadas })
  assert.deepEqual([p.confianza, p.guardada], [CONFIANZA.BAJA, 'le-galpon-7'])
  assert.match(p.porque, /guardada dice le-galpon-7/)
})

test('por palabras: única o nada, y el número distingue galpones', () => {
  assert.deepEqual([...palabras('LE - GALPÓN 9')].includes('9'), true)
  const obras = ctx.palabras.get('LA ESTRELLA')
  assert.equal(obraPorPalabras('Galpon', obras), null, '«Galpon» está en dos obras: no se elige')
})

const cobranzas = diccionariosDeCobranzas({
  ordenes: [{ cliente_id: 'c-me', numero: '00002-00002256', numero_canonico: null, obra_id: 'bsa-planta' }],
  alias: [{ alias: 'bases tanque so2', obra_id: 'messina-bases-tanque-so2', en_texto_libre: true, clasificacion: 'obra', cliente_id: 'c-me' }],
  bolsas: [{ alias: 'messina', obra_id: 'messina' }],
  fusion: new Map(OBRAS.map((o) => [o.id, o.fusionada_en ?? o.id])),
}, { normObra: (s) => normAlias(s), numeroCanonico })
const cctx = { ...ctx, cobranzas }
const cobro = (p) => ({ id: 'x', cliente_id: 'c-me', obra_cliente: 'MESSINA', orden_compra: null, concepto: null, ...p })

test('Cobranzas: la OC cargada → alta (a la obra viva); el alias en el texto → media; la bolsa → ambigua', () => {
  const oc = propuestaCobranza(cobro({ orden_compra: 'OC 00002-00002256' }), cctx)
  assert.deepEqual([oc.valor, oc.confianza], ['OB-0019 · ME - BSA', CONFIANZA.ALTA])
  const al = propuestaCobranza(cobro({ concepto: 'BASES TANQUE SO2 - Cancelación' }), cctx)
  assert.deepEqual([al.valor, al.confianza], ['OB-0024 · ME - BASES TANQUE SO2', CONFIANZA.MEDIA])
  const bolsa = propuestaCobranza(cobro({ concepto: 'Anticipo' }), cctx)
  assert.deepEqual([bolsa.valor, bolsa.confianza], [null, CONFIANZA.AMBIGUA])
  assert.ok(bolsa.candidatos.includes('Sin obra – MESSINA'))
})
