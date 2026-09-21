// EL PRESENTISMO NO SE DICE DOS VECES EN LA MISMA PANTALLA (dueño, 21/09/2026).
//
// *«al hacer en el nombre de cada uno el menú derecho que se abre con la liquidación en blanco sigue restando el
// concepto presentismo en la quincena actual, algo que ya no es así»*. El panel mostraba, arriba, el recibo estimado
// con «0425 ASISTENCIA PERFECTA +$53.990» y «0426 AJUSTE COD.0425 (INASIST. Y/O TARD.) −$53.990», y dos bloques más
// abajo «Presentismo · Cumple». Dos versiones del mismo concepto, y una de ellas afirmaba un descuento por
// inasistencia sobre alguien que no faltó.
//
// Lo que este test cuida es LA CADENA, no la regla (esa está en `reciboEstimado.test.ts`): que la quincena que se
// está liquidando llegue hasta el estimado. Sin esto, la bandera existe y nadie la enciende — el defecto clásico de
// un arreglo que pasa sus tests unitarios y no cambia nada en la pantalla.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { baseDelEstimado } from './reciboEstimadoService.ts'
import { PRESENTISMO_DESDE, quincenaConPresentismo } from './presentismo.ts'
import { REGLAS_GENERADAS } from './reglasDelRecibo.generadas.ts'

const base = (desde: string | null) => baseDelEstimado('Q2-09/2026', REGLAS_GENERADAS, [], 1, new Map(), desde)

test('la base del estimado enciende la bandera desde la quincena en que rige el presentismo', () => {
  assert.equal(PRESENTISMO_DESDE, '2026-09-16', 'la fecha vive en un solo lado')
  assert.equal(base('2026-09-16').presentismoPropio, true, 'la quincena en curso')
  assert.equal(base('2026-09-30').presentismoPropio, true)
  // LAS QUINCENAS VIEJAS NO CAMBIAN DE REGLAS: su estimado sigue reproduciendo lo que el estudio liquidó.
  assert.equal(base('2026-09-01').presentismoPropio, false, 'la 1ª de septiembre, ya pagada')
  assert.equal(base('2026-08-16').presentismoPropio, false)
  // SIN FECHA, COMO SIEMPRE: los llamadores que no liquidan una quincena no cambian de comportamiento.
  assert.equal(base(null).presentismoPropio, false)
  assert.equal(quincenaConPresentismo('2026-09-15'), false)
})

test('la pantalla de liquidación le pasa SU quincena: la bandera no queda apagada en producción', () => {
  const servicio = readFileSync(new URL('./liquidacionQuincenaService.ts', import.meta.url), 'utf8')
  // MUTACIÓN: volver a llamar `baseDelEstimado(periodo, REGLAS_GENERADAS, exposicion.recibos, feriados.feriados)`
  // sin la quincena deja el 0426 restando en la pantalla y este test se pone rojo.
  assert.match(servicio, /baseDelEstimado\(periodo, REGLAS_GENERADAS, exposicion\.recibos, feriados\.feriados, new Map\(\), q\.desde\)/)
  // Y EL ESTIMADO LA RECIBE: la base viaja entera a `estimarRecibo` por `estimacion.base`.
  const sueldo = readFileSync(new URL('./sueldoBlancoNegro.ts', import.meta.url), 'utf8')
  assert.match(sueldo, /presentismoPropio: est\.base\.presentismoPropio === true/)
})
