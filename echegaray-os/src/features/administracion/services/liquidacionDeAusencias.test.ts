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

test('ya no queda ningún motivo decidido por el OS: la tabla entera la firmó el dueño', () => {
  // DECISIÓN DEL DUEÑO 09/09/2026: lluvia, obra parada y permiso se pagan. Eran los tres últimos
  // `revisar: true`. Si alguien vuelve a marcar uno sin que él lo pida, este test se pone rojo.
  assert.deepEqual(motivosARevisar(), [])
  for (const clave of Object.keys(PAGA_POR_MOTIVO)) {
    assert.equal(PAGA_POR_MOTIVO[clave].revisar, false, clave)
  }
})

test('lluvia, obra parada y permiso pagan por decisión del dueño (09/09), no por criterio del OS', () => {
  for (const clave of ['lluvia', 'sin_tarea', 'permiso']) {
    assert.equal(motivoPaga(clave), true, clave)
    assert.equal(PAGA_POR_MOTIVO[clave].revisar, false, clave)
  }
  // El permiso no tenía test propio de horas: se paga la jornada como cualquier motivo que paga.
  assert.equal(horasDeAusencia({ motivo: 'permiso', jornada: 8 }), 8)
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UN DÍA NO TRABAJADO VALE UN DÍA, NO LA SUMA DE LAS FILAS QUE LO DECLARAN (R4)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ ESTO PUEDE PASAR EN LA BASE REAL, medido el 11/09/2026: el índice único
// `registros_hh_persona_unico` es sobre (obra_canonica_id, persona_id, fecha, actividad, tipo_hora,
// improductiva, causa_desvio) y en Postgres dos NULL no chocan. Las ausencias y las licencias son,
// por definición, las filas que NO llevan obra — siete de la 1ª quincena de septiembre de 2026 están
// en esa condición—, así que son exactamente las que la base deja insertar dos veces.
//
// Con el `reduce` que sumaba, dos licencias «accidente» de 9 h liquidaban 18 h de un solo día.

test('DOS DECLARACIONES DEL MISMO DÍA NO SE SUMAN: nadie está ausente dos veces', () => {
  const dia = [
    { tipo_hora: 'licencia', horas: '9', notas: 'accidente' },
    { tipo_hora: 'licencia', horas: '9', notas: 'accidente' },
  ]
  // EL DEFECTO QUE ATRAPA: 18. Un día de nueve horas pagado dos veces.
  assert.equal(horasLiquidablesDelDia(dia), 9)
})

test('ENTRE DOS DECLARACIONES GANA LA QUE RECONOCE MÁS HORAS', () => {
  // Quedarse con la primera o con la menor le pagaría de menos a alguien por un duplicado que no
  // creó él. La corrección hacia arriba es la que alguien escribió a propósito.
  assert.equal(horasLiquidablesDelDia([
    { tipo_hora: 'licencia', horas: '4', notas: 'enfermedad' },
    { tipo_hora: 'licencia', horas: '9', notas: 'enfermedad' },
  ]), 9)
  // Y una declaración que no paga sigue valiendo 0 aunque tenga horas guardadas al lado.
  assert.equal(horasLiquidablesDelDia([
    { tipo_hora: 'ausencia', horas: '9', notas: 'falta' },
    { tipo_hora: 'ausencia', horas: '9', notas: null },
  ]), 0)
})

test('LO TRABAJADO SIGUE SUMANDO ENTRE OBRAS: el control puede decir sí', () => {
  // Si «no suma nunca» fuera la regla, la persona que repartió el día entre dos obras cobraría la
  // mitad. Este test es el que impide que el arreglo de arriba se coma el caso legítimo.
  assert.equal(horasLiquidablesDelDia([
    { tipo_hora: 'normal', horas: '5', notas: null },
    { tipo_hora: 'normal', horas: '3.8', notas: null },
  ]), 8.8)
})
