#!/usr/bin/env node
// Test de validación + embudo comercial de cotizaciones. Hermético, 0 DB.
import { parseMontoAR, validarCotizacion, analizarCotizaciones } from './cotizaciones.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// parseMontoAR
check('$47.590.271,50 → 47590271.5', parseMontoAR('$47.590.271,50') === 47590271.5)
check('número pasa igual', parseMontoAR(1000000) === 1000000)
check('vacío → null', parseMontoAR('') === null && parseMontoAR(null) === null)

// validarCotizacion
check('sin cliente ni obra → error', validarCotizacion({}).ok === false)
check('con cliente alcanza', validarCotizacion({ cliente: 'ARCOR' }).ok === true)
check('estado inválido → error', validarCotizacion({ cliente: 'x', estado: 'zzz' }).ok === false)
check('estado default emitida', validarCotizacion({ cliente: 'x' }).estado === 'emitida')
const der = validarCotizacion({ cliente: 'x', monto_venta: '1000', costo_estimado: '700' })
check('margen derivado de venta y costo = 30%', der.margen_pct === 30)
check('monto de venta parseado', der.monto_venta === 1000 && der.costo_estimado === 700)
check('margen explícito se respeta', validarCotizacion({ cliente: 'x', monto_venta: '1000', costo_estimado: '700', margen_pct: '25' }).margen_pct === 25)

// analizarCotizaciones — embudo + conversión
const filas = [
  { estado: 'ganada', monto_venta: 10000000, margen_pct: 30 },
  { estado: 'ganada', monto_venta: 5000000, margen_pct: 20 },
  { estado: 'perdida', monto_venta: 8000000, margen_pct: 15 },
  { estado: 'emitida', monto_venta: 3000000, margen_pct: 25 },
  { estado: 'borrador', monto_venta: null, margen_pct: null },
]
const r = analizarCotizaciones(filas)
check('total = 5', r.total === 5)
check('en juego = 2 (emitida+borrador)', r.en_juego === 2)
check('ganadas = 2', r.ganadas === 2)
check('perdidas = 1', r.perdidas === 1)
check('monto ganado = 15M', r.monto_ganado === 15000000)
check('tasa conversión = 66.7% (2 de 3 decididas)', r.tasa_conversion_pct === 66.7)
check('margen promedio = 22.5%', r.margen_promedio_pct === 22.5)

console.log(`\ncotizaciones.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
