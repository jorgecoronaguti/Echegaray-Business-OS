// «No podés dejar cuadros vacíos» (dueño, 29/09/2026). Si una celda vuelve a salir vacía o con raya con los datos
// completos, o se dibuja una sin dato, estos tests se ponen rojos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloquesDeDatos } from './celdasDelReciboContador.ts'
import { datosDelLegajoParaRecibo } from './datosDelReciboContador.ts'
import type { DetalleLaboral } from './detalleLaboral.ts'

const Q1_09 = { desde: '2026-09-01', hasta: '2026-09-15' }
const COMPLETO = {
  legajo: [
    { rotulo: 'CUIL', valor: '20-38218815-3' }, { rotulo: 'Legajo', valor: '66' },
    { rotulo: 'Obra social', valor: '121705 - O.S. DEL PERSONAL DE LA ACTIVIDAD DEL TURF' },
  ],
  laboral: [{ rotulo: 'Oficio', valor: 'ALBAÑIL' }, { rotulo: 'Modalidad', valor: 'hora' }],
  fechaDePago: { fecha: '2026-09-16', origen: 'jornal' },
} as unknown as DetalleLaboral
const RECIBO = { categoria: 'AYUDANTE', valorHora: 5000, sueldoBruto: 400000 }

type Rec = { categoria: string | null; valorHora: number | null; sueldoBruto: number | null }
const celdasDe = (detalle: DetalleLaboral | undefined, ingreso: string | null, recibo: Rec = RECIBO) => {
  const d = datosDelLegajoParaRecibo(detalle, Q1_09, ingreso)
  return bloquesDeDatos(recibo, { nombre: 'ALANIZ JUAN', ingreso, ...d }, Q1_09)
}

test('con los datos completos, las 17 celdas salen con valor: ni vacías ni con raya', () => {
  const todas = celdasDe(COMPLETO, '2026-01-12').flat()
  assert.equal(todas.length, 17, todas.map((c) => c[0]).join(', '))
  for (const [rotulo, valor] of todas) {
    assert.ok(valor.trim() !== '', `${rotulo} vacía`)
    assert.ok(!/^[—-]$/.test(valor.trim()) && !valor.includes('—'), `${rotulo} con raya: ${valor}`)
  }
})

test('sin dato la celda no se dibuja, y un bloque sin celdas desaparece', () => {
  const sin = celdasDe(undefined, null, { categoria: null, valorHora: null, sueldoBruto: null })
  const rotulos = sin.flat().map((c) => c[0])
  for (const r of ['N° LEGAJO', 'C.U.I.L.', 'FECHA INGRESO', 'ANTIGÜEDAD', 'OBRA SOCIAL', 'REM. ASIGNADA', 'SUELDO BRUTO', 'CATEGORÍA LABORAL']) {
    assert.ok(!rotulos.includes(r), `${r} se dibuja sin dato`)
  }
  assert.ok(sin.every((b) => b.length > 0), 'un bloque vacío quedó en el papel')
  assert.ok(rotulos.includes('APELLIDO Y NOMBRE'))
})

test('las celdas sin fuente en ninguna tabla se retiraron del papel, no quedan como hueco', () => {
  const rotulos = celdasDe(COMPLETO, '2026-01-12').flat().map((c) => c[0])
  for (const r of ['FECHA RECONOCIDA', 'F. PAGO APORTES', 'BANCO', 'SECCIÓN']) assert.ok(!rotulos.includes(r), r)
})
