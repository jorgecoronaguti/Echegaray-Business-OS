import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NO_VINO, SIN_NOVEDAD, TRABAJO,
  estadoElegidoDeCelda, opcionesDeEstadoDeCelda, planDeCelda,
} from './edicionDeCelda.ts'

const base = {
  fecha: '2026-09-08', hoy: '2026-09-10',
  obraOrigen: 'obra-1', obraDestino: 'obra-1',
}

test('un día pasado con horas se guarda como trabajado en la obra del día', () => {
  const r = planDeCelda({ ...base, estado: TRABAJO, horas: '9' })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && r.correccion, {
    fecha: '2026-09-08', obra_origen: 'obra-1', obra_destino: 'obra-1',
    estado: 'presente', horas: 9, motivo: null,
  })
})

test('LA COMA DEL TECLADO ES UN NÚMERO: «8,5» son 8,5 horas, no un error', () => {
  const r = planDeCelda({ ...base, estado: TRABAJO, horas: '8,5' })
  assert.equal(r.ok && r.correccion.horas, 8.5)
})

// EL DEFECTO QUE ATRAPA: sin esta regla, el casillero de un viernes que todavía no llegó acepta
// «9» y le mete costo de mano de obra a una obra por trabajo que nadie hizo. Ese número entra en el
// costo por obra y en la quincena que se paga.
test('LAS HORAS TRABAJADAS A FUTURO SE RECHAZAN, y el mensaje dice por qué', () => {
  const r = planDeCelda({ ...base, fecha: '2026-09-11', estado: TRABAJO, horas: '9' })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /todavía no pasó/i)
  assert.match(r.ok ? '' : r.error, /licencia o una ausencia/i)
})

test('el día de HOY no es futuro: sus horas se cargan', () => {
  const r = planDeCelda({ ...base, fecha: base.hoy, estado: TRABAJO, horas: '9' })
  assert.equal(r.ok, true)
})

test('una licencia a futuro SÍ se programa, y viaja sin obra y sin horas', () => {
  const r = planDeCelda({ ...base, fecha: '2026-09-30', estado: `${NO_VINO}:enfermedad`, horas: '' })
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.correccion.estado, 'ausente')
  assert.equal(r.ok && r.correccion.motivo, 'enfermedad')
  // LA AUSENCIA ES DE LA PERSONA (dueño, 08/09/2026): sin obra, y las horas las resuelve el
  // servidor con la tabla que dice qué motivo se paga. Mandar el número de la celda reconocería
  // horas por un día que la regla puede no pagar.
  assert.equal(r.ok && r.correccion.obra_destino, null)
  assert.equal(r.ok && r.correccion.horas, null)
})

test('«sin novedad» a futuro libera el día: ni ausencia, ni cero horas', () => {
  const r = planDeCelda({ ...base, fecha: '2026-09-30', estado: SIN_NOVEDAD, horas: '9' })
  assert.deepEqual(r.ok && r.correccion, {
    fecha: '2026-09-30', obra_origen: 'obra-1', obra_destino: null,
    estado: 'sin_novedad', horas: null, motivo: null,
  })
})

test('sin obra destino no se cargan horas: no habría a quién imputarle el costo', () => {
  const r = planDeCelda({ ...base, obraOrigen: null, obraDestino: null, estado: TRABAJO, horas: '9' })
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /obra activa/i)
})

test('cero horas no es una marca y el campo vacío tampoco', () => {
  assert.equal(planDeCelda({ ...base, estado: TRABAJO, horas: '0' }).ok, false)
  assert.equal(planDeCelda({ ...base, estado: TRABAJO, horas: '  ' }).ok, false)
})

test('un estado que no está en la lista no escribe nada', () => {
  const r = planDeCelda({ ...base, estado: 'lo_que_sea', horas: '9' })
  assert.equal(r.ok, false)
})

test('el desplegable ofrece trabajó, cada motivo con su tipo, y sin novedad', () => {
  const o = opcionesDeEstadoDeCelda()
  assert.equal(o[0].valor, TRABAJO)
  assert.equal(o[o.length - 1].valor, SIN_NOVEDAD)
  const enfermedad = o.find((x) => x.valor === `${NO_VINO}:enfermedad`)
  assert.ok(enfermedad, 'el catálogo tiene que ofrecer enfermedad')
  assert.match(enfermedad.etiqueta, /^Licencia · /)
  const falta = o.find((x) => x.valor === `${NO_VINO}:falta`)
  assert.match(falta?.etiqueta ?? '', /^Ausente · /)
})

test('el desplegable muestra lo que ya está guardado', () => {
  assert.equal(estadoElegidoDeCelda({ estado: 'horas', motivo: null }), TRABAJO)
  assert.equal(estadoElegidoDeCelda({ estado: 'sin_marcar', motivo: null }), SIN_NOVEDAD)
  assert.equal(estadoElegidoDeCelda({ estado: 'futuro', motivo: null }), SIN_NOVEDAD)
  const licencia = opcionesDeEstadoDeCelda().find((x) => x.valor === `${NO_VINO}:enfermedad`)
  const etiqueta = (licencia?.etiqueta ?? '').split(' · ')[1]
  assert.equal(estadoElegidoDeCelda({ estado: 'licencia', motivo: etiqueta }), `${NO_VINO}:enfermedad`)
})

// UN MOTIVO QUE NO SE RECONOCE NO SE ADIVINA. Elegir el «parecido» escribiría en el legajo de
// alguien una causa que nadie declaró.
test('un motivo que no está en el catálogo deja el desplegable sin elegir', () => {
  assert.equal(estadoElegidoDeCelda({ estado: 'ausente', motivo: 'lo que sea' }), '')
  assert.equal(planDeCelda({ ...base, estado: '', horas: '' }).ok, false)
})
