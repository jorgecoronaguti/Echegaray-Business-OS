#!/usr/bin/env node
// Test de analizarProveedores (core de la inteligencia de compras). Hermético, 0 DB.
import { analizarProveedores } from './compras-proveedores.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

const hoy = new Date('2026-07-18')
const filas = [
  { emisor_nombre: 'ALUMETAL S A', emisor_cuit: '30-1', imp_total: 1000, fecha_emision: '2026-07-15' },
  { emisor_nombre: 'ALUMETAL S A', emisor_cuit: '30-1', imp_total: 3000, fecha_emision: '2026-05-01' },
  { emisor_nombre: 'FEMENIA', emisor_cuit: '30-2', imp_total: 500, fecha_emision: '2026-06-01' },
  { emisor_nombre: 'TRIELEC', emisor_cuit: '30-3', imp_total: 500, fecha_emision: '2026-03-01' },
]
const r = analizarProveedores(hoy, filas)

check('total general = 5000', r.total_general === 5000)
check('3 proveedores', r.n_proveedores === 3)
check('4 facturas', r.n_facturas === 4)
check('ALUMETAL primero (mayor gasto)', r.proveedores[0].proveedor === 'ALUMETAL S A' && r.proveedores[0].total === 4000)
check('ALUMETAL n=2, promedio 2000', r.proveedores[0].n_facturas === 2 && r.proveedores[0].promedio === 2000)
check('ALUMETAL último 15/07 (el más reciente de sus 2)', r.proveedores[0].ultimo === '2026-07-15' && r.proveedores[0].dias_desde_ultimo === 3)
check('concentración top1 = ALUMETAL 80%', r.concentracion.top1_nombre === 'ALUMETAL S A' && Math.round(r.concentracion.top1_pct * 100) === 80)
check('dias_desde_ultimo TRIELEC (1/3 → 139 días)', r.proveedores.find(p => p.proveedor === 'TRIELEC').dias_desde_ultimo === 139)

console.log(`\ncompras-proveedores.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
