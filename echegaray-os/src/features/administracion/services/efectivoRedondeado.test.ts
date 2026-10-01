// EL EFECTIVO REDONDEADO VIENE SUGERIDO Y SE EDITA.
//
// Dueño, 14/09/2026: *«la columna de "efectivo redondeado" tiene q traer un valor de lo q corresponde
// en efectivo ya predeterminado con el redondeo en 0 y me tiene q permitir editar»*. Hoy no hay NINGUNA
// fila guardada: la columna salía vacía para todo el plantel.
//
// El criterio (al $1.000 más cercano) lo eligió el coordinador porque no hay datos guardados de los que
// inferirlo: vive en `PASO_DEL_REDONDEO` para cambiarlo en una línea.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PASO_DEL_REDONDEO, accionDelRedondeo, efectivoMostrado, efectivoSugerido, saldoRedondeado, sumaDelRedondeo,
  sumaDelSaldoRedondeado,
} from './efectivoRedondeado.ts'

test('el sugerido es el efectivo al $1.000 más cercano, sin centavos', () => {
  assert.equal(PASO_DEL_REDONDEO, 1000)
  assert.equal(efectivoSugerido(325808), 326000)
  assert.equal(efectivoSugerido(412400), 412000)
  assert.equal(efectivoSugerido(325808.5), 326000)
  assert.equal(efectivoSugerido(499), 0 + 0 || null, 'menos de $500 redondea a 0: no hay sobre que sugerir')
})

test('sin efectivo no hay sugerido: null o ≤ 0 → null, la celda queda vacía', () => {
  assert.equal(efectivoSugerido(null), null)
  assert.equal(efectivoSugerido(0), null)
  assert.equal(efectivoSugerido(-1500), null)
})

test('el sugerido NO se guarda si nadie lo tocó', () => {
  // EL DEFECTO QUE ATRAPA: guardar el sugerido al perder el foco convertiría una sugerencia del sistema
  // en una decisión del dueño que nadie tomó.
  assert.deepEqual(accionDelRedondeo({ texto: '326000', guardado: null, sugerido: 326000 }), { accion: 'nada' })
  assert.deepEqual(accionDelRedondeo({ texto: '$ 326.000', guardado: null, sugerido: 326000 }), { accion: 'nada' })
  assert.deepEqual(accionDelRedondeo({ texto: '330000', guardado: null, sugerido: 326000 }), { accion: 'guardar', importe: 330000 })
  // VACIAR BORRA LO GUARDADO Y VUELVE EL SUGERIDO; vaciar sin nada guardado no hace nada.
  assert.deepEqual(accionDelRedondeo({ texto: '', guardado: 330000, sugerido: 326000 }), { accion: 'borrar' })
  assert.deepEqual(accionDelRedondeo({ texto: '', guardado: null, sugerido: 326000 }), { accion: 'nada' })
  assert.deepEqual(accionDelRedondeo({ texto: '330000', guardado: 330000, sugerido: 326000 }), { accion: 'nada' })
})

test('lo mostrado: el guardado manda; sin guardado, el sugerido', () => {
  assert.deepEqual(efectivoMostrado({ efectivoRedondeado: 330000, enEfectivo: 325808 }), { valor: 330000, sugerido: false, sugeridoAhora: 326000 })
  assert.deepEqual(efectivoMostrado({ efectivoRedondeado: null, enEfectivo: 325808 }), { valor: 326000, sugerido: true, sugeridoAhora: 326000 })
  assert.deepEqual(efectivoMostrado({ efectivoRedondeado: null, enEfectivo: null }), { valor: null, sugerido: false, sugeridoAhora: null })
})

// ERAN TRES PANTALLAS: `solapas/pagos.tsx` se borró el 14/09/2026 al unificar «Más» (repetía la fila de
// la Quincena). Quedan dos, y las dos le pasan el efectivo a la misma celda.
test('las pantallas usan la misma celda con el sugerido, y la celda decide con la regla pura', () => {
  const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const CELDAS = fuente('../components/liquidacion/CeldasDeLiquidacion.tsx')
  // EL DEFECTO QUE ATRAPA: la celda guardando lo que muestra sin preguntar si alguien lo tocó.
  assert.match(CELDAS, /const a = accionDelRedondeo\(\{ texto, guardado: valor, sugerido: mostrado\.sugeridoAhora \}\)/)
  assert.match(CELDAS, /sugerido: efectivo \$\{pesos\(enEfectivo\)\} redondeado a miles/)
  // EL SUGERIDO SE REDONDEA SOBRE LO QUE SE ENTREGA HOY (`pago.aPagarEfectivo`), no sobre el viejo «Total efectivo».
  // La columna «Efect. red. ✎» está en el cuadro de la Quincena porque la pidió el dueño (16/09/2026).
  // DESDE EL 17/09/2026 la celda y el pie usan la MISMA función (`efectivoDelRedondeo`): antes la celda redondeaba
  // `aPagarEfectivo` y el pie `enEfectivo`, y al mensual sin recibo le sugería el sueldo entero en billetes.
  for (const f of ['FilasJornaleros.tsx', 'FilasMensuales.tsx']) {
    assert.match(fuente(`../components/liquidacion/cuadro/${f}`), /enEfectivo=\{efectivoDelRedondeo\(fila\)\}/, `${f} redondea lo que se entrega hoy`)
  }
  assert.match(fuente('../components/liquidacion/CuadroLiquidacion.tsx'),
    /enEfectivo=\{(l|linea)\.enEfectivo\}/, 'el cuadro clásico sigue con su cadena')
  assert.match(fuente('./liquidacionPorTipo.ts'), /efectivoMostrado\(\{ efectivoRedondeado: f\.linea\.efectivoRedondeado, enEfectivo: efectivoDelRedondeo\(f\) \}\)/)
})

test('el pie de la columna suma lo que muestran las filas: guardado o sugerido', () => {
  const filas = [
    { efectivoRedondeado: 330000, enEfectivo: 325808 },
    { efectivoRedondeado: null, enEfectivo: 412400 },
    { efectivoRedondeado: null, enEfectivo: null },
  ]
  assert.equal(sumaDelRedondeo(filas), 742000)
})

// ═══ SALDO REDONDEADO (dueño, 16/09/2026): lo que resta pagar, como si saliera todo en billetes ═══

test('el saldo redondeado lleva lo que falta pagar al $1.000 más cercano', () => {
  assert.deepEqual(saldoRedondeado(325808), { valor: 326000, diferencia: 192 })
  assert.deepEqual(saldoRedondeado(412400), { valor: 412000, diferencia: -400 })
  // Cae justo: no hay diferencia que avisar.
  assert.deepEqual(saldoRedondeado(50000), { valor: 50000, diferencia: 0 })
  // 500 redondea PARA ARRIBA (Math.round), como el efectivo sugerido: el mismo paso y el mismo criterio.
  assert.equal(saldoRedondeado(1500).valor, 2000)
})

test('sin saldo que afirmar, saldo cero o pagado de más no hay nada que redondear', () => {
  assert.equal(saldoRedondeado(null).valor, null)
  assert.equal(saldoRedondeado(undefined).valor, null)
  assert.equal(saldoRedondeado(0).valor, null)
  // Negativo = cobró de más. Una devolución no se redondea: se mira el saldo real, en ámbar, al lado.
  assert.equal(saldoRedondeado(-8000).valor, null)
  assert.equal(saldoRedondeado(Number.NaN).valor, null)
})

test('un saldo menor a medio paso no se convierte en cero entregado', () => {
  // $400 redondearía a $0: eso diría «no le entregues nada» y falsearía la columna. Se dibuja «—».
  assert.equal(saldoRedondeado(400).valor, null)
  assert.equal(saldoRedondeado(600).valor, 1000)
})

test('el total de la columna suma saldos ya redondeados, no redondea la suma', () => {
  // 400 + 400 + 400 = 1.200 → redondear la suma daría 1.000; en billetes no sale nada por ninguno.
  assert.equal(sumaDelSaldoRedondeado([400, 400, 400]), 0)
  assert.equal(sumaDelSaldoRedondeado([325808, 412400, null, -8000]), 738000)
  assert.equal(sumaDelSaldoRedondeado([]), 0)
})

test('el saldo redondeado no se guarda: no hay columna en la base ni escritura', () => {
  const fuente = readFileSync(new URL('./efectivoRedondeado.ts', import.meta.url), 'utf8')
  const bloque = fuente.slice(fuente.indexOf('export function saldoRedondeado('))
  assert.equal(/upsert|insert|update|supabase/i.test(bloque), false)
})
