// EL BLOQUE QUE LEE EL CUADRO NO PUEDE TUMBAR EL CUADRO, NI INVENTARSE UN SEGUNDO UMBRAL.
//
// Los defectos que atrapan estos tests son los que este bloque tuvo de verdad el 05/08/2026, no
// hipótesis: un ReferenceError de zona muerta que reventaba `grilla()` entera y 17 tests que ni
// miran el bloque, y un `AVERAGE(IF(...))` que en Sheets devuelve el promedio de UNA celda sin dar
// un solo error — la clase de fórmula que miente en silencio, prohibida por comentario en el propio
// archivo doce líneas más arriba de donde estaba escrita.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloqueLiquidez, formulaColchon, COLCHON_PERIODOS } from './cash-flow-liquidez.mjs'

const FILA0 = 60
const arma = (periodo = 'semanal') => bloqueLiquidez({
  periodo, fila0: FILA0, colN: 'BC', filaCab: 3, filaCierre: 55, filaVariacion: 53, filaColchon: 57,
})
/** Todas las fórmulas del bloque, sin las celdas de rótulo. */
const formulas = (b) => b.filas.flatMap((f) => f.slice(1)).filter((c) => String(c).startsWith('='))

for (const periodo of ['semanal', 'mensual']) {
  test(`${periodo}: el bloque se arma sin reventar — la regresión del ReferenceError`, () => {
    // `const f = push('…', '…', \`…$B$\${f}…\`)` referencia su propio binding antes de que exista.
    // No falla al escribirlo ni al importarlo: falla al ARMAR el cuadro, que es lo último que corre.
    const b = arma(periodo)
    assert.ok(b.filas.length >= 12, `el bloque trae ${b.filas.length} filas: se vació`)
    assert.ok(formulas(b).length >= 10, 'el bloque perdió sus fórmulas')
  })

  test(`${periodo}: ninguna fórmula referencia una fila de afuera del bloque`, () => {
    // Una glosa que comenta su propio número tiene que apuntar a la celda de al lado. Si la fila se
    // calcula mal, apunta a otra línea y el veredicto ("▲ la caja mejora") comenta un número ajeno
    // sin dar error. Se verifica que toda referencia a $B$ dentro del bloque caiga en el bloque o en
    // las filas del cuadro que el bloque declara leer.
    const b = arma(periodo)
    const legitimas = new Set([3, 53, 55, 57])
    const fin = FILA0 + b.filas.length - 1
    for (const f of formulas(b)) {
      for (const m of String(f).matchAll(/\$B\$(\d+)/g)) {
        const fila = Number(m[1])
        assert.ok(legitimas.has(fila) || (fila >= FILA0 && fila <= fin),
          `una fórmula apunta a $B$${fila}, que no es del bloque (${FILA0}..${fin}) ni una fila declarada del cuadro`)
      }
    }
  })

  test(`${periodo}: ni un AVERAGE(IF(...)) — el promedio que miente en silencio`, () => {
    // En Sheets ese IF no se expande sin ARRAYFORMULA: devuelve el promedio de UNA celda y no marca
    // error. Todos los promedios del bloque van por SUMPRODUCT, que sí se expande.
    for (const f of formulas(arma(periodo))) {
      assert.ok(!/AVERAGE\s*\(\s*IF\s*\(/.test(String(f)), `AVERAGE(IF(...)) en: ${String(f).slice(0, 90)}…`)
    }
  })

  test(`${periodo}: separador es-AR — ni una coma separando argumentos`, () => {
    // El Sheet está en es_AR: la coma es el decimal y el separador de argumentos es `;`. Una coma acá
    // no da #ERROR: da una fórmula que Sheets rechaza al escribirla y tumba el lote entero.
    // Las comas DENTRO de un literal de texto son prosa castellana y son legítimas; lo prohibido es
    // la coma separando argumentos. Se sacan los literales antes de mirar.
    for (const f of formulas(arma(periodo))) {
      const sinTexto = String(f).replace(/"[^"]*"/g, '""')
      assert.ok(!sinTexto.includes(','), `coma separando argumentos: ${sinTexto.slice(0, 90)}…`)
    }
  })
}

test('el colchón se LEE de la fila del cuadro, no se recalcula en el bloque', () => {
  // Es el umbral del riesgo y también la línea que dibuja el gráfico. Calculado dos veces —una para
  // la tabla, otra para el gráfico— es exactamente cómo se termina con dos umbrales distintos para
  // el mismo riesgo, que es el defecto que este frente entero vino a matar.
  const b = arma('semanal')
  assert.equal(b.filas[b.fColchon - FILA0][1], '=$B$57',
    'el bloque recalcula el colchón en vez de referenciar su fila del cuadro')
  const segundas = formulas(b).filter((f) => f.includes('$B$57:'))
  assert.deepEqual(segundas, [], 'hay una segunda fórmula de colchón adentro del bloque')
})

test('el excedente colocable se mide contra el PISO del horizonte, nunca contra el pico', () => {
  // Colocar plata contra el máximo deja a la empresa sin caja en el pozo. Es la regla explícita de
  // tesorería —"cuánto sobra DE VERDAD"— y la diferencia entre un excedente y un descubierto caro.
  const b = arma('mensual')
  const fila = b.filas.find((f) => String(f[0]).includes('Excedente colocable'))
  assert.ok(fila, 'el bloque dejó de decir cuánto se puede colocar')
  assert.ok(fila[1].includes(`$B$${b.fMinimo}`), 'el excedente no sale del punto más bajo')
})

test('el colchón promedia sobre los períodos CON movimiento, no sobre los 53', () => {
  // Promediando sobre todas las columnas entran las semanas del futuro todavía sin cargar y el
  // colchón baja artificialmente — justo el sesgo que hace que un mínimo de caja insuficiente
  // parezca alcanzar. El divisor cuenta las columnas con egreso, no las columnas.
  const f = formulaColchon([14, 23, 28, 31], 'BC')
  assert.match(f, /SUMPRODUCT\(--\(\(.*\)>0\)\)/, 'el divisor no cuenta los períodos con movimiento')
  assert.ok(f.startsWith(`=IFERROR(${COLCHON_PERIODOS}*`), 'el colchón perdió su cantidad de períodos')
  assert.ok(!/,/.test(f), 'coma en una fórmula es-AR')
  // MAX(1;…) en el divisor: sin movimiento cargado el colchón da 0, no #DIV/0!. Un umbral en error
  // pinta de rojo el cuadro entero y esconde el número que sí decide.
  assert.ok(f.includes('MAX(1;'), 'sin movimiento el colchón revienta en #DIV/0!')
})

test('el punto más bajo y su fecha salen de la MISMA fila de cierre', () => {
  // "Cierra en $8,7M" y "el peor mes es diciembre" leyendo rangos distintos es cómo se termina
  // nombrando un mes y mostrando el saldo de otro.
  const b = arma('mensual')
  const minimo = b.filas[b.fMinimo - FILA0][1]
  const cuando = b.filas[b.fMinimo + 1 - FILA0][1]
  assert.ok(minimo.includes('MIN($B$55:BC$55)'), 'el mínimo no lee la fila de cierre')
  assert.ok(cuando.includes('MATCH(MIN($B$55:BC$55);$B$55:BC$55;0)'), 'la fecha del mínimo busca en otro rango')
  // MATCH con 0, nunca LOOKUP: sobre datos sin ordenar el binario devuelve el resultado equivocado
  // en vez de un error, y una fila de saldos no está ordenada.
  assert.ok(!/LOOKUP\(/.test(cuando), 'LOOKUP binario sobre datos sin ordenar')
})
