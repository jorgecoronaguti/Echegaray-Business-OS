// Tests del corrector de encabezados de período. Herméticos: el núcleo puro no toca red ni Sheet.
//
// LO QUE PROTEGEN: que la fila 3 de los dos cash flow sea exactamente la grilla de períodos que el
// generador define, porque cada columna suma una ventana que ARRANCA en su encabezado. Con el día 26
// en vez del 1°, cada columna mensual capturaba 5 o 6 días y la proyección perdía $293M del año, sin
// una sola celda en error y mostrando "ene-26" en pantalla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planEncabezados, controlesDelCuadro, aSerial, deSerial, FILA_CAB, CUADROS } from './cash-flow-encabezados.mjs'
import { meses, semanas } from './cash-flow-rehacer.mjs'

const S = (iso) => aSerial(new Date(`${iso}T00:00:00Z`))

test('el serial y la fecha van y vuelven sin corrimiento (el bug clásico de zona horaria)', () => {
  assert.equal(deSerial(S('2026-01-01')), '2026-01-01')
  assert.equal(deSerial(S('2025-12-29')), '2025-12-29')
  assert.equal(deSerial(S('2026-12-28')), '2026-12-28')
  // El anclaje contra un serial conocido: 2026-01-26 es el valor que tenía la Mensual en enero.
  assert.equal(S('2026-01-26'), 46048)
  assert.equal(deSerial(46048), '2026-01-26')
})

test('EL CASO REAL DE LA MENSUAL: el día 26 en las 12 columnas se corrige al 1°', () => {
  // La fila 3 tal como estaba: 26/01, 26/02, … Cada columna sumaba [26 , fin de mes] = 5 o 6 días.
  const fila3 = ['Período', ...[46048, 46079, 46107, 46138, 46168, 46199, 46229, 46260, 46291, 46321, 46352, 46382], 'Total 2026']
  const { celdas, sobran } = planEncabezados(fila3, meses())
  assert.equal(celdas.length, 12, 'las doce estaban corridas')
  assert.equal(celdas[0].a1, `B${FILA_CAB}`)
  assert.equal(celdas[0].actual, '2026-01-26')
  assert.equal(celdas[0].esperado, '2026-01-01')
  assert.match(celdas[0].motivo, /corrido 25 día/)
  assert.equal(celdas[11].a1, `M${FILA_CAB}`)
  assert.equal(celdas[11].esperado, '2026-12-01')
  assert.deepEqual(sobran, [], '"Total 2026" no es una fecha: no se reporta ni se toca')
})

test('EL CASO REAL DE LA SEMANAL: una sola semana con el año adelantado', () => {
  const sem = semanas()
  const fila3 = ['Período', S('2026-12-29'), ...sem.slice(1).map(aSerial)]
  const { celdas } = planEncabezados(fila3, sem)
  assert.equal(celdas.length, 1, 'sólo la primera estaba mal')
  assert.equal(celdas[0].a1, `B${FILA_CAB}`)
  assert.equal(celdas[0].actual, '2026-12-29')
  assert.equal(celdas[0].esperado, '2025-12-29')
  assert.match(celdas[0].motivo, /corrido 365 día/)
})

test('si los encabezados ya están bien, no toca NADA', () => {
  const ok = ['Período', ...meses().map(aSerial), 'Total 2026']
  assert.deepEqual(planEncabezados(ok, meses()).celdas, [])
  const okSem = ['Período', ...semanas().map(aSerial)]
  assert.deepEqual(planEncabezados(okSem, semanas()).celdas, [])
})

test('un encabezado que NO es fecha (texto o vacío) se corrige y se dice por qué', () => {
  const fila3 = ['Período', 'ene-26', ...meses().slice(1).map(aSerial)]
  const { celdas } = planEncabezados(fila3, meses())
  assert.equal(celdas.length, 1)
  assert.match(celdas[0].motivo, /no es una fecha/)
  assert.equal(celdas[0].actual, 'ene-26')
  // Un texto con pinta de mes es el peor caso: se ve igual que la fecha y la ventana da 0.
  const vacia = planEncabezados(['Período'], meses())
  assert.equal(vacia.celdas.length, 12, 'una fila 3 vacía se reconstruye entera')
})

test('LAS COLUMNAS DE MÁS SE REPORTAN, NO SE TOCAN: no adivino sobre el cuadro de la empresa', () => {
  const fila3 = ['Período', ...meses().map(aSerial), S('2027-01-01')]
  const { celdas, sobran } = planEncabezados(fila3, meses())
  assert.deepEqual(celdas, [])
  assert.equal(sobran.length, 1)
  assert.match(sobran[0], /2027-01-01/)
})

test('CONTROL DE FONDO: una línea cierra si sus 12 columnas dan el total real', () => {
  const filas = [
    [], [], ['Período'],
    ['Aportes y contribuciones gremiales', ...Array(12).fill(0), 897643, 17699962, -16802319],
    ['Materiales', ...Array(12).fill(0), 225885903, 225885903, 0],
  ]
  const formulas = [[], [], [], ['x', ...Array(12).fill(''), '=SUM(B4:M4)', '=SUMIF(Compras!$AC$4:$AC;"Nómina · Gremiales";Compras!$O$4:$O)', '=N4-O4'],
    ['x', ...Array(12).fill(''), '=SUM(B5:M5)', '=SUMIF(...)', '=N5-O5']]
  const ctrl = controlesDelCuadro(filas, formulas)
  assert.equal(ctrl.length, 2)
  assert.equal(ctrl[0].cierra, false)
  assert.equal(ctrl[0].pierde, 16802319, 'esto es lo que la proyección no ve')
  assert.equal(ctrl[1].cierra, true)
})

test('UNA LÍNEA QUE SUMA CERO ES EL PEOR CASO Y TIENE QUE CONTARSE', () => {
  // Mi primer medidor la descartaba: leía la pestaña CON formato, el cero se ve "—", el parseo daba
  // NaN y la línea quedaba fuera del control. La que no captura nada era invisible para el auditor.
  const filas = [[], [], [], ['Cargas sociales (F931)', ...Array(12).fill(0), 0, 77049056, -77049056]]
  const formulas = [[], [], [], ['x', ...Array(12).fill(''), '=SUM(B4:M4)', '=SUMIF(Compras!$AC$4:$AC;"Nómina · Cargas sociales";Compras!$O$4:$O)', '=N4-O4']]
  const ctrl = controlesDelCuadro(filas, formulas)
  assert.equal(ctrl.length, 1, 'no se descarta')
  assert.equal(ctrl[0].cierra, false)
  assert.equal(ctrl[0].total, 0)
  assert.equal(ctrl[0].real, 77049056)
})

test('UN CONTROL QUE SE COMPARA CONTRA SÍ MISMO NO CUENTA COMO CONTROL', () => {
  // Las líneas de ingresos tienen O = "=N7": no puede fallar, así que no puede delatar nada. Se marca
  // aparte para no sumarlo a "cierra" — es la misma trampa del puente de Cheques Recibidos.
  const filas = [[], [], [], ['Cobranzas de obra civil', ...Array(12).fill(0), 112510826, 112510826, 0]]
  const formulas = [[], [], [], ['x', ...Array(12).fill(''), '=SUM(B4:M4)', '=N4', '=N4-O4']]
  const ctrl = controlesDelCuadro(filas, formulas)
  assert.equal(ctrl[0].tautologico, true)
  // Y uno de verdad no se marca como tautológico.
  const real = controlesDelCuadro(filas, [[], [], [], ['x', ...Array(12).fill(''), '=SUM(B4:M4)', '=SUMIF(Compras!$AC$4:$AC;"X";Compras!$O$4:$O)', '=N4-O4']])
  assert.equal(real[0].tautologico, false)
})

test('los dos cuadros están declarados con su ventana, y usan la grilla del generador', () => {
  assert.equal(CUADROS.length, 2)
  assert.equal(CUADROS[0].esperado, meses)
  assert.equal(CUADROS[1].esperado, semanas)
  assert.match(CUADROS[0].ventana, /fin de mes/)
  assert.match(CUADROS[1].ventana, /\+7/)
  // La grilla es la del generador, no una copia: 12 meses y 53 semanas de lunes.
  assert.equal(meses().length, 12)
  assert.equal(semanas().length, 53)
  assert.ok(semanas().every((d) => d.getUTCDay() === 1), 'todas las semanas arrancan lunes')
  assert.ok(meses().every((d) => d.getUTCDate() === 1), 'todos los meses arrancan el 1°')
})

test('PROYECTAR DE MÁS NO ES UN ERROR: los meses que faltan suman sobre el real', () => {
  // Criterio que casi me hace "arreglar" lo que estaba bien: después de corregir los encabezados, las
  // 12 columnas suman MÁS que el real cargado, porque agosto a diciembre son proyección. La alarma es
  // sólo al revés — que la suma quede POR DEBAJO del real, que es plata cargada que nadie ve.
  const conProyeccion = [[], [], [], ['Materiales', ...Array(12).fill(0), 323605376, 225885903, 97719473]]
  const f = [[], [], [], ['x', ...Array(12).fill(''), '=SUM(B4:M4)', '=SUMIF(Compras!$AC$4:$AC;"X";Compras!$O$4:$O)', '=N4-O4']]
  const ctrl = controlesDelCuadro(conProyeccion, f)
  assert.equal(ctrl[0].cierra, true, 'proyectar de más NO es perder plata')
  assert.ok(ctrl[0].pierde < 0)
  // Y perder aunque sea un peso sí es alarma.
  const pierde = controlesDelCuadro([[], [], [], ['X', ...Array(12).fill(0), 100, 101, -1]], f)
  assert.equal(pierde[0].cierra, false)
  assert.equal(pierde[0].pierde, 1)
})
