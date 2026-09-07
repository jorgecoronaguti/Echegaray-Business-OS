import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarJornada, avisoDeFaltantes, hs, leerHoras, resumenJornada, sobreLaJornada,
} from './jornadaPorObra.ts'
import type { PersonaDeLaObra, RegistroDelDia } from './jornadaPorObra.ts'

// La obra del ejemplo: jornada pactada de 8,8 hs (`obra_canonica.jornada_horas` de las nueve obras
// activas al 07/09/2026). El número entra por parámetro a propósito: si mañana una obra pacta otra,
// la pantalla la respeta sin tocar una línea.
const JORNADA = 8.8

const p = (id: string, nombre: string, nota: string | null = null): PersonaDeLaObra =>
  ({ persona_id: id, nombre, nota })
const reg = (
  persona_id: string, horas: number, tipo_hora = 'normal', id = `r-${persona_id}-${tipo_hora}`,
): RegistroDelDia => ({ id, persona_id, fecha: '2026-09-07', horas, tipo_hora, notas: null })

const PLANTEL = [p('a', 'González'), p('b', 'Molina'), p('c', 'Ríos', 'capataz')]

test('SIN MARCAR NO ES AUSENTE: la fila sin registro no cuenta como falta ni como cero', () => {
  // El defecto que atrapa: convertir el silencio en una novedad de liquidación. Si `sin_marcar`
  // cayera en `ausentes`, o si `horas` volviera 0 en vez de null, la pantalla afirmaría que Molina
  // faltó cuando lo único cierto es que nadie lo marcó.
  const filas = armarJornada({ personas: PLANTEL, registros: [reg('a', 5)], jornada: JORNADA })
  const molina = filas.find((f) => f.persona.persona_id === 'b')!
  assert.equal(molina.estado, 'sin_marcar')
  assert.equal(molina.horas, null)

  const r = resumenJornada(filas)
  assert.equal(r.ausentes, 0)
  assert.equal(r.sinMarcar, 2)
  assert.deepEqual(r.faltan, ['Molina', 'Ríos'])
})

test('LA CASILLA VIENE PUESTA CON LA JORNADA DE LA OBRA, no con un 8 hardcodeado', () => {
  const filas = armarJornada({ personas: [p('a', 'González')], registros: [], jornada: JORNADA })
  assert.equal(filas[0].propuesta, 8.8)
  // Otra obra, otra jornada: el mismo código tiene que devolver el número de ESA obra.
  const otra = armarJornada({ personas: [p('a', 'González')], registros: [], jornada: 4 })
  assert.equal(otra[0].propuesta, 4)
})

test('LO YA CARGADO GANA SOBRE LA PROPUESTA: González hizo 5 y la casilla dice 5', () => {
  // El defecto que atrapa: reabrir el día y ver 8,8 encima de las 5 que ya se habían corregido.
  // Guardar sin tocar nada volvería a poner la jornada completa y borraría la excepción.
  const filas = armarJornada({ personas: [p('a', 'González')], registros: [reg('a', 5)], jornada: JORNADA })
  assert.equal(filas[0].estado, 'presente')
  assert.equal(filas[0].horas, 5)
  assert.equal(filas[0].propuesta, 5)
  assert.equal(filas[0].registroId, 'r-a-normal')
})

test('UNA AUSENCIA TIENE HORAS Y NO ES TRABAJO: no suma al total del día', () => {
  // `registros_hh` exige horas > 0, así que el ausente se guarda con las horas de la jornada y
  // tipo_hora='ausencia'. Si el total las sumara, un día con un ausente y siete presentes daría más
  // horas de las que se trabajaron — y eso viaja al costo de la obra.
  const filas = armarJornada({
    personas: PLANTEL,
    registros: [reg('a', 8.8), reg('b', 8.8, 'ausencia'), reg('c', 8.8)],
    jornada: JORNADA,
  })
  const molina = filas.find((f) => f.persona.persona_id === 'b')!
  assert.equal(molina.estado, 'ausente')
  assert.equal(molina.horas, 0)

  const r = resumenJornada(filas)
  assert.equal(r.presentes, 2)
  assert.equal(r.ausentes, 1)
  assert.equal(r.horas, 17.6, 'las 8,8 del ausente no pueden entrar en el total')
})

test('EL AUSENTE GANA SOBRE UNA IMPUTACIÓN VIEJA DEL MISMO DÍA', () => {
  // El defecto que atrapa: alguien cargó horas, después se declaró la ausencia, y la pantalla sigue
  // mostrando «presente» porque encontró primero la fila de horas.
  const filas = armarJornada({
    personas: [p('a', 'González')],
    registros: [reg('a', 8.8), reg('a', 8.8, 'ausencia')],
    jornada: JORNADA,
  })
  assert.equal(filas[0].estado, 'ausente')
  assert.equal(resumenJornada(filas).horas, 0)
})

test('CON DOS FILAS TRABAJADAS EL DÍA NO TIENE UN REGISTRO QUE CORREGIR', () => {
  // Normales + extras cargadas aparte suman 10,8. Devolver el id de la primera haría que corregir a
  // 9 dejara la fila de extras en pie: el día terminaría con 11 horas en vez de 9.
  const filas = armarJornada({
    personas: [p('a', 'González')],
    registros: [reg('a', 8.8), reg('a', 2, 'extra_50')],
    jornada: JORNADA,
  })
  assert.equal(filas[0].horas, 10.8)
  assert.equal(filas[0].registroId, null)
})

test('EL PIE RECLAMA POR NOMBRE cuando falta uno solo, y por cantidad cuando son varios', () => {
  assert.equal(avisoDeFaltantes([]), null)
  assert.equal(avisoDeFaltantes(['Molina']), 'Falta marcar a Molina')
  assert.equal(avisoDeFaltantes(['Molina', 'Ríos']), 'Falta marcar a Molina y Ríos')
  assert.equal(avisoDeFaltantes(['Molina', 'Ríos', 'Paz']), 'Faltan marcar 3 personas')
})

test('CERO TIPEADO NO ES UNA MARCA: se rechaza y manda a la A', () => {
  // El defecto que atrapa: un 0 en la casilla entraría a `registros_hh` contra el CHECK horas > 0 y
  // volvería un error de Postgres sin sentido para el jefe; o peor, se guardaría como ausencia sin
  // que nadie lo haya decidido.
  assert.equal(leerHoras('0').horas, null)
  assert.match(leerHoras('0').error!, /tocá la A/)
  assert.equal(leerHoras('').horas, null)
  assert.equal(leerHoras('').error, null, 'en blanco es dejar sin marcar, no un error')
  assert.equal(leerHoras('5').horas, 5)
  assert.equal(leerHoras('8,8').horas, 8.8, 'la coma del teclado en español es un decimal')
  assert.equal(leerHoras('-1').horas, null)
  assert.equal(leerHoras('25').horas, null)
  assert.equal(leerHoras('nueve').horas, null)
})

test('LO QUE SOBRA DE LA JORNADA SE CALCULA, NO SE DECLARA COMO RECARGO', () => {
  assert.equal(sobreLaJornada(10.8, 8.8), 2)
  assert.equal(sobreLaJornada(5, 8.8), 0)
  // El error binario no puede llegar a la pantalla: 10,8 − 8,8 en punto flotante da 1,9999999999999996.
  assert.equal(sobreLaJornada(11.8, 8.8), 3)
})

test('LAS HORAS SE MUESTRAN EN EL LOCALE DEL LUGAR: 8,8 y no 8.8', () => {
  // El defecto que atrapa: mostrar «8.8» en la casilla. El teclado del teléfono en español escribe
  // coma, así que quien corrige tipearía «8,5» sobre un «8.8» — dos separadores conviviendo en el
  // mismo campo. Lo que se muestra tiene que ser exactamente lo que se puede volver a tipear.
  assert.equal(hs(8.8), '8,8')
  assert.equal(hs(79.2), '79,2')
  assert.equal(hs(8), '8')
  assert.equal(leerHoras(hs(8.8)).horas, 8.8, 'lo que se muestra se vuelve a leer sin perder nada')
})
