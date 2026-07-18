#!/usr/bin/env node
// Test del resolver de obras (F0.2). Hermético: mapa de alias inyectado, 0 DB. Verifica que
// las grafías reales resuelven a la obra canónica y que indirectos/excluidos se clasifican bien.
import { normObra, resolverObraCon } from './obras.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// normObra idéntica a la web
check('normObra: LA ESTRELLA → estrella', normObra('LA ESTRELLA') === 'estrella')
check('normObra: San Francisco → san francisco', normObra('San Francisco') === 'san francisco')
check('normObra: acentos', normObra('Cómputo') === 'computo')
check('normObra: vacío', normObra(null) === '')

// mapa como el seed de la migración
const map = new Map([
  ['estrella', { obra_id: 'la-estrella', clasificacion: 'obra' }],
  ['san francisco', { obra_id: 'san-francisco', clasificacion: 'obra' }],
  ['messinas', { obra_id: 'messina', clasificacion: 'obra' }],
  ['messina', { obra_id: 'messina', clasificacion: 'obra' }],
  ['arcor', { obra_id: 'arcor', clasificacion: 'mantenimiento' }],
  ['administracion', { obra_id: null, clasificacion: 'indirecto' }],
  ['f931', { obra_id: null, clasificacion: 'indirecto' }],
  ['le comedor', { obra_id: null, clasificacion: 'excluido' }],
])
const R = (t) => resolverObraCon(map, t)

// las 3 grafías de Estrella → la misma obra
check('LA ESTRELLA → la-estrella', R('LA ESTRELLA').obra_id === 'la-estrella')
check('ESTRELLA → la-estrella', R('ESTRELLA').obra_id === 'la-estrella')
check('Estrella → la-estrella', R('Estrella').obra_id === 'la-estrella')
// San Francisco mayúsculas/minúsculas
check('SAN FRANCISCO → san-francisco', R('SAN FRANCISCO').obra_id === 'san-francisco')
// Messina plural y singular → misma obra
check('MESSINAS → messina', R('MESSINAS').obra_id === 'messina')
check('Messina → messina', R('Messina').obra_id === 'messina')
// ARCOR = mantenimiento (es obra-billable pero tipo distinto)
check('ARCOR → mantenimiento', R('ARCOR').clasificacion === 'mantenimiento' && R('ARCOR').obra_id === 'arcor')
// indirectos NO son obra
check('Administracion → indirecto, sin obra_id', R('Administracion').clasificacion === 'indirecto' && R('Administracion').obra_id === null)
check('F931 → indirecto', R('F931').clasificacion === 'indirecto')
// Lebane excluido
check('LE - Comedor → excluido', R('LE - Comedor').clasificacion === 'excluido')
// desconocido no revienta
check('texto nuevo → desconocido', R('Obra Nueva Cualquiera').clasificacion === 'desconocido' && R('Obra Nueva Cualquiera').resuelto === false)

console.log(`\nobras.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
