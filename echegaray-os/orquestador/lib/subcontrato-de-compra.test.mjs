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
//   · UNA RECLASIFICACIÓN POR TEXTO. Cambio de contrato (auditor, 14/09/2026): la rama «familia
//     Subcontratos y mano de obra» se fue porque es un regex sobre el concepto y tomaba a Corralón
//     Progreso ($47.461,82 de cal y tanza). Sólo reclasifica el proveedor que el dueño marcó.
//   · UNA INFERENCIA SILENCIOSA: `rubro_deducido`, el concepto o una cuenta de prueba no reclasifican.
//   · UNA LIQUIDACIÓN FINAL COMO SUBCONTRATO (Castro fue empleado): el costo directo no lee recibos.
//   · DOS REGLAS EN SQL: la ficha por obra y la fila «sin obra» usan el mismo bloque.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { costoDirectoDeCompras, motivoDeSubcontrato } from './subcontrato-de-compra.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const migracion = (n) => readFileSync(join(DIR, `../../supabase/migrations/${n}`), 'utf8')
const bloques = (sql, marca) => [...sql.matchAll(new RegExp(`-- ${marca} ▼([\\s\\S]*?)-- ${marca} ▲`, 'g'))]
  .map((m) => m[1].replace(/\s+/g, ' ').trim())

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

test('el TEXTO no reclasifica: la familia «Subcontratos y mano de obra» sin proveedor marcado queda en Materiales', () => {
  assert.equal(motivoDeSubcontrato(fila({ proveedor: 'Lucas Guzman', familia_material: 'Subcontratos y mano de obra' }), CTX), null)
  const corralon = fila({ proveedor: 'Corralon Progreso', familia_material: 'Subcontratos y mano de obra', total: 47_461.82 })
  assert.equal(motivoDeSubcontrato(corralon, CTX), null, 'Corralón Progreso vendió cal y tanza')
  assert.equal(costoDirectoDeCompras([corralon], CTX).materiales, 47_461.82)
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
  assert.equal(despues.subcontratos, 2_700_000 + 1_040_000)
  assert.equal(despues.materiales, 78_400 + 400_000)
  assert.equal(despues.comprometidoFuturo, 5_000)
})

test('CASTRO: sus compras son subcontrato; su liquidación final no — el costo directo no lee recibos ni nómina', () => {
  assert.equal(motivoDeSubcontrato(fila({ proveedor: 'Gerson Castro', familia_material: 'Plomería, agua y cloacas' }), CTX), 'proveedor')
  for (const n of ['20260915T0810_subcontratos_por_obra.sql', '20260915T0815_estructura_fuera_del_costo_de_obra.sql']) {
    const funciones = migracion(n).split('CREATE OR REPLACE FUNCTION public.').slice(1)
    assert.equal(funciones.length, 2, n)
    for (const f of funciones) {
      assert.match(f, /c\.area is distinct from 'personas'/, `${n}: la nómina (sueldos, SAC, F931) entraría como compra`)
      assert.doesNotMatch(f, /recibo_sueldo_linea|liquidacion_linea|nomina_recibo_neto/, `${n}: un recibo no es una compra`)
    }
  }
})

test('ESTRUCTURA: Administración, Taller, Impuestos y Financiero no suman a ninguna columna de la obra', () => {
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

test('SQL 0810: la regla es SÓLO el proveedor declarado, el mismo bloque en las dos funciones, sin Estructura', () => {
  const sql = migracion('20260915T0810_subcontratos_por_obra.sql')
  const b = bloques(sql, 'REGLA SUBCONTRATO')
  assert.equal(b.length, 2, 'la regla tiene que estar en costo_de_obras_a_la_fecha y en compras_sin_obra_de_clientes')
  assert.equal(b[0], b[1], 'las dos funciones dejaron de usar la misma regla')
  assert.match(b[0], /p\.rubro = 'Subcontratista'/)
  assert.match(b[0], /coalesce\(p\.es_prueba, false\) = false/)
  assert.doesNotMatch(b[0], /familia_material/, 'volvió la reclasificación por texto')
  assert.doesNotMatch(b[0], /rubro_deducido/, 'un rubro deducido no puede reclasificar')
  // LA INVARIANTE DE ESTA MIGRACIÓN ES materiales + subcontratos: Estructura vive en la 0815.
  assert.equal(bloques(sql, 'REGLA ESTRUCTURA').length, 0, 'Estructura volvió a mezclarse con la reclasificación')
})

test('SQL 0815: excluye Estructura en las dos funciones con el MISMO bloque, listo para `destino`', () => {
  const sql = migracion('20260915T0815_estructura_fuera_del_costo_de_obra.sql')
  const e = bloques(sql, 'REGLA ESTRUCTURA')
  assert.equal(e.length, 2)
  assert.equal(e[0], e[1])
  assert.match(e[0], /upper\(btrim\(coalesce\(c\.unidad_negocio, ''\)\)\) not in \('ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO'\)/)
  assert.match(e[0], /to_jsonb\(s\) ->> 'destino'/)
  assert.match(e[0], /'ES-ADM', 'ES-TAL', 'IMP', 'FIN'/)
  // Y LA REGLA DE SUBCONTRATO ES LA MISMA QUE LA DE LA 0810: la 0815 no la reescribe distinta.
  assert.deepEqual(bloques(sql, 'REGLA SUBCONTRATO'), bloques(migracion('20260915T0810_subcontratos_por_obra.sql'), 'REGLA SUBCONTRATO'))
})
