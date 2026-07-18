#!/usr/bin/env node
// Test de validación + embudo de adicionales. Hermético, 0 DB.
import { validarAdicional, analizarAdicionales } from './adicionales.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

check('detectado sin monto es válido', validarAdicional({ concepto: 'muro extra', estado: 'detectado' }).ok === true)
check('sin concepto → error', validarAdicional({ concepto: '', estado: 'detectado' }).ok === false)
check('aprobado SIN monto → error', validarAdicional({ concepto: 'x', estado: 'aprobado' }).ok === false)
check('aprobado con monto es-AR', validarAdicional({ concepto: 'x', estado: 'aprobado', monto: '$1.500.000' }).monto === 1500000)
check('estado inválido → error', validarAdicional({ concepto: 'x', estado: 'inventado' }).ok === false)
check('estado default detectado', validarAdicional({ concepto: 'x' }).estado === 'detectado')

const filas = [
  { monto_cotizado: 1000, monto_aprobado: 1000, monto_facturado: 1000, monto_cobrado: 1000 }, // full
  { monto_cotizado: 2000, monto_aprobado: 2000, monto_facturado: 0, monto_cobrado: 0 },        // aprobado sin cobrar
  { monto_cotizado: 500, monto_aprobado: 0, monto_facturado: 0, monto_cobrado: 0 },            // solo detectado/cotizado
]
const r = analizarAdicionales(filas)
check('detectados = 3', r.detectados === 3)
check('aprobados = 2 ($3000)', r.aprobados === 2 && r.monto_aprobado === 3000)
check('cobrados = 1 ($1000)', r.cobrados === 1 && r.monto_cobrado === 1000)
check('sin cobrar = 2000', r.monto_sin_cobrar === 2000)
check('% cobrado sobre aprobado = 33.3%', r.pct_cobrado_sobre_aprobado === 33.3)

console.log(`\nadicionales.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
