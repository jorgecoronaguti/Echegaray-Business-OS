import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jornadaPorDefecto } from './jornadaPorDefecto.ts'
import {
  PAGA_POR_MOTIVO, horasDeAusencia, horasLiquidablesDelDia, motivoPaga, motivosARevisar,
} from './liquidacionDeAusencias.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN: que una ausencia vuelva a llevar horas por el solo hecho de
// ser una ausencia.
//
// Regla del dueño, 08/09/2026 18:50, textual: *«no quiero que al momento de hacer una liquidación de
// hs las ausencias y licencias sean un conflicto de hs que se suman y que no. Ausencia sin motivo es
// cero hs»*. Antes de este trabajo, `horasDeLaAusencia` devolvía SIEMPRE la jornada —el CHECK de la
// base exigía `horas > 0`—, así que el que faltó sin avisar se liquidaba igual que el que tenía
// parte médico. Si alguien revierte la regla, el primer test se pone rojo.

test('ausencia SIN motivo: cero horas', () => {
  assert.equal(horasDeAusencia({ tipo: 'ausencia', motivo: null, jornada: 9 }), 0)
  assert.equal(horasDeAusencia({ tipo: 'ausencia', motivo: '', jornada: 9 }), 0, 'vacío es sin motivo')
  assert.equal(horasDeAusencia({ tipo: 'ausencia', motivo: '   ', jornada: 9 }), 0, 'espacios tampoco')
  assert.equal(horasDeAusencia({ tipo: 'ausencia', motivo: undefined, jornada: 9 }), 0)
})

test('los motivos que el dueño nombró como no pagos valen cero, aunque haya jornada', () => {
  for (const clave of ['falta', 'falta_con_aviso', 'suspension', 'paro', 'otro']) {
    assert.equal(horasDeAusencia({ motivo: clave, jornada: 9 }), 0, clave)
  }
})

test('suspensión es tipo LICENCIA y aun así no se paga: decide el motivo, no el tipo_hora', () => {
  // La trampa: `tipoDeMotivo('suspension')` devuelve `licencia` —tiene acta y respaldo—. Una regla
  // escrita como «toda licencia paga jornada» le pagaría el día al suspendido.
  assert.equal(horasDeAusencia({ tipo: 'licencia', motivo: 'suspension', jornada: 9 }), 0)
})

test('enfermedad vale la jornada del día; un viernes son 8 y no 9', () => {
  assert.equal(horasDeAusencia({ motivo: 'enfermedad', jornada: jornadaPorDefecto('2026-09-09') }), 9, 'miércoles')
  assert.equal(horasDeAusencia({ motivo: 'enfermedad', jornada: jornadaPorDefecto('2026-09-11') }), 8, 'viernes')
})

test('sin jornada de referencia (sábado) cae a la estándar, no a cero', () => {
  // El sábado no tiene jornada por defecto. Cero acá sería fabricar la regla contraria: el motivo
  // paga, lo que falta es la cifra.
  assert.equal(horasDeAusencia({ motivo: 'vacaciones', jornada: jornadaPorDefecto('2026-09-12') }), 8)
  assert.equal(horasDeAusencia({ motivo: 'vacaciones', jornada: null }), 8)
})

test('una cifra tipeada a mano gana sobre la jornada del día', () => {
  assert.equal(horasDeAusencia({ motivo: 'permiso', jornada: 4 }), 4, 'medio día de permiso')
})

test('un motivo que no está en el catálogo no paga: lo que no se sabe no se paga', () => {
  assert.equal(motivoPaga('se_fue_a_pescar'), false)
  assert.equal(horasDeAusencia({ motivo: 'estuvo enfermo (texto libre viejo)', jornada: 9 }), 0)
})

test('licencia con motivo y sin horas cargadas: la jornada entera', () => {
  for (const clave of ['enfermedad', 'accidente', 'accidente_in_itinere', 'vacaciones', 'licencia_especial']) {
    assert.equal(horasDeAusencia({ tipo: 'licencia', motivo: clave, jornada: 9 }), 9, clave)
  }
})

test('franco/feriado, lluvia y obra parada pagan el jornal', () => {
  assert.equal(horasDeAusencia({ motivo: 'franco', jornada: 9 }), 9)
  assert.equal(horasDeAusencia({ motivo: 'lluvia', jornada: 9 }), 9)
  assert.equal(horasDeAusencia({ motivo: 'sin_tarea', jornada: 9 }), 9)
})

test('lo que el dueño no dijo explícito queda marcado para que lo ajuste él', () => {
  const claves = motivosARevisar().map((m) => m.clave).sort()
  assert.deepEqual(claves, ['lluvia', 'permiso', 'sin_tarea'])
  // Y nada de lo que él SÍ dijo puede estar marcado: eso convertiría su decisión en provisoria.
  assert.equal(PAGA_POR_MOTIVO.falta.revisar, false)
  assert.equal(PAGA_POR_MOTIVO.enfermedad.revisar, false)
})

// ── UN MISMO DÍA NUNCA SUMA DOS VECES ──────────────────────────────────────────────────────────

test('día con horas trabajadas Y ausencia declarada: se liquidan sólo las trabajadas', () => {
  const dia = [
    { tipo_hora: 'normal', horas: 8, notas: null },
    { tipo_hora: 'ausencia', horas: 9, notas: 'enfermedad' },
  ]
  // 17 es el defecto que este trabajo saca: las dos filas sumadas. 8 es el día real.
  assert.equal(horasLiquidablesDelDia(dia), 8)
})

test('las extras del día trabajado sí suman', () => {
  const dia = [
    { tipo_hora: 'normal', horas: '8', notas: null },
    { tipo_hora: 'extra_50', horas: '2', notas: null },
    { tipo_hora: 'ausencia', horas: '9', notas: 'falta' },
  ]
  assert.equal(horasLiquidablesDelDia(dia), 10)
})

test('una falta vieja guardada con 9 horas se liquida en 0 sin tocar la base', () => {
  // Las filas escritas antes del 08/09/2026 llevan la jornada adentro porque el CHECK la exigía.
  // Si la lectura se creyera el número guardado, esos días se seguirían pagando.
  assert.equal(horasLiquidablesDelDia([{ tipo_hora: 'ausencia', horas: 9, notas: 'falta' }]), 0)
})

test('una licencia con motivo que paga se liquida con la cifra guardada', () => {
  assert.equal(horasLiquidablesDelDia([{ tipo_hora: 'licencia', horas: '4.5', notas: 'enfermedad' }]), 4.5)
})

test('un día sin nada cargado vale cero horas', () => {
  assert.equal(horasLiquidablesDelDia([]), 0)
})
