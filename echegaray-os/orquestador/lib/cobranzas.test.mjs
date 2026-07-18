#!/usr/bin/env node
// Test de analizarCobranzas (core de la capacidad). Hermético, 0 DB.
import { analizarCobranzas } from './cobranzas.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

const hoy = new Date('2026-07-18')
const filas = [
  // cobrada: DSO = 20/2 - 20/12 = 62 días aprox (para el promedio)
  { estado: 'Cobrado', total_bruto: 1000, fecha_emision: '2026-01-01', fecha_cobro: '2026-01-31' }, // DSO 30
  { estado: 'Efectivo', total_bruto: 500, fecha_emision: '2026-01-01', fecha_cobro: '2026-01-11' },  // DSO 10
  // por cobrar, VENCIDA (fecha_cobro pasada)
  { estado: 'Pendiente', total_bruto: 2000, fecha_emision: '2026-05-01', fecha_cobro: '2026-07-01', obra_cliente: 'ARCOR' },
  // por cobrar, entra en 7 días
  { estado: 'Facturado', total_bruto: 800, fecha_emision: '2026-07-01', fecha_cobro: '2026-07-20', obra_cliente: 'San Francisco' },
  // por cobrar, futuro lejano
  { estado: 'Proyectado', total_bruto: 400, fecha_emision: '2026-07-10', fecha_cobro: '2026-09-01', obra_cliente: 'X' },
]
const r = analizarCobranzas(hoy, filas)

check('cobrado = 1000+500', r.cobrado === 1500)
check('por cobrar = 2000+800+400', r.por_cobrar === 3200)
check('vencido = 2000 (pendiente con fecha pasada)', r.vencido === 2000)
check('entra 7 dias = 800 (fac 20/7)', r.entra_7_dias === 800)
check('DSO = (30+10)/2 = 20', r.dso_dias === 20)
check('n cobradas = 2', r.n_cobradas === 2)
check('vencidas lista ARCOR', r.vencidas.length === 1 && r.vencidas[0].obra === 'ARCOR' && r.vencidas[0].monto === 2000)
check('futuro lejano NO cuenta como vencido ni prox7', r.vencido === 2000 && r.entra_7_dias === 800)

console.log(`\ncobranzas.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
