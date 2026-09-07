// LA REGLA DE DEDUCCIÓN DEL RUBRO, PROBADA CONTRA LOS CASOS REALES DE LA BASE.
//
// Los números de cada caso salen de la medición del 06/09/2026 sobre `compra_sheet` (947 filas no
// anuladas, cruzadas con los 36 proveedores por CUIT normalizado o, sin CUIT, por nombre). Van como
// DATOS de entrada, no como una consulta: un test que lee la base afirma el estado del mundo y se
// pone rojo cuando alguien carga una compra, sin que ninguna regla se haya roto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { FAMILIA_A_RUBRO, RUBROS, agruparPorProveedor, deducirRubro } from './rubro-proveedor.mjs'

/** Arma las compras de un proveedor: `{ familia: n }`. */
const compras = (mezcla) => Object.entries(mezcla)
  .flatMap(([familia, n]) => Array.from({ length: n }, () => ({ familia: familia || null })))

test('el mapa no puede inventar un rubro que la base rechaza', () => {
  // El CHECK de `20260906T1800` sólo acepta los siete. Un valor de más acá pasaría el deductor y
  // moriría en el `update` con un error de constraint, que es el peor lugar para enterarse.
  for (const r of Object.values(FAMILIA_A_RUBRO)) {
    assert.ok(RUBROS.includes(r), `«${r}» no está en el vocabulario que acepta la base`)
  }
})

test('«SIN CLASIFICAR» y el vacío NO son una categoría: son la ausencia del dato', () => {
  assert.equal(FAMILIA_A_RUBRO['SIN CLASIFICAR'], undefined)
  assert.equal(FAMILIA_A_RUBRO[''], undefined)
  const r = deducirRubro(compras({ 'SIN CLASIFICAR': 9 }))
  assert.equal(r.rubro, null, 'nueve filas sin clasificar dedujeron un rubro')
  assert.match(r.evidencia, /ninguna con familia de material cargada/)
})

test('un corralón mixto es Materiales: al proveedor lo define QUE vende material, no cuál', () => {
  // Corralón Progreso, medido: cemento 65, ferretería 35, plomería 31, pisos 18, revoques 15,
  // hierro 10, electricidad 7, EPP 5, aberturas 4, chapa 3, hormigón 1, subcontratos 1.
  const r = deducirRubro(compras({
    'Cemento, cal y áridos': 65, 'Ferretería y consumibles': 35, 'Plomería, agua y cloacas': 31,
    'Pisos y revestimientos': 18, 'SIN CLASIFICAR': 17, 'Revoques, pintura y terminación': 15,
    'Hierro y malla': 10, Electricidad: 7, '': 7, 'Seguridad e higiene / EPP': 5,
    'Aberturas, portones y herrería': 4, 'Chapa, perfiles y estructura metálica': 3,
    'Hormigón y premoldeados': 1, 'Subcontratos y mano de obra': 1,
  }))
  assert.equal(r.rubro, 'Materiales')
  assert.match(r.evidencia, /^189 de 195 compras clasificadas son Materiales/)
  // LAS QUE NO ENTRARON EN LA CUENTA SE DICEN. Si la evidencia sólo dijera «189 de 195», el que la
  // lea creería que el proveedor tiene 195 compras, y tiene 219.
  assert.match(r.evidencia, /24 sin familia cargada quedan fuera de la cuenta/)
})

test('UNA factura de mano de obra dentro de un corralón NO lo vuelve subcontratista', () => {
  // Es el defecto caro: marcar «Subcontratista» abre el control mensual de ART con nómina y cargas
  // sociales. Con mayoría simple sobre la familia cruda —sin agrupar a rubro primero— Corralón
  // Progreso habría quedado en «Cemento» y Ángel Fernández en subcontratista por una fila.
  const r = deducirRubro(compras({
    'Chapa, perfiles y estructura metálica': 3, 'Alquiler y traslado de equipos': 1,
    'Subcontratos y mano de obra': 1,
  }))
  assert.equal(r.rubro, null, 'un proveedor mixto de 5 compras quedó etiquetado por 3 votos')
  assert.match(r.evidencia, /60 %/)
})

test('Subcontratista pide más evidencia que los demás rubros', () => {
  // Cuatro de cuatro sería 100 % y alcanzaría para cualquier otro rubro. Para éste no: la muestra
  // tiene que ser lo bastante grande como para no ser una factura suelta.
  const cuatro = deducirRubro(compras({ 'Subcontratos y mano de obra': 4 }))
  assert.equal(cuatro.rubro, null, 'cuatro compras alcanzaron para abrir un control laboral')
  assert.match(cuatro.evidencia, /hacen falta 5/)

  assert.equal(deducirRubro(compras({ 'Subcontratos y mano de obra': 5 })).rubro, 'Subcontratista')

  // Y 4 de 5 (80 %) entra justo; 4 de 6 (67 %) alcanzaría para Materiales y acá no.
  assert.equal(deducirRubro(compras({
    'Subcontratos y mano de obra': 4, 'Ferretería y consumibles': 1,
  })).rubro, 'Subcontratista')
  assert.equal(deducirRubro(compras({
    'Subcontratos y mano de obra': 4, 'Ferretería y consumibles': 2,
  })).rubro, null, 'el 67 % alcanzó para abrir un control laboral')
})

test('dos compras nunca deducen: la «mayoría» sería una sola fila', () => {
  // Diesel Rodríguez, medido: combustible 2 y una sin familia. El nombre dice «Diesel» y da lo
  // mismo — deducir del nombre es justo lo que esta regla existe para no hacer.
  const r = deducirRubro(compras({ 'Combustible de obra': 2, '': 1 }))
  assert.equal(r.rubro, null)
  assert.match(r.evidencia, /son pocas para deducir \(hacen falta 3\)/)
})

test('un proveedor sin ninguna compra leída lo dice, y no dice «sin rubro» a secas', () => {
  const r = deducirRubro([])
  assert.equal(r.rubro, null)
  assert.equal(r.evidencia, 'sin compras leídas')
})

test('NINGUNA deducción devuelve la evidencia vacía', () => {
  // El CHECK de la base rechaza un `rubro_deducido` sin evidencia; acá se prueba que además ninguna
  // rama —ni las que no deducen— se queda sin explicar por qué.
  const casos = [
    [], compras({ 'SIN CLASIFICAR': 3 }), compras({ 'Combustible de obra': 2 }),
    compras({ 'Combustible de obra': 30 }), compras({ 'Subcontratos y mano de obra': 4 }),
    compras({ Electricidad: 3, 'Combustible de obra': 3 }),
  ]
  for (const c of casos) {
    const { evidencia } = deducirRubro(c)
    assert.ok(typeof evidencia === 'string' && evidencia.trim().length > 0,
      `un caso de ${c.length} compras no dejó evidencia`)
  }
})

test('un empate no deduce: 3 y 3 no es mayoría de dos tercios', () => {
  const r = deducirRubro(compras({ Electricidad: 3, 'Combustible de obra': 3 }))
  assert.equal(r.rubro, null)
  assert.match(r.evidencia, /50 %/)
})

test('los casos limpios de la medición dan lo que tienen que dar', () => {
  const esperado = [
    ['Combustibles Barcelo', { 'Combustible de obra': 96, '': 56 }, 'Combustible'],
    ['Sanitarios OD', { 'Servicios de obra (baño, contenedor, agua)': 15, 'Plomería, agua y cloacas': 1 }, 'Servicios de obra'],
    ['DUPEC', { 'Alquiler y traslado de equipos': 11, '': 6, 'SIN CLASIFICAR': 1 }, 'Equipos'],
    ['Meglioli', { 'Seguridad e higiene / EPP': 9, 'SIN CLASIFICAR': 1 }, 'Seguridad e higiene'],
    ['Trielec', { Electricidad: 14, 'Chapa, perfiles y estructura metálica': 2, '': 1, 'SIN CLASIFICAR': 1 }, 'Materiales'],
    ['Robles Jose Maria', { '': 8 }, null],
  ]
  for (const [quien, mezcla, rubro] of esperado) {
    assert.equal(deducirRubro(compras(mezcla)).rubro, rubro, `${quien} dedujo otra cosa`)
  }
})

// ── EL ARMADO DEL CRUCE ──────────────────────────────────────────────────────────────────────────

test('un proveedor con compras SIN CLASIFICAR no se reporta como «sin compras leídas»', () => {
  // EL DEFECTO, MEDIDO EL 06/09/2026 EN LA PRIMERA CORRIDA DEL DEDUCTOR. Robles José María tiene 8
  // compras, todas sin familia, y el script las descartaba y decía «sin compras leídas». Las dos
  // frases se parecen y significan trabajos opuestos: una es «este proveedor no compró nada» y la
  // otra es «hay 8 compras que nadie clasificó». La segunda es trabajo pendiente que la primera
  // borra del tablero.
  const filas = Array.from({ length: 8 }, () => (
    { id: 'p1', nombre: 'Robles Jose Maria', por_cuit: true, familia: null, hubo: true }))
  const [p] = agruparPorProveedor(filas)
  assert.equal(p.compras.length, 8, 'las compras sin clasificar se perdieron en el armado')
  assert.match(deducirRubro(p.compras).evidencia, /8 compras y ninguna con familia de material cargada/)
})

test('un proveedor SIN NINGUNA compra sí dice «sin compras leídas»', () => {
  // La otra mitad: el `left join` deja una fila con familia null, y contarla como compra diría
  // «1 compra y ninguna con familia», que también sería falso. La marca la trae la consulta.
  const [p] = agruparPorProveedor([
    { id: 'p2', nombre: 'NEUMAGOM SAS', por_cuit: false, familia: null, hubo: false },
  ])
  assert.deepEqual(p.compras, [])
  assert.equal(deducirRubro(p.compras).evidencia, 'sin compras leídas')
})

test('el cruce por nombre queda marcado para poder revisarlo primero', () => {
  // 14 de los 36 no tienen CUIT y se cruzan por nombre, que es más débil: dos proveedores con el
  // mismo nombre mezclan sus compras. La marca no arregla el cruce; hace que se pueda auditar.
  const [p] = agruparPorProveedor([
    { id: 'p3', nombre: 'Don Jorge', por_cuit: false, familia: 'Alquiler y traslado de equipos', hubo: true },
  ])
  assert.equal(p.porCuit, false)
})
