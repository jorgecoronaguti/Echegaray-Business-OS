// Los casos son FILAS REALES de `compra_sheet` medidas el 03/09/2026, copiadas con su texto tal
// cual. Un caso inventado probaría el regex contra sí mismo; los que rompieron la primera versión
// —«art de agua potable» y «curva para desague» de Corralón Progreso— son justamente los que no se
// le habrían ocurrido a nadie escribiendo el test antes de correrlo contra los datos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorProveedor, clasificarComprobante, costoDeObraSinDobleConteo, economiaDelPaquete,
} from './subcontratos-en-compras.mjs'

const clase = (fila) => clasificarComprobante(fila).clase

test('la marca escrita a mano por administración manda', () => {
  const r = clasificarComprobante({
    proveedor: 'Gerson Castro', concepto: 'CLOACA Y AGUA POTABLE', detalle_obra: 'Sub contratista',
    familia_material: 'Plomería, agua y cloacas',
  })
  assert.equal(r.clase, 'subcontrato')
  assert.equal(r.confianza, 'alta')
  assert.match(r.senales.join(' '), /Sub contratista/)
})

test('la familia del Sheet «Subcontratos y mano de obra» alcanza sola', () => {
  const r = clasificarComprobante({ proveedor: 'PEDRO TELLO', concepto: 'Mano de Obra', familia_material: 'Subcontratos y mano de obra' })
  assert.equal(r.clase, 'subcontrato')
  assert.equal(r.confianza, 'alta')
})

// EL CASO QUE ROMPE LA REGLA INGENUA. Fila real 03/09/2026: administración rotuló «Subcontratos y
// mano de obra» una compra de cal. Si la marca del Sheet ganara siempre, ese paquete arrancaría con
// $ 47.462 de cal adentro. Invertir el orden de los bloques 1 y 2 del clasificador pone esto en rojo.
test('un material rotulado «Subcontratos» sigue siendo material', () => {
  assert.equal(clase({
    proveedor: 'Corralon Progreso', familia_material: 'Subcontratos y mano de obra',
    concepto: 'Cal Magical x 25kg, tanza de albañil 0,80mm y rafia cubre cerco 1,80 alto · a mano: "Replanteo · 4P"',
  }), 'material')
})

// Estas dos filas hacían pasar por subcontrato $ 44.449 de caños y artefactos: «agua potable» y
// «desagüe» son sustantivos de rubro, no verbos. Volver a meterlos sueltos en EJECUCION da rojo.
test('un sustantivo de rubro sanitario no convierte una compra en subcontrato', () => {
  assert.equal(clase({ proveedor: 'Corralon Progreso', concepto: 'art de agua potable', detalle_obra: 'insumos' }), 'material')
  assert.equal(clase({ proveedor: 'Corralon Progreso', concepto: 'curva para desague', detalle_obra: 'Mamposteria' }), 'indeterminado')
})

test('«hormigonado 400 m²» es trabajo; «Hormigon H17 28m3» es material', () => {
  assert.equal(clase({ proveedor: 'PEDRO TELLO', familia_material: 'Hormigón y premoldeados', concepto: 'Hormigonado 400 m² — pago 1 de 4 (vence 04/09/2026)' }), 'subcontrato')
  assert.equal(clase({ proveedor: 'Hormiserv', familia_material: 'Hormigón y premoldeados', concepto: 'Materiales para la ejecucion de Galpon 9 - Hormigon H17 28m3' }), 'material')
})

test('alquilar una grúa no es subcontratar un alcance', () => {
  assert.equal(clase({ proveedor: 'Angel Fernandez', concepto: 'ALQUILER DE GRUA' }), 'alquiler')
  assert.equal(clase({ proveedor: 'Angel Fernandez', concepto: 'MONTAJE DE VM200 Y CORREAS', familia_material: 'Chapa, perfiles y estructura metálica' }), 'subcontrato')
})

test('lo que no se puede decidir queda indeterminado y no se completa', () => {
  // $ 4.200.000 reales de PEDRO TELLO en San Francisco cuyo concepto entero es «Galpon 5».
  const r = clasificarComprobante({ proveedor: 'PEDRO TELLO', concepto: 'Galpon 5', familia_material: 'Pisos y revestimientos' })
  assert.equal(r.clase, 'indeterminado')
  assert.deepEqual(r.senales, [])
})

test('sin CUIT y sin comprobante se marca aunque la clase sea clara', () => {
  const r = clasificarComprobante({ proveedor: 'PEDRO TELLO', concepto: 'Hormigonado 600 m²', cuit: null, comprobante: null })
  assert.equal(r.sinRespaldo, true)
  assert.equal(clasificarComprobante({ proveedor: 'Femenia', concepto: 'Servicio de limpieza', cuit: '30715773208', comprobante: 'A 0001-00000123' }).sinRespaldo, false)
})

test('el agrupado suma sólo subcontratos y cuenta las filas sin respaldo', () => {
  const filas = [
    { proveedor: 'PEDRO TELLO', obra_texto: 'MESSINA', total: 540000, concepto: 'Mano de Obra', familia_material: 'Subcontratos y mano de obra' },
    { proveedor: 'PEDRO TELLO', obra_texto: 'Quattropani', total: 1800000, concepto: 'Hormigonado 400 m²' },
    { proveedor: 'Hormiserv', obra_texto: 'LA ESTRELLA', total: 3640067, concepto: 'Materiales para la ejecucion de Galpon 9' },
  ].map((f) => ({ ...f, ...clasificarComprobante(f) }))
  const [g] = agruparPorProveedor(filas)
  assert.equal(agruparPorProveedor(filas).length, 1, 'Hormiserv es material y no debe aparecer')
  assert.equal(g.monto, 2340000)
  assert.equal(g.sinRespaldo, 2)
  assert.equal(g.confianzaMinima, 'media')
  assert.deepEqual(g.obras, ['MESSINA', 'Quattropani'])
})

// ═══ EL DOBLE CONTEO ═══
// El paquete real: PEDRO TELLO · Quattropani · hormigonado 2.200 m² · $ 9.900.000 en 4 pagos, y los
// cuatro YA están cargados en Compras (filas 908-911) y por lo tanto ya están en `costos_obra`.

test('facturar consume compromiso, no agrega costo', () => {
  const eco = economiaDelPaquete({
    precioContratado: 9_900_000,
    comprobantes: [{ total: 1_800_000 }, { total: 2_700_000 }, { total: 2_700_000 }, { total: 2_700_000 }],
  })
  assert.equal(eco.ejecutado, 9_900_000)
  assert.equal(eco.pendiente, 0)
  // Cambiar `costoParaLaObra` por `comprometido + ejecutado` da 19.800.000 y pone esto en rojo.
  assert.equal(eco.costoParaLaObra, 9_900_000)
})

test('lo contratado y no facturado sí suma, una sola vez', () => {
  const eco = economiaDelPaquete({ precioContratado: 9_900_000, comprobantes: [{ total: 1_800_000 }] })
  assert.equal(eco.pendiente, 8_100_000)
  assert.equal(eco.costoParaLaObra, 9_900_000)
})

test('lo facturado de más se ve, y no se esconde bajo el precio', () => {
  const eco = economiaDelPaquete({ precioContratado: 9_900_000, comprobantes: [{ total: 12_000_000 }] })
  assert.equal(eco.excedido, 2_100_000)
  assert.equal(eco.pendiente, 0)
  assert.equal(eco.costoParaLaObra, 12_000_000)
})

test('un paquete sin precio no inventa compromiso', () => {
  const eco = economiaDelPaquete({ precioContratado: null, comprobantes: [{ total: 500_000 }] })
  assert.equal(eco.comprometido, null)
  assert.equal(eco.pendiente, null)
  assert.equal(eco.costoParaLaObra, 500_000)
})

test('el costo de la obra cuenta cada peso una vez', () => {
  const comprobantes = [
    { clave: '908', total: 1_800_000 }, { clave: '909', total: 2_700_000 },
    { clave: '910', total: 2_700_000 }, { clave: '911', total: 2_700_000 },
    { clave: 'otro', total: 1_000_000 },
  ]
  const paquetes = [{ id: 'tello', precioContratado: 9_900_000, comprobantes: ['908', '909', '910', '911'] }]
  const r = costoDeObraSinDobleConteo({ comprobantes, paquetes })
  assert.equal(r.enCompras, 10_900_000)
  assert.equal(r.contratadoSinFacturar, 0)
  assert.equal(r.costoReal, 10_900_000, 'sumar el precio contratado además daría 20.800.000')
  assert.equal(r.detalle[0].dobleConteoEvitado, 9_900_000)
})

test('el paquete todavía sin facturar entero sí aporta su remanente', () => {
  const r = costoDeObraSinDobleConteo({
    comprobantes: [{ clave: '908', total: 1_800_000 }],
    paquetes: [{ id: 'tello', precioContratado: 9_900_000, comprobantes: ['908'] }],
  })
  assert.equal(r.costoReal, 9_900_000)
  assert.equal(r.contratadoSinFacturar, 8_100_000)
})
