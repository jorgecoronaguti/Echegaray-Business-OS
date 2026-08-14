// LA LIMPIEZA DECLARADA DE "JORNALES POR QUINCENA" — y los dos casos en que NO tiene que borrar.
//
// El archivo vivo, tal como se leyó el 14/08 con render FORMULA. Cada fila de acá abajo se copió de
// la pestaña, no se inventó: el test vale por eso.

import test from 'node:test'
import assert from 'node:assert/strict'
import { copiaHuerfana, residuosDeclarados } from './jornales-residuo.mjs'
import { CANDIDATAS } from '../scripts/limpiar-residuo-jornales.mjs'

const MIN = '=IFERROR(MIN(FILTER(Compras!$AD$4:$AD;REGEXMATCH(LOWER(Compras!$K$4:$K&"");"^(jorge echegaray|rodrigo echegaray|jorge corona)$");ISNUMBER(Compras!$AD$4:$AD)));"")'
const MAX = '=IFERROR(MAX(FILTER(Compras!$AD$4:$AD;REGEXMATCH(LOWER(Compras!$K$4:$K&"");"^(jorge echegaray|rodrigo echegaray|jorge corona)$");(Compras!$AD$4:$AD)));"")'

/** La pestaña real, recortada a lo que este archivo decide: columnas E (4) y N (13). */
function pestanaViva({ n113 = 46038, n114 = 46055 } = {}) {
  const g = Array.from({ length: 130 }, () => [])
  g[55][4] = MIN                       // E56 — bloque 3 «Desde», vivo
  g[57][4] = 'Se paga el'              // E58 — encabezado vivo del bloque 3
  for (let f = 59; f <= 70; f++) g[f - 1][4] = MAX  // E59:E70 — «Se paga el» vivo, mes por mes
  g[75][4] = MIN                       // E76 — la copia que dejó el rediseño
  g[78][4] = MAX                       // E79 — ídem, en la columna del dueño de 4.1
  g[109][13] = 'Pagado el'             // N110 — encabezado huérfano
  g[112][13] = n113                    // N113 — serial huérfano
  g[113][13] = n114                    // N114 — ídem
  g[114][13] = 'Pagado el'             // N115 — el encabezado VIVO del registro
  g[115][13] = 46038                   // N116 — la fecha viva
  g[116][13] = 46055                   // N117 — la fecha viva
  return g
}

test('LAS CINCO CELDAS DECLARADAS SON COPIAS HUÉRFANAS — y se nombra el gemelo vivo de cada una', () => {
  const { vaciables, conservadas } = residuosDeclarados(pestanaViva(), CANDIDATAS)
  assert.deepEqual(conservadas, [], `no se pudo probar: ${conservadas.map((c) => c.motivo).join(' · ')}`)
  assert.deepEqual(vaciables.map((v) => [v.fila, v.col, v.gemelo]), [
    [76, 4, 56], [79, 4, 59], [110, 13, 115], [113, 13, 116], [114, 13, 117],
  ])
})

test('EL SEGURO QUE IMPORTA: una fecha del dueño SIN gemelo vivo NO se borra', () => {
  // N113 y N114 son fechas que carga él. Se pueden vaciar sólo porque el generador YA las re-copió a
  // su posición nueva y están vivas en N116/N117. Si el registro no las tuviera, esta celda sería el
  // único ejemplar y borrarla sería destruir su trabajo — que es la falla que este repo ya pagó seis
  // veces. Acá se prueba que en ese caso la regla conserva.
  const g = pestanaViva()
  g[115][13] = ''                       // el registro perdió la fecha de N116
  g[116][13] = ''                       // y la de N117
  const { vaciables, conservadas } = residuosDeclarados(g, CANDIDATAS)
  assert.deepEqual(conservadas.map((c) => c.fila), [113, 114])
  assert.ok(conservadas.every((c) => /NO tiene gemelo vivo/.test(c.motivo)))
  assert.deepEqual(vaciables.map((v) => v.fila), [76, 79, 110], 'el resto sí se puede probar')
})

test('una fecha PARECIDA no alcanza: el gemelo tiene que ser el mismo dato', () => {
  // Un serial distinto en el registro significa que la celda de arriba NO es una copia de nada vivo.
  // La forma enmascarada las haría iguales a las dos (`<n>`), así que la comparación no puede ser por
  // forma para un número — y por eso el módulo compara el VALOR cuando no es fórmula ni texto.
  const g = pestanaViva()
  g[112][13] = 46099                    // N113 con una fecha que el registro no tiene
  const { conservadas } = residuosDeclarados(g, CANDIDATAS)
  assert.ok(conservadas.some((c) => c.fila === 113), 'un serial huérfano de verdad se conserva')
})

test('una celda ADENTRO de la tabla viva nunca es huérfana, aunque se repita', () => {
  const g = pestanaViva()
  const r = copiaHuerfana(g, { fila: 116, col: 13, tabla: [115, 130] })
  assert.equal(r.gemelo, null)
  assert.match(r.motivo, /ADENTRO de la tabla viva/)
})

test('una celda vacía no se toca ni se cuenta', () => {
  const r = copiaHuerfana(pestanaViva(), { fila: 99, col: 13, tabla: [115, 130] })
  assert.equal(r.gemelo, null)
  assert.match(r.motivo, /vacía/)
})
