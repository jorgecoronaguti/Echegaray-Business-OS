// EL MAPEO CAMPO DEL PAPEL → FUENTE DEL RECIBO EN BLANCO. Defecto (dueño, 29/09/2026): diez celdas salían «—»
// aunque el legajo las tenía. Si alguien deja de leer un campo del legajo, o lo lee de otro rótulo, cae acá.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { antiguedadAl, datosDelLegajoParaRecibo } from './datosDelReciboContador.ts'
import type { DetalleLaboral } from './detalleLaboral.ts'

// Alaniz, legajo 66 (persona_legajo, 29/09/2026).
const ALANIZ = {
  legajo: [
    { rotulo: 'CUIL', valor: '20-38218815-3' },
    { rotulo: 'Legajo', valor: '66' },
    { rotulo: 'Obra social', valor: '121705 - O.S. DEL PERSONAL DE LA ACTIVIDAD DEL TURF' },
  ],
  laboral: [{ rotulo: 'Oficio', valor: 'ALBAÑIL' }, { rotulo: 'Modalidad', valor: 'hora' }, { rotulo: 'Categoría', valor: 'ayudante' }],
} as unknown as DetalleLaboral
const Q2_09 = { desde: '2026-09-16', hasta: '2026-09-30' }

test('cada celda sale de su campo del legajo', () => {
  const d = datosDelLegajoParaRecibo(ALANIZ, Q2_09, '2026-01-12')
  assert.equal(d.obraSocial, '121705 - O.S. DEL PERSONAL DE LA ACTIVIDAD DEL TURF')
  assert.equal(d.calificacion, 'ALBAÑIL')
  assert.equal(d.modalidad, 'Por hora')
  assert.equal(d.antiguedad, '8 meses')
  assert.equal(d.periodo, '09/2026')
  assert.equal(d.legajo, '66')
  assert.match(d.lugarDePago, /CAPITAL/)
})

test('lo que ninguna tabla guarda queda null, nunca inventado', () => {
  const d = datosDelLegajoParaRecibo(ALANIZ, Q2_09, '2026-01-12')
  assert.equal(d.fechaReconocida, null)
  assert.equal(d.banco, null)
  assert.equal(d.seccion, null)
})

test('sin legajo cargado los campos son null, no vacío', () => {
  const d = datosDelLegajoParaRecibo(undefined, Q2_09, null)
  assert.equal(d.obraSocial, null)
  assert.equal(d.antiguedad, null)
  const blanco = { ...ALANIZ, legajo: [{ rotulo: 'Obra social', valor: '  ' }] } as unknown as DetalleLaboral
  assert.equal(datosDelLegajoParaRecibo(blanco, Q2_09, null).obraSocial, null)
})

test('antigüedad: meses cumplidos, años y meses, la reconocida gana al ingreso', () => {
  assert.equal(antiguedadAl('2026-09-30', null, '2026-01-12'), '8 meses')
  assert.equal(antiguedadAl('2026-09-30', null, '2026-09-20'), 'menos de 1 mes')
  assert.equal(antiguedadAl('2026-09-15', null, '2025-08-20'), '1 año')
  assert.equal(antiguedadAl('2026-09-30', null, '2024-06-01'), '2 años 3 meses')
  assert.equal(antiguedadAl('2026-09-30', '2020-09-30', '2026-01-12'), '6 años')
  assert.equal(antiguedadAl('2026-09-30', null, '2027-01-01'), null)
})

test('el papel lee de este mapeo, y el servicio pide obra_social a persona_legajo', () => {
  const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
  assert.match(src('../components/liquidacion/cuadro/ReciboEnBlanco.tsx'), /datosDelLegajoParaRecibo\(detalle/)
  const g = src('./grillaHorasQuincenaService.ts')
  assert.match(g, /modalidad_liquidacion, obra_social, notas/)
  assert.match(g, /rotulo: 'Obra social'/)
})
