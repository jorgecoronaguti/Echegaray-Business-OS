// EL MAPEO CAMPO DEL PAPEL → FUENTE DEL RECIBO EN BLANCO. Defecto (dueño, 29/09/2026): diez celdas salían «—»
// aunque el legajo las tenía. Si alguien deja de leer un campo del legajo, o lo lee de otro rótulo, cae acá.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { antiguedadAl, datosDelLegajoParaRecibo } from './datosDelReciboContador.ts'
import { detalleLaboralDe, type DetalleLaboral } from './detalleLaboral.ts'
import { armarPersona } from './grillaHorasQuincenaService.ts'
import { fechaDePagoDe } from './fechaDePagoDelRecibo.ts'

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
  assert.equal(d.calificacion, 'ALBAÑIL*')
  assert.equal(d.modalidad, 'Por hora')
  assert.equal(d.antiguedad, '8 meses*')
  assert.equal(d.periodo, '09/2026')
  assert.equal(d.legajo, '66')
  assert.match(d.lugarYFechaDePago, /CAPITAL\*$/, 'sin fecha real: sólo el lugar marcado como inferido, sin raya')
})

test('lo que ninguna tabla guarda no existe en el contrato: la celda se retiró del papel', () => {
  const d = datosDelLegajoParaRecibo(ALANIZ, Q2_09, '2026-01-12')
  for (const k of ['fechaReconocida', 'banco', 'seccion']) assert.equal(k in d, false, k)
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

const RECIBO = { cuil: '20382188153', periodo: 'Q2-09/2026', neto: 100000, fecha_pago: '2026-09-30' }

test('la fecha de pago: el recibo de ESA persona y período manda; luego la quincena; si no, null', () => {
  const base = { cuil: '20-38218815-3', periodo: 'Q2-09/2026', jornalFechaPago: '2026-10-02' }
  assert.deepEqual(fechaDePagoDe({ ...base, recibos: [RECIBO] }), { fecha: '2026-09-30', origen: 'recibo' })
  const otra = [{ ...RECIBO, cuil: '20111111112' }, { ...RECIBO, periodo: 'Q1-09/2026' }, { ...RECIBO, fecha_pago: null }]
  assert.deepEqual(fechaDePagoDe({ ...base, recibos: otra }), { fecha: '2026-10-02', origen: 'jornal' })
  assert.equal(fechaDePagoDe({ ...base, recibos: otra, jornalFechaPago: null }), null)
})

test('de la fila de la base al papel: la fecha del recibo sale sin marca; la inferida, con marca y nota', () => {
  const persona = armarPersona(
    { id: 'p1', nombre_completo: 'Alaniz', en_la_empresa: true, categoria: 'ayudante', especialidad: 'ALBAÑIL', puesto: null,
      fecha_ingreso: '2026-01-12', fecha_egreso: null, cuadrilla: null, obra_actual: null, rol_en_obra: null, asignada_desde: null, legajo: 66 },
    { id: 'p1', dni: null, cuil: '20-38218815-3', fecha_nacimiento: null, nacionalidad: null, telefono: null, email: null, domicilio: null,
      contacto_emergencia: null, convenio_colectivo: null, modalidad_liquidacion: 'HORA', obra_social: '121705 - TURF', notas: null },
    null, [], { desde: Q2_09.desde, hasta: Q2_09.hasta } as never, new Map(), null, [],
  )
  const con = (fechaDePago: ReturnType<typeof fechaDePagoDe>) => datosDelLegajoParaRecibo(
    detalleLaboralDe({ persona, multiplicador: null, fechaDePago }), Q2_09, '2026-01-12')
  const real = con({ fecha: '2026-09-30', origen: 'recibo' })
  assert.equal(real.legajo, '66')
  assert.equal(real.cuil, '20-38218815-3')
  assert.equal(real.obraSocial, '121705 - TURF')
  assert.equal(real.modalidad, 'Por hora')
  assert.equal(real.calificacion, 'ALBAÑIL*')
  assert.equal(real.lugarYFechaDePago, 'AV. RIOJA NORTE 75 - CAPITAL*, 30/09/2026', 'la fecha del recibo es un hecho: sin asterisco')
  assert.equal(real.notasInferidas.length, 3, 'calificación, antigüedad y lugar; la fecha real no suma nota')
  const supuesta = con({ fecha: '2026-10-02', origen: 'jornal' })
  assert.match(supuesta.lugarYFechaDePago, /, 02\/10\/2026\*$/)
  assert.equal(supuesta.notasInferidas.filter((n) => n.startsWith('FECHA DE PAGO')).length, 1)
  assert.doesNotMatch(con(null).lugarYFechaDePago, /—|, $/)
})

test('todo dato marcado con «*» tiene su nota, y ningún dato ausente se marca', () => {
  const d = datosDelLegajoParaRecibo(ALANIZ, Q2_09, '2026-01-12')
  const marcados = [d.calificacion, d.antiguedad, d.lugarYFechaDePago].filter((v) => v?.includes('*'))
  assert.equal(marcados.length, d.notasInferidas.length)
  const vacio = datosDelLegajoParaRecibo(undefined, Q2_09, null)
  assert.equal(vacio.calificacion, null)
  assert.equal(vacio.antiguedad, null)
  assert.equal(vacio.notasInferidas.length, 1, 'sólo el lugar, que siempre es el domicilio del empleador')
})
