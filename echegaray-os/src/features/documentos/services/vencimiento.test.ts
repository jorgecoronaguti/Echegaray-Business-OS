// EL DEFECTO QUE ATRAPA: que la pantalla diga «guardado» sin haber guardado, y que un día que no
// existe en el calendario se corra en silencio a otro día.
//
//  1 · `new Date('2026-02-31')` NO FALLA en JavaScript: devuelve el 3 de marzo. Un vencimiento
//      cargado mal y corrido sin avisar es una libreta que se cree vigente días de más.
//  2 · POSTGREST DEVUELVE 204 IGUAL cuando la RLS filtró la fila y no escribió nada. `error` es
//      null en los dos casos. El único hecho que prueba la escritura es la fila releída.
//  3 · VACÍO ES BORRAR, no un error de validación: un vencimiento cargado por equivocación se saca.
//  4 · LA VENTANA «ESTE MES» ES EL MES CALENDARIO, no 30 días. En un 28 las dos respuestas son
//      distintas, y quien mira la banda pregunta por lo que tiene que renovar antes de cerrar el mes.

import test from 'node:test'
import assert from 'node:assert/strict'
import { leerVencimiento, veredictoDeRelectura } from './vencimiento.ts'
import { estadoVigencia, ventanaVencimientos } from './documentos.ts'

// ── LA FECHA QUE LLEGA DEL FORMULARIO ─────────────────────────────────────────────────────────

test('el 31 de febrero se rechaza en vez de correrse al 3 de marzo', () => {
  const r = leerVencimiento('2026-02-31')
  assert.equal(r.ok, false, 'guardó una fecha que el calendario no tiene')
  // La prueba de que el peligro es real: JavaScript no protesta y devuelve otro día.
  assert.equal(new Date('2026-02-31T00:00:00Z').toISOString().slice(0, 10), '2026-03-03')
})

test('el 29 de febrero vale en año bisiesto y no en el otro', () => {
  assert.deepEqual(leerVencimiento('2028-02-29'), { ok: true, fecha: '2028-02-29' })
  assert.equal(leerVencimiento('2026-02-29').ok, false)
})

test('vacío BORRA el vencimiento: no es un error', () => {
  assert.deepEqual(leerVencimiento(''), { ok: true, fecha: null })
  assert.deepEqual(leerVencimiento('   '), { ok: true, fecha: null })
})

test('lo que no es un día del calendario no llega a la base', () => {
  assert.equal(leerVencimiento('21/08/2026').ok, false, 'el formato es AAAA-MM-DD, no es-AR')
  assert.equal(leerVencimiento('mañana').ok, false)
  assert.equal(leerVencimiento('2026-13-01').ok, false, 'aceptó el mes 13')
  assert.equal(leerVencimiento('2026-00-10').ok, false, 'aceptó el mes 0')
})

test('una fecha buena se guarda tal cual, sin husos que la corran un día', () => {
  assert.deepEqual(leerVencimiento('2026-09-04'), { ok: true, fecha: '2026-09-04' })
})

// ── LA RELECTURA, QUE ES LO QUE PRUEBA LA ESCRITURA ───────────────────────────────────────────

test('si la fila releída no trae lo que se pidió, NO se contesta ok', () => {
  // El caso exacto de la RLS: se pidió el 04/09, la base sigue sin vencimiento y no hubo error.
  const r = veredictoDeRelectura('2026-09-04', null)
  assert.equal(r.ok, false, 'el 204 de PostgREST se leyó como éxito')
  assert.match(r.ok === false ? r.error : '', /sigue con sin vencimiento/)
})

test('si la fila no aparece al releerla, tampoco se contesta ok', () => {
  const r = veredictoDeRelectura('2026-09-04', undefined)
  assert.equal(r.ok, false, 'no poder leer la fila se dibujó como guardado')
  assert.match(r.ok === false ? r.error : '', /administraci/i)
})

test('el borrado se verifica igual que la carga', () => {
  assert.deepEqual(veredictoDeRelectura(null, null), { ok: true })
  const r = veredictoDeRelectura(null, '2026-09-04')
  assert.equal(r.ok, false, 'dijo que borró y la fecha seguía ahí')
})

test('la fecha que vuelve con hora pegada se compara igual', () => {
  assert.deepEqual(veredictoDeRelectura('2026-09-04', '2026-09-04T00:00:00+00:00'), { ok: true })
})

// ── LA VENTANA DE LA BANDA DE ALERTAS ─────────────────────────────────────────────────────────

test('«este mes» termina el último día del mes, no a los 30 días', () => {
  assert.deepEqual(ventanaVencimientos('2026-08-21'), { desde: '2026-08-21', hasta: '2026-08-31' })
  // Un 28: «30 días» habría contestado por el mes siguiente.
  assert.deepEqual(ventanaVencimientos('2026-08-28'), { desde: '2026-08-28', hasta: '2026-08-31' })
})

test('febrero y el bisiesto salen bien sin una tabla de largos de mes', () => {
  assert.equal(ventanaVencimientos('2026-02-03').hasta, '2026-02-28')
  assert.equal(ventanaVencimientos('2028-02-03').hasta, '2028-02-29')
})

test('el borde del año no se sale del año', () => {
  assert.deepEqual(ventanaVencimientos('2026-12-15'), { desde: '2026-12-15', hasta: '2026-12-31' })
})

test('la ventana acepta un ISO con hora y devuelve días, no instantes', () => {
  assert.deepEqual(ventanaVencimientos('2026-08-21T18:42:00.000Z'), { desde: '2026-08-21', hasta: '2026-08-31' })
})

// ── LA VIGENCIA SIGUE SIN AFIRMARSE SOLA ──────────────────────────────────────────────────────

test('cargar la fecha es lo que enciende el estado: sin ella no se afirma nada', () => {
  // Es el par que cierra el circuito de esta tarea: `leerVencimiento` produce lo que
  // `estadoVigencia` consume, y sin fecha el estado sigue siendo «no se sabe».
  assert.equal(estadoVigencia(null, '2026-08-21'), null)
  const cargada = leerVencimiento('2026-08-12')
  assert.equal(cargada.ok && estadoVigencia(cargada.fecha, '2026-08-21'), 'vencido')
})
