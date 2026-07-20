#!/usr/bin/env node
// Test del historial de cotizaciones leído del data room. Hermético, 0 DB.
import { tipoArchivoCotizacion, analizarHistorial, RAIZ_PRESUPUESTOS as R } from './cotizaciones-historial.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

check('planilla xlsm → planilla_cotizacion', tipoArchivoCotizacion('Planilla para Cotizar.xlsm') === 'planilla_cotizacion')
check('presupuesto pdf → presupuesto', tipoArchivoCotizacion('PRESUPUESTO 22917261 - REPARACION.pdf') === 'presupuesto')
check('pliego → pliego', tipoArchivoCotizacion('Pliego espec tec_SJ.pdf') === 'pliego')
check('plano → plano', tipoArchivoCotizacion('PLANO - E-PSMO-0-00-C-PL-1240_B.pdf') === 'plano')
check('adicional → adicional', tipoArchivoCotizacion('Adicional de Obra.pdf') === 'adicional')
check('remito → remito', tipoArchivoCotizacion('REMITO - ALEJANDRO MOLINA.pdf') === 'remito')
check('desconocido → otro', tipoArchivoCotizacion('Capacitacion.pdf') === 'otro')

// Estructura real: PRESUPUESTOS/<CLIENTE>/<TRABAJO>/<archivos>
const filas = [
  { path: R + 'ARCOR - SAN JUAN', name: 'ARCOR - SAN JUAN', is_folder: true, modified_time: '2026-07-07' },
  { path: R + 'ARCOR - SAN JUAN/CISTERNA', name: 'CISTERNA', is_folder: true, modified_time: '2026-07-07' },
  { path: R + 'ARCOR - SAN JUAN/CISTERNA/Planilla para Cotizar.xlsm', name: 'Planilla para Cotizar.xlsm', is_folder: false, modified_time: '2026-07-07' },
  { path: R + 'ARCOR - SAN JUAN/CISTERNA/Adicional de Obra.pdf', name: 'Adicional de Obra.pdf', is_folder: false, modified_time: '2026-07-05' },
  // archivo SUELTO a nivel cliente: NO es un trabajo cotizado (bug detectado en e2e real)
  { path: R + 'ARCOR - SAN JUAN/Capacitacion.pdf', name: 'Capacitacion.pdf', is_folder: false, modified_time: '2026-06-01' },
  { path: R + 'SAINT GOBAIN', name: 'SAINT GOBAIN', is_folder: true, modified_time: '2026-01-19' },
  { path: R + 'SAINT GOBAIN/TECHO', name: 'TECHO', is_folder: true, modified_time: '2026-01-19' },
]
const r = analizarHistorial(filas)
check('2 clientes', r.clientes === 2)
check('2 trabajos (CISTERNA + TECHO), el PDF suelto NO cuenta', r.trabajos_cotizados === 2)
const arcor = r.historial.find((c) => c.cliente === 'ARCOR - SAN JUAN')
check('ARCOR tiene 1 trabajo', arcor.n_trabajos === 1)
check('CISTERNA con 2 archivos', arcor.trabajos[0].archivos === 2)
check('detecta planilla y adicional en el expediente',
  arcor.trabajos[0].tipos.includes('planilla_cotizacion') && arcor.trabajos[0].tipos.includes('adicional'))
check('cliente ordenado por cantidad de trabajos', r.historial[0].n_trabajos >= r.historial[1].n_trabajos)
check('última actividad del cliente', arcor.ultima_actividad === '2026-07-07')

console.log(`\ncotizaciones-historial.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
