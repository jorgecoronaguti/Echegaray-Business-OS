// EL ESTADO DE LAS COTIZACIONES SE CONTESTA EN PALABRAS — nunca más «el resultado no trae
// lectura en palabras» con el JSON crudo abajo (dueño, 02/09/2026, log vivo de las 18:55).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizarCotizaciones, resumenDeCotizaciones } from './cotizaciones.mjs'

const FILAS = [
  { cliente: 'FRANCO QUATTROPANI', obra_nombre: 'Comercio Minorista - Productos Generales', monto_venta: null, estado: 'borrador', fecha: '01/09/2026' },
  { cliente: 'ARCOR', obra_nombre: 'Ampliación planta', monto_venta: 180000000, estado: 'emitida', fecha: '20/08/2026' },
  { cliente: 'X', obra_nombre: 'Y', monto_venta: 50000000, estado: 'perdida', fecha: '01/08/2026' },
]

test('el resumen dice el estado de la cartera y lista cada presupuesto con su monto o «sin monto»', () => {
  const a = analizarCotizaciones(FILAS)
  const t = resumenDeCotizaciones(a, FILAS)
  assert.match(t, /3 presupuesto\(s\): 2 en juego · 0 ganada\(s\) · 1 perdida\(s\)/)
  assert.match(t, /FRANCO QUATTROPANI — Comercio Minorista - Productos Generales \(sin monto\) · borrador/)
  assert.match(t, /ARCOR — Ampliación planta \(\$180\.000\.000\)/)
})

test('con más de 10 filas se dice cuántas quedan afuera — no se trunca en silencio', () => {
  const muchas = Array.from({ length: 14 }, (_, i) => ({ cliente: `C${i}`, obra_nombre: `O${i}`, monto_venta: 1000, estado: 'borrador', fecha: null }))
  const t = resumenDeCotizaciones(analizarCotizaciones(muchas), muchas)
  assert.match(t, /… y 4 más/)
})

test('cartera vacía: el resumen existe igual y dice cero — no revienta ni inventa', () => {
  const t = resumenDeCotizaciones(analizarCotizaciones([]), [])
  assert.match(t, /0 presupuesto\(s\)/)
})
