#!/usr/bin/env node
// Test de agregarCostos (capacidad de costo por obra). Hermético: aliasMap + filas inyectadas, 0 DB.
import { agregarCostos } from './obra-costos.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

const map = new Map([
  ['estrella', { obra_id: 'la-estrella', clasificacion: 'obra' }],
  ['san francisco', { obra_id: 'san-francisco', clasificacion: 'obra' }],
  ['arcor', { obra_id: 'arcor', clasificacion: 'mantenimiento' }],
  ['administracion', { obra_id: null, clasificacion: 'indirecto' }],
  ['le comedor', { obra_id: null, clasificacion: 'excluido' }],
])
const filas = [
  { obra_texto: 'LA ESTRELLA', categoria: 'Materiales', proveedor: 'Hormiserv', total: 100 },
  { obra_texto: 'ESTRELLA', categoria: 'Materiales', proveedor: 'Hormiserv', total: 50 },
  { obra_texto: 'Estrella', categoria: 'Mano de obra', proveedor: 'Subcontrato X', total: 30 },
  { obra_texto: 'San Francisco', categoria: 'Materiales', proveedor: 'Acme', total: 200 },
  { obra_texto: 'ARCOR', categoria: 'Servicio', proveedor: 'Y', total: 40 },
  { obra_texto: 'Administracion', categoria: 'Sueldos', proveedor: null, total: 999 },
  { obra_texto: 'LE - Comedor', categoria: 'x', proveedor: null, total: 777 },
  { obra_texto: 'Obra Nueva', categoria: 'x', proveedor: null, total: 5 },
]
const { porObra, buckets } = agregarCostos(map, filas)

// las 3 grafías de Estrella suman en la MISMA obra
check('estrella suma 3 grafías (100+50+30=180)', porObra.get('la-estrella').total === 180)
check('estrella n=3', porObra.get('la-estrella').n === 3)
// breakdown por categoría dentro de la obra
check('estrella Materiales=150', porObra.get('la-estrella').categorias.get('Materiales') === 150)
check('estrella proveedor Hormiserv=150', porObra.get('la-estrella').proveedores.get('Hormiserv') === 150)
// san francisco
check('san francisco=200', porObra.get('san-francisco').total === 200)
// mantenimiento (ARCOR) entra por obra_id Y suma al bucket mantenimiento
check('arcor por obra=40', porObra.get('arcor').total === 40)
check('bucket mantenimiento=40', buckets.mantenimiento === 40)
// indirectos/excluidos/desconocidos NO ensucian las obras
check('indirecto=999', buckets.indirecto === 999)
check('excluido=777', buckets.excluido === 777)
check('desconocido=5', buckets.desconocido === 5)
check('indirectos NO están en porObra', !porObra.has(null) && porObra.size === 3)

console.log(`\nobra-costos.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
