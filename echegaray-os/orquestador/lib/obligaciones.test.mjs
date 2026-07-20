#!/usr/bin/env node
// Test de analizarObligaciones (core del estado de obligaciones). Hermético, 0 DB.
import { tipoObligacion, analizarObligaciones } from './obligaciones.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

check('clasifica laboral (Fondo de Cese/UOCRA)', tipoObligacion('Fondo de Cese Laboral / UOCRA') === 'laboral')
check('clasifica impositiva (ARCA)', tipoObligacion('Deuda impositiva (ARCA)') === 'impositiva')
check('clasifica financiera (Banco)', tipoObligacion('Deuda financiera (Banco)') === 'financiera')
check('clasifica comercial', tipoObligacion('Deuda comercial acumulada') === 'comercial')
check('clasifica operativa (alquiler)', tipoObligacion('Alquileres (junio 2026)') === 'operativa')

const hoy = new Date('2026-07-18')
const filas = [
  // FUENTE ÚNICA: `saldo` llega ya calculado desde la vista public.obligacion_resumen
  // (saldo_pendiente = monto_total − pagos aplicados), la misma que consume la web.
  // Este core clasifica y agrega; NO define qué es el saldo.
  { concepto: 'Alquileres', saldo: 2000000, vencimiento: '2026-06-10' },      // vencida
  { concepto: 'Fondo de Cese / UOCRA', saldo: 2000000, vencimiento: '2026-07-25' }, // próx 30 (2,7M − 0,7M pagados)
  { concepto: 'Deuda comercial acumulada', saldo: 20000000, vencimiento: null }, // sin venc
  { concepto: 'Deuda impositiva (ARCA)', saldo: 0, vencimiento: null }, // saldada → excluida
]
const r = analizarObligaciones(hoy, filas)

check('saldo total = 2M+2M+20M (la saldada no cuenta)', r.saldo_total === 24000000)
check('por tipo: comercial 20M el mayor', Object.keys(r.por_tipo)[0] === 'comercial' && r.por_tipo.comercial === 20000000)
check('laboral neto de pago = 2M', r.por_tipo.laboral === 2000000)
check('vencido = 2M (alquiler)', r.vencido === 2000000)
check('entra 30 días = 2M (fondo cese 25/7)', r.entra_30_dias === 2000000)
check('vencidas lista alquiler', r.vencidas.length === 1 && r.vencidas[0].concepto === 'Alquileres')
check('sin_vencimiento = 1 (deuda comercial)', r.sin_vencimiento === 1)
check('obligación saldada NO aparece', !Object.keys(r.por_tipo).includes('impositiva'))

console.log(`\nobligaciones.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
