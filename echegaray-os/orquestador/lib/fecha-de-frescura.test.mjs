// Lo que se prueba acá es EL DEFECTO, no la función: cada test se pone rojo si se vuelve a la
// versión estampada del rótulo (la fecha del reloj de la corrida escrita como texto).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_AVISO, literal, fechaNumerica, formulaUltimaFecha, formulaFrescuraDe,
  rotuloAlDia, formulaAntiguedad,
} from './fecha-de-frescura.mjs'

const R = '_BANCO_RAW!$A$4:$A'

test('la fecha sale del DATO: ninguna fórmula trae una fecha escrita adentro', () => {
  // El defecto original era `al ${new Date().toLocaleDateString('es-AR')}` — una fecha literal.
  // Si alguien vuelve a estampar, el literal aparece en la fórmula y este test lo caza.
  const fs = [
    formulaUltimaFecha(R),
    rotuloAlDia('Cuánta plata hay', formulaUltimaFecha(R)),
    formulaAntiguedad('F19'),
  ]
  for (const f of fs) {
    assert.doesNotMatch(f, /\d{1,2}\/\d{1,2}\/\d{2,4}/, `hay una fecha estampada en la fórmula: ${f}`)
    assert.doesNotMatch(f, /\d{4}-\d{2}-\d{2}/, `hay una fecha ISO estampada en la fórmula: ${f}`)
  }
})

test('locale es-AR: los argumentos se separan con ; y nunca con coma', () => {
  const fs = [
    formulaUltimaFecha(R),
    formulaUltimaFecha("'Compras'!$AD$4:$AD$1200", { mixto: true }),
    formulaFrescuraDe([formulaUltimaFecha(R), formulaUltimaFecha("'Cobranzas'!$Q$5:$Q$400")]),
    rotuloAlDia('Posición de caja', formulaUltimaFecha(R), { cola: 'en pesos' }),
    formulaAntiguedad('F19'),
  ]
  // Una coma sólo puede aparecer adentro de un texto entre comillas; nunca como separador.
  for (const f of fs) {
    const sinTextos = f.replace(/"(?:[^"]|"")*"/g, '""')
    assert.doesNotMatch(sinTextos, /,/, `la coma es el decimal en es-AR, no un separador: ${f}`)
  }
  assert.match(formulaFrescuraDe(['A', 'B']), /^MAX\(A;B\)$/)
})

test('una fecha FUTURA no es frescura: sólo cuenta la mayor que ya pasó', () => {
  // Compras trae fecha prevista de pago y Cheques Emitidos fecha diferida. Un MAX crudo sobre esas
  // columnas devolvería 30/09 y el rótulo mentiría para adelante.
  assert.match(formulaUltimaFecha(R), /<=TODAY\(\)/)
})

test('la columna en formato mixto se coacciona: MAX ignora el texto EN SILENCIO', () => {
  // "Fecha de caja" de Compras tiene filas como serial y filas como texto "dd/mm/aaaa". Sin
  // DATEVALUE el rótulo se queda en la última fecha que entró como número, sin avisar.
  const mixto = fechaNumerica("'Compras'!$AD$4:$AD$1200", { mixto: true })
  assert.match(mixto, /DATEVALUE/)
  assert.match(mixto, /IFERROR/)
  assert.match(mixto, /N\('Compras'!\$AD\$4:\$AD\$1200\)/)
  // Sin formato mixto alcanza con neutralizar el texto para no romper la multiplicación.
  assert.equal(fechaNumerica(R), `IF(ISNUMBER(${R});${R};0)`)
})

test('ninguna fórmula ancla en un número de fila: los rangos son abiertos o los da el generador', () => {
  // Una fila clavada a fuego dio #NUM! y contaminó el titular de CAJA cuando el bloque se corrió
  // quince filas. Lo que esta lib produce sola no puede citar una posición.
  const f = rotuloAlDia('Cheques emitidos', formulaUltimaFecha('$C$1:$C'))
  assert.doesNotMatch(f, /![A-Z]+\d/, 'hay una celda concreta citada en la fórmula')
})

test('sin datos NO se muestra una fecha: un MAX vacío da 0, que se formatea como 30/12/1899', () => {
  const f = rotuloAlDia('X', formulaUltimaFecha(R))
  assert.match(f, /IF\(SUMPRODUCT\(MAX\(.*\)\)=0;"⚠ sin datos cargados"/)
})

test('pasados los días de aviso el rótulo lo dice, con el mismo vocabulario que CAJA', () => {
  const f = rotuloAlDia('X', 'E')
  assert.match(f, new RegExp(`TODAY\\(\\)-E>${DIAS_AVISO}`))
  assert.match(f, /⚠ hace "&TEXT\(TODAY\(\)-E;"0"\)&" días"/)
  // Y si está al día, no ensucia: la rama del aviso devuelve cadena vacía.
  assert.match(f, /;""\)/)
})

test('el texto entra escapado: una comilla suelta parte la fórmula y deja #ERROR! arriba de todo', () => {
  assert.equal(literal('el "corte"'), '"el ""corte"""')
  const f = rotuloAlDia('dice "hasta acá"', 'E')
  assert.ok(f.startsWith('='))
  // Cantidad par de comillas ⇒ la fórmula cierra todos sus textos.
  assert.equal((f.match(/"/g) || []).length % 2, 0)
})

test('la cola de la gramática (la unidad) va DESPUÉS de la fecha, no antes', () => {
  const f = rotuloAlDia('Cuánto de lo firmado no salió', formulaUltimaFecha('$C$1:$C'), { cola: 'en pesos' })
  assert.ok(f.indexOf('dd/mm/yyyy') < f.indexOf('en pesos'), 'la unidad quedó antes de la fecha')
})

test('formulaFrescuraDe exige al menos una fuente: una pestaña sin fuente no puede declarar frescura', () => {
  assert.throws(() => formulaFrescuraDe([]), /sin fuentes/)
  assert.throws(() => formulaFrescuraDe([null, '']), /sin fuentes/)
})

test('la antigüedad es la MISMA que CAJA ya usaba: una regla, una sola versión', () => {
  assert.equal(
    formulaAntiguedad('F19'),
    '=IF(F19="";"⚠ sin cargar";IF(TODAY()-F19>7;"⚠ "&TEXT(TODAY()-F19;"0")&" días";TEXT(TODAY()-F19;"0")&" días"))',
  )
})
