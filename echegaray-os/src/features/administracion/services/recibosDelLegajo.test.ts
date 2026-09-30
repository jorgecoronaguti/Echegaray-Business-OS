import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodoDeLinea, periodoDelNombre, unirRecibos, type ReciboDelEstudio } from './recibosDelLegajo.ts'
import { VISTAS_FICHA } from './vistasFicha.ts'
import type { ReciboEnElLegajo } from './reciboEmitido.ts'

const est = (o: Partial<ReciboDelEstudio>): ReciboDelEstudio => ({
  documentoId: o.documentoId ?? 'd', nombre: null, driveFileId: null, fechaDocumento: null,
  periodoLinea: null, neto: null, ...o,
})

// Sólo los campos que la función mira; el resto del recibo no le importa.
const emi = (o: Partial<ReciboEnElLegajo> & { id: string }): ReciboEnElLegajo => ({
  estado: 'emitido', firmadoEn: null, papelSubidoEn: null, papelSinFotoEn: null,
  quincenaDesde: '2026-09-01', quincenaHasta: '2026-09-15', emitidoEn: '2026-09-16T10:00:00Z', total: 1000,
  ...o,
}) as unknown as ReciboEnElLegajo

test('los blancos entran todos; de la app sólo los firmados (teléfono, papel con foto, papel sin foto)', () => {
  const f = unirRecibos({
    estudio: [est({ documentoId: 'a', driveFileId: 'A', periodoLinea: 'Q1-09/2026', neto: 500 })],
    emitidos: [
      emi({ id: 'sin-firma' }),
      emi({ id: 'tel', firmadoEn: '2026-09-17T12:00:00Z', estado: 'firmado_telefono' }),
      emi({ id: 'foto', papelSubidoEn: '2026-09-17T12:00:00Z' }),
      emi({ id: 'sinfoto', papelSinFotoEn: '2026-09-17T12:00:00Z', estado: 'firmado_papel' }),
    ],
  })
  const ids = f.filter((x) => x.origen === 'liquidacion').map((x) => x.clave)
  assert.deepEqual(ids.sort(), ['liquidacion:foto', 'liquidacion:sinfoto', 'liquidacion:tel'])
  assert.equal(f.filter((x) => x.origen === 'estudio').length, 1)
})

test('orden por período descendente, mezclando orígenes; la liquidación final va después de la 2.ª quincena del mes', () => {
  const f = unirRecibos({
    estudio: [
      est({ documentoId: '1', driveFileId: '1', periodoLinea: 'Q1-08/2026' }),
      est({ documentoId: '2', driveFileId: '2', periodoLinea: 'FINAL-08/2026' }),
      est({ documentoId: '3', driveFileId: '3', periodoLinea: 'Q2-08/2026' }),
    ],
    emitidos: [emi({ id: 'x', firmadoEn: 'z', quincenaDesde: '2026-09-01', quincenaHasta: '2026-09-15' })],
  })
  assert.deepEqual(f.map((x) => x.rotulo), [
    '01/09 al 15/09/2026', 'Liquidación final 08/2026', '2.ª quincena 08/2026', '1.ª quincena 08/2026',
  ])
})

test('misma quincena en los dos orígenes: NO se funden (son dos papeles), el del estudio va primero', () => {
  const f = unirRecibos({
    estudio: [est({ driveFileId: 'A', periodoLinea: 'Q1-09/2026' })],
    emitidos: [emi({ id: 'x', firmadoEn: 'z' })],
  })
  assert.deepEqual(f.map((x) => x.origen), ['estudio', 'liquidacion'])
})

test('el mismo archivo vinculado dos veces al legajo no se repite; dos reemisiones firmadas sí quedan', () => {
  const f = unirRecibos({
    estudio: [est({ documentoId: '1', driveFileId: 'A' }), est({ documentoId: '2', driveFileId: 'A' })],
    emitidos: [
      emi({ id: 'v1', firmadoEn: 'z', emitidoEn: '2026-09-16T10:00:00Z' }),
      emi({ id: 'v2', firmadoEn: 'z', emitidoEn: '2026-09-18T10:00:00Z' }),
    ],
  })
  assert.equal(f.filter((x) => x.origen === 'estudio').length, 1)
  assert.deepEqual(f.filter((x) => x.origen === 'liquidacion').map((x) => x.clave), ['liquidacion:v2', 'liquidacion:v1'])
})

test('el período sale de la línea leída del PDF antes que del nombre del archivo, y sin ambos no se inventa', () => {
  const f = unirRecibos({
    estudio: [
      est({ driveFileId: 'A', nombre: 'Recibo 2026-07 Q1 · X.pdf', periodoLinea: 'Q2-08/2026' }),
      est({ driveFileId: 'B', nombre: 'scan raro.pdf', fechaDocumento: '2025-03-10' }),
    ],
    emitidos: [],
  })
  assert.equal(f[0].rotulo, '2.ª quincena 08/2026')
  assert.equal(f[1].rotulo, 'scan raro.pdf')
  assert.equal(f[1].desde, '2025-03-10')
})

test('períodos: Q2 de febrero termina el 28, y lo que no es período da null', () => {
  assert.equal(periodoDeLinea('Q2-02/2026')?.hasta, '2026-02-28')
  assert.equal(periodoDeLinea('Q1-13/2026'), null)
  assert.equal(periodoDeLinea('FINAL'), null)
  assert.equal(periodoDelNombre('Liquidación final 2026-08 · X'), 'FINAL-08/2026')
})

test('«Recibos» es solapa de primer nivel del legajo', () => {
  assert.ok((VISTAS_FICHA as readonly string[]).includes('recibos'))
})
