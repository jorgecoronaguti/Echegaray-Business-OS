// LAS CELDAS DE LA CADENA DE PAGO SON UNA SOLA DEFINICIÓN, Y NO CONFUNDEN HORAS CON PESOS.
//
// Dueño, 11/09/2026, textual: *«no tengo celdas editables, calcula mal»*. Dos defectos: las celdas
// escribibles eran un `<span>` mudo, y HORAS publicaba «$80».
//
// ═══ CAMBIÓ EL 14/09/2026 ═══
//
// La tabla de «Pagos» (`pagos.tsx`) se retiró de «Más» por repetir la Quincena columna por columna, y
// sus tests de estructura se fueron con ella. La edición de esas celdas vive ahora en la Quincena y en
// su panel, con los tests de `solapaQuincena.test.ts`. Acá queda lo que no dependía de esa tabla: el
// formato de las dos unidades y que la celda editable existe una sola vez.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { horas, pesos } from '../formato.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const CELDAS = fuente('../CeldasDeLiquidacion.tsx')

test('LAS HORAS NO LLEVAN SIGNO DE PESOS, Y LOS PESOS SÍ', () => {
  // EL DEFECTO EXACTO QUE EL DUEÑO LEYÓ EN LA PANTALLA: «$80» donde dice 80 horas.
  assert.equal(horas(80), '80')
  assert.equal(pesos(80), '$80')
  // Un decimal cuando existe, ninguno cuando no: la planilla carga 8,8 y 9.
  assert.equal(horas(8.8), '8,8')
  assert.equal(horas(1188), '1.188')
  // R1 · NULL NO ES CERO, en las dos unidades.
  assert.equal(horas(null), '—')
  assert.equal(pesos(null), '—')
})

test('UNA CELDA DE CLIENTE RECIBE UNA UNIDAD, NUNCA UNA FUNCIÓN', () => {
  // React corta con «Functions cannot be passed directly to Client Components» y la pantalla entera
  // queda en blanco. Lo encontró el primer `goto` del E2E del 11/09/2026.
  assert.match(CELDAS, /unidad: UnidadDeCelda/)
  assert.match(fuente('../CuadroLiquidacion.tsx'), /unidad: UnidadDeCelda/)
})

test('UNA SOLA DEFINICIÓN DE LAS CELDAS Y DE LA MARCA DE ORIGEN', () => {
  // EL DEFECTO QUE ATRAPA: copiar `Editable` a otra pantalla. Dos copias son dos formas de marcar lo
  // manual y dos maneras de acusar el error del servidor — y una de las dos no se actualiza nunca.
  assert.match(fuente('../CuadroLiquidacion.tsx'), /from '\.\/CeldasDeLiquidacion'/)
  assert.match(CELDAS, /^'use client'/)
  assert.equal((CELDAS.match(/export function MarcaDeOrigen\(/g) ?? []).length, 1)
  assert.equal((CELDAS.match(/export function Manual\(/g) ?? []).length, 1)
})
