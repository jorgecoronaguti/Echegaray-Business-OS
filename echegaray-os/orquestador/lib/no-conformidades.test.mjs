#!/usr/bin/env node
// Test de validación + análisis de no conformidades. Hermético, 0 DB.
import { validarNC, analizarNC } from './no-conformidades.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// validarNC
check('sin descripción → error', validarNC({ descripcion: '' }).ok === false)
check('con descripción alcanza', validarNC({ descripcion: 'hormigón fisurado' }).ok === true)
check('estado default abierta', validarNC({ descripcion: 'x' }).estado === 'abierta')
check('gravedad inválida → error', validarNC({ descripcion: 'x', gravedad: 'zzz' }).ok === false)
check('gravedad con acento/caso: crítica', validarNC({ descripcion: 'x', gravedad: 'Crítica' }).gravedad === 'critica')
check('estado "en tratamiento" → en_tratamiento', validarNC({ descripcion: 'x', estado: 'en tratamiento' }).estado === 'en_tratamiento')

// analizarNC
const filas = [
  { gravedad: 'critica', estado: 'abierta' },
  { gravedad: 'grave', estado: 'abierta' },
  { gravedad: 'leve', estado: 'en_tratamiento' },
  { gravedad: 'moderada', estado: 'cerrada', fecha_deteccion: '2026-07-01', fecha_cierre: '2026-07-11' }, // 10 días
  { gravedad: 'grave', estado: 'cerrada', fecha_deteccion: '2026-07-01', fecha_cierre: '2026-07-05' },    // 4 días
]
const r = analizarNC(filas)
check('total = 5', r.total === 5)
check('abiertas = 3 (incluye en_tratamiento)', r.abiertas === 3)
check('cerradas = 2', r.cerradas === 2)
check('graves/críticas abiertas = 2', r.graves_criticas_abiertas === 2)
check('por gravedad grave = 2', r.por_gravedad.grave === 2)
check('días promedio cierre = 7 ((10+4)/2)', r.dias_promedio_cierre === 7)

console.log(`\nno-conformidades.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
