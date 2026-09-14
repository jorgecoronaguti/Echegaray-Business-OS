// QUÉ COMPRA ES UN SUBCONTRATO — la regla y la invariante del costo directo (dueño, 14/09/2026).
//
// «tenes q considerar a los subcontratos q aparecen en pestaña compras q se le imputa como gasto directo
// de materiales o mano de obra quiero columna subcontrato en crm admin clientes y q lo discrimine».
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//   · UN SUBCONTRATISTA DECLARADO QUE CAE EN MATERIALES: Pedro Tello «Hormigonado 600 m²» tiene familia
//     «Hormigón y premoldeados» y se sumaba como material.
//   · UNA RECLASIFICACIÓN QUE DUPLICA O PIERDE: materiales + subcontratos es el mismo número antes y
//     después; sólo cambia de columna.
//   · UNA INFERENCIA SILENCIOSA: un proveedor con `rubro_deducido` (no declarado), un concepto que dice
//     «montaje» o una cuenta de prueba NO reclasifican.
//   · DOS REGLAS EN SQL: la ficha por obra y la fila «sin obra» usan el mismo bloque.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { costoDirectoDeCompras, motivoDeSubcontrato } from './subcontrato-de-compra.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))

const PROVEEDORES = [
  { id: 'tello', nombre: 'Pedro Tello', razon_social: null, cuit: null, rubro: 'Subcontratista', rubro_deducido: null, es_prueba: false },
  { id: 'castro', nombre: 'Gerson Castro', razon_social: 'CASTRO GALVAN GERSON ULISES', cuit: '20277987016', rubro: 'Subcontratista', rubro_deducido: 'Materiales', es_prueba: false },
  { id: 'angel', nombre: 'Angel Fernandez', razon_social: null, cuit: null, rubro: null, rubro_deducido: 'Subcontratista', es_prueba: false },
  { id: 'qa', nombre: 'Proveedor QA', razon_social: null, cuit: null, rubro: 'Subcontratista', rubro_deducido: null, es_prueba: true },
  { id: 'fredes', nombre: 'Fredes Pedro (alias)', razon_social: null, cuit: null, rubro: 'Subcontratista', rubro_deducido: null, es_prueba: false },
]
const ALIAS = [{ proveedor_id: 'fredes', nombre_norm: 'PEDRO FREDES', estado: 'vinculado' }]
const CTX = { proveedores: PROVEEDORES, alias: ALIAS, corte: '2026-09-14' }

const fila = (extra) => ({ proveedor: null, cuit: null, familia_material: null, total: 0, fecha: '2026-08-27', comprobante: null, ...extra })

test('un subcontratista DECLARADO va a Subcontratos aunque la familia diga Hormigón', () => {
  const f = fila({ proveedor: 'PEDRO TELLO', familia_material: 'Hormigón y premoldeados', total: 2_700_000, comprobante: 'X 0001-00000042' })
  assert.equal(motivoDeSubcontrato(f, CTX), 'proveedor')
  const c = costoDirectoDeCompras([f], CTX)
  assert.equal(c.materiales, null, 'un subcontrato no se suma en Materiales')
  assert.equal(c.subcontratos, 2_700_000)
  assert.deepEqual(c.detalle.map((d) => [d.proveedor, d.comprobante, d.total, d.motivo]), [['PEDRO TELLO', 'X 0001-00000042', 2_700_000, 'proveedor']])
})

test('se cruza por CUIT, por razón social y por alias vinculado', () => {
  assert.equal(motivoDeSubcontrato(fila({ proveedor: 'CASTRO G.', cuit: '20-27798701-6', familia_material: 'Plomería, agua y cloacas' }), CTX), 'proveedor')
  assert.equal(motivoDeSubcontrato(fila({ proveedor: ' castro galvan  gerson ulises ' }), CTX), 'proveedor')
  assert.equal(motivoDeSubcontrato(fila({ proveedor: 'Pedro Fredes', familia_material: 'Hierro y malla' }), CTX), 'proveedor')
})

test('la familia «Subcontratos y mano de obra» sigue siendo subcontrato', () => {
  assert.equal(motivoDeSubcontrato(fila({ proveedor: 'Lucas Guzman', familia_material: 'Subcontratos y mano de obra' }), CTX), 'familia')
})

test('un DUDOSO no se reclasifica: rubro deducido, concepto «montaje» o cuenta de prueba quedan en Materiales', () => {
  const dudosas = [
    fila({ proveedor: 'Angel Fernandez', familia_material: 'Chapa, perfiles y estructura metálica', total: 544_500 }),
    fila({ proveedor: 'Proveedor QA', familia_material: 'Hormigón y premoldeados', total: 10 }),
    fila({ proveedor: 'Leandro Rojas', familia_material: 'Servicios de obra (baño, contenedor, agua)', total: 350_000 }),
  ]
  for (const f of dudosas) assert.equal(motivoDeSubcontrato(f, CTX), null, f.proveedor)
  const c = costoDirectoDeCompras(dudosas, CTX)
  assert.equal(c.subcontratos, null)
  assert.equal(c.materiales, 894_510)
})

test('INVARIANTE: reclasificar no cambia materiales + subcontratos, sólo la columna', () => {
  const filas = [
    fila({ proveedor: 'PEDRO TELLO', familia_material: 'Hormigón y premoldeados', total: 2_700_000 }),
    fila({ proveedor: 'Pedro Fredes', familia_material: 'Hierro y malla', total: 1_040_000 }),
    fila({ proveedor: 'Corralon', familia_material: 'Cemento, cal y áridos', total: 78_400 }),
    fila({ proveedor: 'Lucas Guzman', familia_material: 'Subcontratos y mano de obra', total: 400_000 }),
    fila({ proveedor: 'Corralon', familia_material: 'Cemento, cal y áridos', total: 5_000, fecha: '2026-10-01' }),
  ]
  const antes = costoDirectoDeCompras(filas, { ...CTX, proveedores: [], alias: [] })
  const despues = costoDirectoDeCompras(filas, CTX)
  assert.equal((antes.materiales ?? 0) + (antes.subcontratos ?? 0), (despues.materiales ?? 0) + (despues.subcontratos ?? 0))
  assert.equal(despues.subcontratos, 2_700_000 + 1_040_000 + 400_000)
  assert.equal(despues.materiales, 78_400)
  // LO FUTURO NO SUMA EN NINGUNA: viaja aparte, como antes.
  assert.equal(despues.comprometidoFuturo, 5_000)
})

test('ESTRUCTURA: Administración, Taller, Impuestos y Financiero no suman a ninguna columna de la obra', () => {
  // «tenemos q considerar la unidad de negocio estructura taller admin, al momento de asignar un gasto».
  const filas = [
    fila({ proveedor: 'Corralon', familia_material: 'Cemento, cal y áridos', total: 100, unidad_negocio: 'Civil' }),
    fila({ proveedor: 'Leandro Rojas', familia_material: 'Servicios de obra (baño, contenedor, agua)', total: 350_000, unidad_negocio: 'Estructura' }),
    fila({ proveedor: 'PEDRO TELLO', familia_material: 'Hormigón y premoldeados', total: 7, unidad_negocio: ' ESTRUCTURA ' }),
    fila({ proveedor: 'ARCA', total: 25_000, unidad_negocio: 'Impuestos' }),
    fila({ proveedor: 'Banco', total: 9, unidad_negocio: 'Financiero' }),
    fila({ proveedor: 'Repuestos', total: 11, unidad_negocio: 'Civil', destino: 'ES-TAL' }),
  ]
  const c = costoDirectoDeCompras(filas, CTX)
  assert.equal(c.materiales, 100)
  assert.equal(c.subcontratos, null, 'un subcontratista cargado a Estructura tampoco entra a la obra')
  assert.equal(c.estructura, 350_000 + 7 + 25_000 + 9 + 11, 'lo de estructura se cuenta aparte, no se pierde')
})

test('SQL: la ficha por obra y la fila sin obra excluyen Estructura con el MISMO bloque, listo para `destino`', () => {
  const sql = readFileSync(join(DIR, '../../supabase/migrations/20260915T0600_subcontratos_por_obra.sql'), 'utf8')
  const bloques = [...sql.matchAll(/-- REGLA ESTRUCTURA ▼([\s\S]*?)-- REGLA ESTRUCTURA ▲/g)].map((m) => m[1].replace(/\s+/g, ' ').trim())
  assert.equal(bloques.length, 2)
  assert.equal(bloques[0], bloques[1])
  assert.match(bloques[0], /upper\(btrim\(coalesce\(c\.unidad_negocio, ''\)\)\) not in \('ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO'\)/)
  // LA COLUMNA `destino` DE feat/obra-por-fila: se lee si existe, sin romper si todavía no.
  assert.match(bloques[0], /to_jsonb\(s\) ->> 'destino'/)
  assert.match(bloques[0], /'ES-ADM', 'ES-TAL', 'IMP', 'FIN'/)
})

test('SQL: la ficha por obra y la fila sin obra usan el MISMO bloque de la regla', () => {
  const sql = readFileSync(join(DIR, '../../supabase/migrations/20260915T0600_subcontratos_por_obra.sql'), 'utf8')
  const bloques = [...sql.matchAll(/-- REGLA SUBCONTRATO ▼([\s\S]*?)-- REGLA SUBCONTRATO ▲/g)].map((m) => m[1].replace(/\s+/g, ' ').trim())
  assert.equal(bloques.length, 2, 'la regla tiene que estar en costo_de_obras_a_la_fecha y en compras_sin_obra_de_clientes')
  assert.equal(bloques[0], bloques[1], 'las dos funciones dejaron de usar la misma regla')
  assert.match(bloques[0], /p\.rubro = 'Subcontratista'/)
  assert.match(bloques[0], /coalesce\(p\.es_prueba, false\) = false/)
  assert.doesNotMatch(bloques[0], /rubro_deducido/, 'un rubro deducido no puede reclasificar')
})
