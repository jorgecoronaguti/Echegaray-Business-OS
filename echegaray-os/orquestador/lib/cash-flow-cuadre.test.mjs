// El defecto que fijan estos tests: los dos cash flow decían cosas distintas sobre el mismo año y
// nada lo medía. El caso "real" de abajo son los números leídos del Sheet el 04/08/2026 — si alguien
// arregla el semanal, ese test se pone rojo y hay que actualizarlo con la evidencia nueva. Es a
// propósito: el número está acá para que el arreglo no pueda pasar inadvertido.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importe, mesesDeColumnas, cuadrarFila, hallazgos, TOLERANCIA } from './cash-flow-cuadre.mjs'

test('lee importes es_AR, con el negativo en sus dos formas', () => {
  assert.equal(importe('$1.234.567'), 1234567)
  assert.equal(importe('-$72.302.609'), -72302609)
  assert.equal(importe('($1.000)'), -1000)
  assert.equal(importe('$1.234,50'), 1234.5)
  assert.equal(importe('—'), 0)
  assert.equal(importe(''), 0)
  assert.equal(importe(null), 0)
})

test('la primera semana, que es del año anterior, NO cuenta', () => {
  // El cuadro real arranca el lunes 29/12 (de 2025). Contarla como diciembre metería sus
  // movimientos en el total del año y rompería el cuadre por una razón inexistente.
  const m = mesesDeColumnas(['Período', '29/12', '05/01', '12/01'])
  assert.equal(m[1], null, 'la semana del 29/12 es de 2025')
  assert.equal(m[2], 1)
  assert.equal(m[3], 1)
})

test('un diciembre que NO es la primera semana sí cuenta', () => {
  const m = mesesDeColumnas(['Período', '05/01', '07/12', '14/12'])
  assert.equal(m[1], 1)
  assert.equal(m[2], 12)
  assert.equal(m[3], 12)
})

test('cuando los dos cuadros cuentan lo mismo, la diferencia es cero', () => {
  const meses = mesesDeColumnas(['P', '05/01', '12/01', '02/02'])
  const sem = [['Cobros', '$100', '$50', '$70']]
  const men = [['Cobros', '$150', '$70', ...Array(10).fill('—'), '$220']]
  const r = cuadrarFila(sem[0], men[0], meses)
  assert.equal(r.semanal, 220)
  assert.equal(r.mensual, 220)
  assert.equal(r.diferencia, 0)
})

test('la columna N de TOTAL del mensual no se suma dos veces', () => {
  // El mensual tiene A + 12 meses + Total. Si el bucle llegara hasta N, todo daría el doble.
  const meses = mesesDeColumnas(['P', '05/01'])
  const men = [['Cobros', '$100', ...Array(11).fill('—'), '$100']]
  const r = cuadrarFila(['Cobros', '$100'], men[0], meses)
  assert.equal(r.mensual, 100)
  assert.equal(r.diferencia, 0)
})

test('una diferencia de centavos es ruido, una de millones es un hallazgo', () => {
  const meses = mesesDeColumnas(['P', '05/01'])
  const chico = hallazgos([{ fila: 1, nombre: 'x' }], [['x', '$100']], [['x', '$99']], meses)
  assert.equal(chico.length, 0, `una diferencia de $1 no puede ser hallazgo (tolerancia ${TOLERANCIA})`)
  const grande = hallazgos([{ fila: 1, nombre: 'x' }], [['x', '$100']], [['x', '$1.000.000']], meses)
  assert.equal(grande.length, 1)
  assert.equal(grande[0].diferencia, 100 - 1000000)
})

test('EL CASO REAL 04/08/2026: el semanal no proyecta los egresos y difiere $140,4M', () => {
  // Totales del año leídos del Sheet. Se reconstruyen como una sola "semana" y un solo "mes" porque
  // lo que se prueba es el invariante anual, no el reparto entre columnas.
  const meses = mesesDeColumnas(['P', '05/01'])
  const lineas = [
    { fila: 1, nombre: 'Cobros ya cobrado', sem: 441507275, men: 441507276 },
    { fila: 2, nombre: 'Cobranzas esperadas', sem: 342667788, men: 342667789 },
    { fila: 3, nombre: 'Proveedores', sem: 258665994, men: 379171238 },
    { fila: 4, nombre: 'Estructura', sem: 29839035, men: 48565454 },
    { fila: 5, nombre: 'AUMENTO NETO', sem: 68047829, men: -72302609 },
  ]
  const sem = lineas.map((l) => [l.nombre, String(l.sem)])
  const men = lineas.map((l) => [l.nombre, String(l.men)])
  const h = hallazgos(lineas.map(({ fila, nombre }) => ({ fila, nombre })), sem, men, meses)

  // Las cobranzas SÍ cuadran: el semanal proyecta los ingresos. El problema es sólo de egresos.
  assert.equal(h.find((x) => x.nombre === 'Cobros ya cobrado'), undefined)
  assert.equal(h.find((x) => x.nombre === 'Cobranzas esperadas'), undefined)

  // Los egresos que el semanal no proyecta.
  assert.equal(h.find((x) => x.nombre === 'Proveedores').diferencia, -120505244)
  assert.equal(h.find((x) => x.nombre === 'Estructura').diferencia, -18726419)

  // Y el número que decide el año, con SIGNO OPUESTO entre los dos cuadros.
  const neto = h.find((x) => x.nombre === 'AUMENTO NETO')
  assert.equal(neto.diferencia, 140350438)
  assert.ok(neto.semanal > 0 && neto.mensual < 0,
    'el semanal dice que el año genera caja y el mensual que la quema: no pueden ser los dos')
})
