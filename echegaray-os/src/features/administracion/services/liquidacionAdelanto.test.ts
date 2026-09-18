import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claseDelMovimiento, restasDeLaPersona, validarAdelanto, type MovimientoDeAdelanto,
} from './liquidacionAdelanto.ts'
import { estadoDeTarifa, reliquidaAlCambiarTarifa, validarTarifa } from './liquidacionTarifa.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Un giro previo al lote registrado como ADELANTO. El total a pagar no cambia, pero el lote de
//     haberes deja de conciliar contra el extracto y nadie puede decir cuál número está mal (R5).
//  2. Un adelanto fechado FUERA de la quincena: se resta de un cobro que no le corresponde y deja
//     dos quincenas mal sin que ninguna lo diga.
//  3. Una tarifa con valor hora Y neto mensual, o sin ninguno de los dos. El CHECK de la base la
//     rechaza con un error que nadie puede leer.
//  4. Cambiar la tarifa y que se reliquide una quincena CERRADA: mueve plata ya entregada (R6).

const QUINCENA = { desde: '2026-09-01', hasta: '2026-09-15' }

test('efectivo siempre es adelanto, sin importar la fecha', () => {
  assert.equal(claseDelMovimiento({ canal: 'efectivo', fecha: '2026-09-03' }, '2026-09-10'), 'adelanto')
  assert.equal(claseDelMovimiento({ canal: 'efectivo', fecha: '2026-09-14' }, '2026-09-10'), 'adelanto')
})

test('un giro ANTES de armar el lote es «ya transferido», no adelanto (R5)', () => {
  assert.equal(claseDelMovimiento({ canal: 'banco', fecha: '2026-09-03' }, '2026-09-10'), 'ya_transferido')
  assert.equal(claseDelMovimiento({ canal: 'banco', fecha: '2026-09-12' }, '2026-09-10'), 'adelanto')
})

test('sin lote armado todavía, cualquier giro es previo por definición', () => {
  assert.equal(claseDelMovimiento({ canal: 'banco', fecha: '2026-09-12' }, null), 'ya_transferido')
})

const PERSONA = '9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d'

test('un adelanto fuera de la quincena se rechaza y dice por qué', () => {
  const r = validarAdelanto({
    personaId: PERSONA, quincena: QUINCENA, fecha: '2026-08-29', importe: '100.000', canal: 'efectivo', nota: '',
  })
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.error : '', /fuera de la quincena/)
})

test('un adelanto válido queda con importe numérico, quincena y nota nula si estaba vacía', () => {
  const r = validarAdelanto({
    personaId: PERSONA, quincena: QUINCENA, fecha: '2026-09-05', importe: '$ 100.000,50', canal: 'banco', nota: '  ',
  })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.deepEqual(r.adelanto, {
      personaId: PERSONA, quincena: '2026-09-01', fecha: '2026-09-05',
      importe: 100000.5, canal: 'banco', nota: null,
    })
  }
})

test('un adelanto de $ 0 no es un adelanto', () => {
  const r = validarAdelanto({
    personaId: PERSONA, quincena: QUINCENA, fecha: '2026-09-05', importe: '0', canal: 'efectivo', nota: '',
  })
  assert.equal(r.ok, false)
})

test('la columna ADELANTO suma los de la persona en SU quincena, partido en las dos columnas', () => {
  const movs: MovimientoDeAdelanto[] = [
    { personaId: 'p1', quincena: '2026-09-01', fecha: '2026-09-03', importe: 100000, canal: 'efectivo', clase: 'adelanto' },
    { personaId: 'p1', quincena: '2026-09-01', fecha: '2026-09-04', importe: 40000, canal: 'banco', clase: 'ya_transferido' },
    { personaId: 'p1', quincena: '2026-08-16', fecha: '2026-08-20', importe: 999999, canal: 'efectivo', clase: 'adelanto' },
    { personaId: 'p2', quincena: '2026-09-01', fecha: '2026-09-03', importe: 777777, canal: 'efectivo', clase: 'adelanto' },
  ]
  assert.deepEqual(restasDeLaPersona(movs, 'p1', '2026-09-01'), { adelanto: 100000, yaTransferido: 40000 })
  assert.deepEqual(restasDeLaPersona(movs, 'p9', '2026-09-01'), { adelanto: 0, yaTransferido: 0 })
})

test('la tarifa es valor hora O neto mensual, nunca las dos ni ninguna', () => {
  const base = { desde: '2026-09-01', origen: 'acuerdo con el dueño 09/09' }
  assert.equal(validarTarifa({ ...base, valorHora: '3650', netoMensual: '900000' }).ok, false)
  assert.equal(validarTarifa({ ...base, valorHora: null, netoMensual: null }).ok, false)
  assert.equal(validarTarifa({ ...base, valorHora: '3.650', netoMensual: '' }).ok, true)
  assert.equal(validarTarifa({ ...base, valorHora: '', netoMensual: '900.000' }).ok, true)
})

test('una tarifa sin origen no se guarda: ningún importe sin origen', () => {
  const r = validarTarifa({ valorHora: '3650', netoMensual: null, desde: '2026-09-01', origen: ' ' })
  assert.equal(r.ok, false)
})

test('sin tarifa la persona no vale $ 0: vale «sin tarifa»', () => {
  assert.deepEqual(estadoDeTarifa(null), { tipo: 'sin_tarifa' })
  assert.deepEqual(
    estadoDeTarifa({ valorHora: 3650, netoMensual: null, desde: '2026-09-01', origen: 'legajo' }),
    { tipo: 'hora', valorHora: 3650, desde: '2026-09-01', origen: 'legajo' },
  )
})

test('cambiar la tarifa NO reliquida una quincena cerrada (R6)', () => {
  assert.equal(reliquidaAlCambiarTarifa('cerrada'), false)
  assert.equal(reliquidaAlCambiarTarifa('abierta'), true)
})

// ═══ EL IMPORTE SE LEE EN ES-AR (auditoría del deshacer, 18/09/2026) ═══
//
// El lector viejo borraba TODOS los puntos antes de leer: «150000.50» salía 15.000.050 y «8.5», 85. Estos casos dan
// rojo con ese código: pasan sólo con `leerNumeroEsAR`.
const conImporte = (importe: string) => validarAdelanto({
  personaId: PERSONA, quincena: QUINCENA, fecha: '2026-09-05', importe, canal: 'efectivo', nota: '',
})

test('UN PUNTO DECIMAL NO MULTIPLICA EL ADELANTO: «150000.50» es 150.000,50, no 15.000.050', () => {
  const r = conImporte('150000.50')
  assert.ok(r.ok)
  assert.equal(r.ok && r.adelanto.importe, 150000.5, 'MUTACIÓN: borrar todos los puntos multiplica por 100')
  const chico = conImporte('8.5')
  assert.equal(chico.ok && chico.adelanto.importe, 8.5, 'MUTACIÓN: «8.5» leído 85')
})

test('LOS MILES CON PUNTO Y LOS DECIMALES CON COMA SIGUEN LEYÉNDOSE IGUAL', () => {
  const miles = conImporte('150.000')
  assert.equal(miles.ok && miles.adelanto.importe, 150000)
  const conCentavos = conImporte('$ 150.000,50')
  assert.equal(conCentavos.ok && conCentavos.adelanto.importe, 150000.5)
})

test('LO QUE NO ES UN NÚMERO SE RECHAZA CON SU MOTIVO, NO SE QUEDA CON LOS DÍGITOS SUELTOS', () => {
  for (const malo of ['1.5.0', '15o.000', '150.000,5,0']) {
    const r = conImporte(malo)
    assert.equal(r.ok, false, `«${malo}» no es un importe`)
    assert.match(!r.ok ? r.error : '', /no es un número/)
  }
  // VACÍO SIGUE SIENDO «FALTA», no «inválido».
  const vacio = conImporte('  ')
  assert.equal(!vacio.ok && vacio.error, 'Escribí el importe.')
})
