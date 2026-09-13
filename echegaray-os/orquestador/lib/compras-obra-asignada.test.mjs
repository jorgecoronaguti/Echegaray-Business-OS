import test from 'node:test'
import assert from 'node:assert/strict'
import { normAlias } from './jornales-a-registros-hh.mjs'
import {
  VIA, asignadorDeCompras, planDeAsignacion, referenciaDeCompra, rotulosDeDetalle,
} from './compras-obra-asignada.mjs'

// Catálogo recortado de producción (13/09/2026): alias y obras como están en la base.
const ALIAS = new Map([
  ['san francisco', 'san-francisco'], ['pisos industriales', 'pisos-industriales'],
  ['instalacion electrica', 'instalacion-electrica'], ['entrepiso', 'entrepiso-y-escalera'],
  ['estrella', 'la-estrella'], ['galpon 9', 'le-galpon-9'], ['oficinas y fabrica palitos', 'le-comedor'],
  ['quattropani', 'quattropani'], ['salones comerciales', 'quattropani'],
  ['pisos 120m2', 'messina-pisos-120-rampa'], ['messina', 'messina'],
].map(([a, o]) => [normAlias(a), o]))
const CANONICAS = [
  { id: 'san-francisco', nombre: 'Galpones, Mampostería, Cancha de Padel', cliente_texto: 'San Francisco' },
  { id: 'pisos-industriales', nombre: 'SF - PISOS INDUSTRIALES', cliente_texto: 'San Francisco' },
  { id: 'instalacion-electrica', nombre: 'SF - INSTALACIÓN ELÉCTRICA', cliente_texto: 'San Francisco' },
  { id: 'entrepiso-y-escalera', nombre: 'SF - ENTREPISO Y ESCALERA', cliente_texto: 'San Francisco' },
  { id: 'la-estrella', nombre: 'La Estrella', cliente_texto: 'La Estrella' },
  { id: 'le-galpon-9', nombre: 'Galpón 9', cliente_texto: 'La Estrella' },
  { id: 'le-comedor', nombre: 'Oficina y Fábrica de Palitos', cliente_texto: 'La Estrella' },
  { id: 'quattropani', nombre: 'Quattropani - SALÓN COMERCIAL', cliente_texto: 'Quattropani - Melisa García SAS' },
  { id: 'messina', nombre: 'Messina', cliente_texto: 'Messina' },
  { id: 'messina-pisos-120-rampa', nombre: 'ME - PISOS 120 M² Y RAMPA', cliente_texto: 'MESSINA' },
  { id: 'pisos-120m2', nombre: 'Pisos 120m2', cliente_texto: 'Messina', fusionada_en: 'messina-pisos-120-rampa' },
]
const CLIENTES = new Map([
  ['SAN FRANCISCO', 'SAN FRANCISCO'], ['LA ESTRELLA', 'LA ESTRELLA'], ['MESSINA', 'MESSINA'],
  ['QUATTROPANI - MELISA GARCIA SAS', 'QUATTROPANI'], ['QUATTROPANI', 'QUATTROPANI'],
].map(([r, c]) => [normAlias(r), c]))

const asignar = asignadorDeCompras({ alias: ALIAS, canonicas: CANONICAS, clienteAlias: CLIENTES })
const compra = (obra_texto, detalle_obra, total = 100, extra = {}) =>
  ({ fila: 10, sheet_id: 77, obra_texto, detalle_obra, total, estado: 'Pagado', ...extra })

test('la obra sale de la columna K, no de la J: «Pisos Industriales» de San Francisco va a SF - Pisos', () => {
  const r = asignar(compra('San Francisco', 'Pisos Industriales'))
  assert.equal(r.obra_id, 'pisos-industriales')
  assert.equal(r.via, VIA.ALIAS)
  assert.equal(r.cliente, 'SAN FRANCISCO')
})

test('el primer tramo de la K alcanza: «Galpon 9 - DISCOS …» es Galpón 9', () => {
  assert.equal(asignar(compra('LA ESTRELLA', 'Galpon 9 - DISCOS T/27 115 x 1.0 mm (50 u)')).obra_id, 'le-galpon-9')
  assert.equal(asignar(compra('San Francisco', 'Pisos Industriales · Proyector Led')).obra_id, 'pisos-industriales')
  assert.equal(asignar(compra('San Francisco', 'Instalacion Eléctrica - Afilador de mechas')).obra_id, 'instalacion-electrica')
})

test('un número de OC con guión no parte la K', () => {
  assert.deepEqual(rotulosDeDetalle('Pisos - OC 02-00002097'), ['Pisos - OC 02-00002097', 'Pisos'])
  assert.deepEqual(rotulosDeDetalle('OC 02-00002097'), ['OC 02-00002097'])
  assert.deepEqual(rotulosDeDetalle(null), [])
})

// EL DEFECTO: con la regla vieja (y con el paso 3 del resolutor de JORNALES) estas compras caían en la
// obra madre y las obras vivas del cliente se dibujaban «—».
test('sin K, o con una K que no nombra obra, un cliente de varias obras queda SIN OBRA — nunca la madre', () => {
  for (const k of [null, 'combustible', 'ALQUILER DE EQUIPO']) {
    const r = asignar(compra('San Francisco', k))
    assert.equal(r.obra_id, null, `«${k}» se asignó a ${r.obra_id}`)
    assert.equal(r.via, VIA.SIN_OBRA)
    assert.equal(r.cliente, 'SAN FRANCISCO')
    assert.ok(r.porque.length > 0)
  }
})

test('con una sola obra no hay nada que decidir: Quattropani «limpieza» va a su obra', () => {
  const r = asignar(compra('Quattropani - Melisa García SAS', 'limpieza (1,00 unidades)'))
  assert.equal(r.obra_id, 'quattropani')
  assert.equal(r.via, VIA.UNICA)
})

test('una obra fusionada no cuenta como obra aparte del cliente', () => {
  // Messina tiene «messina» y «messina-pisos-120-rampa» vivas: sigue siendo de varias obras.
  assert.equal(asignar(compra('MESSINA', 'combustible')).obra_id, null)
})

test('un alias de una obra de OTRO cliente no es evidencia', () => {
  // «Salones Comerciales» es alias de Quattropani: escrito en una fila de San Francisco no la mueve.
  const r = asignar(compra('San Francisco', 'Salones Comerciales'))
  assert.equal(r.obra_id, null)
  assert.equal(r.via, VIA.SIN_OBRA)
})

test('una J que no es cliente no se asigna a ninguna obra', () => {
  const r = asignar(compra('Administracion', 'Pisos Industriales'))
  assert.equal(r.obra_id, null)
  assert.equal(r.via, VIA.NO_CLIENTE)
  assert.equal(r.cliente, null)
})

test('la referencia es la de costos_obra: sheet_id, y la fila sólo si no hay id', () => {
  assert.equal(referenciaDeCompra({ fila: 5, sheet_id: 0 }), '0')
  assert.equal(referenciaDeCompra({ fila: 5, sheet_id: null }), '5')
})

test('IDENTIDAD: por cliente, obras + sin obra = total de Compras del cliente, al peso', () => {
  const compras = [
    compra('San Francisco', 'Pisos Industriales', 20_100_000),
    compra('San Francisco', null, 16_136_863),
    compra('San Francisco', 'Entrepiso', 108_900),
    compra('San Francisco', 'combustible', 1_660_044.37),
    compra('San Francisco', 'Obra Principal', 999, { estado: 'ELIMINADO' }),
    compra('San Francisco', 'Pisos Industriales', 55, { anulada: true }),
    compra('LA ESTRELLA', 'Galpon 7', 17_004_277),
    compra('LA ESTRELLA', 'Galpon 9', 25_142_938),
    compra('Quattropani - Melisa García SAS', 'Salones Comerciales', 35_017_000),
    compra('Taller', 'insumos', 500),
  ].map((c, i) => ({ ...c, sheet_id: i }))
  const plan = planDeAsignacion(compras, asignar)
  // ELIMINADO y anulada no son costo: no entran a la tabla, igual que a costos_obra.
  assert.equal(plan.length, 8)
  assert.equal(new Set(plan.map((p) => p.referencia)).size, plan.length, 'una compra con dos asignaciones')

  const totalDe = (cliente) => compras
    .filter((c) => c.estado !== 'ELIMINADO' && !c.anulada && asignar(c).cliente === cliente)
    .reduce((s, c) => s + c.total, 0)
  const porCliente = new Map()
  for (const p of plan) {
    if (!p.cliente) continue
    const total = compras.find((c) => referenciaDeCompra(c) === p.referencia).total
    porCliente.set(p.cliente, (porCliente.get(p.cliente) ?? 0) + total)
  }
  for (const cliente of ['SAN FRANCISCO', 'LA ESTRELLA', 'QUATTROPANI']) {
    assert.equal(porCliente.get(cliente), totalDe(cliente), cliente)
  }
  const sf = plan.filter((p) => p.cliente === 'SAN FRANCISCO')
  assert.deepEqual(sf.map((p) => p.obra_id), ['pisos-industriales', null, 'entrepiso-y-escalera', null])
})
