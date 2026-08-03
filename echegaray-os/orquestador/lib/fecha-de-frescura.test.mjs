// LO QUE SE PRUEBA ACÁ ES QUE EL RÓTULO NO PUEDA VOLVER A MENTIR.
//
// El defecto original no daba error: la pestaña se veía perfecta y la fecha estaba mal. Por eso cada
// test de abajo ataca una forma CONCRETA de que vuelva a pasar, no la "forma general" de la fórmula.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_AVISO, literal, fechaNumerica, formulaUltimaFecha, formulaFrescuraDe, rotuloAlDia, formulaAntiguedad,
} from './fecha-de-frescura.mjs'

// ═══ EL DEFECTO QUE ORIGINÓ TODO: LA FECHA DE LA CORRIDA ADENTRO DEL TEXTO ═══

test('el rótulo NO contiene ninguna fecha literal: si la tuviera, quedaría clavada', () => {
  const r = rotuloAlDia('Cheques emitidos', formulaUltimaFecha('$C$21:$C'))
  // Una fecha dd/mm/aaaa escrita en el texto es exactamente el defecto que se arregló. El único
  // "dd/mm/yyyy" permitido es el PATRÓN de TEXT(), que no es una fecha sino una máscara.
  const sinMascara = r.replace(/"dd\/mm\/yyyy"/g, '')
  assert.doesNotMatch(sinMascara, /\d{1,2}\/\d{1,2}\/\d{2,4}/, `hay una fecha estampada en el rótulo: ${r}`)
})

test('el rótulo es una FÓRMULA, no un texto: si no arranca en "=" Sheets no recalcula nada', () => {
  assert.ok(rotuloAlDia('x', formulaUltimaFecha('$C$21:$C')).startsWith('='))
})

test('la fecha se lee del rango del DATO, no de TODAY(): TODAY sólo compara', () => {
  const r = rotuloAlDia('x', formulaUltimaFecha('_BANCO_RAW!$A$4:$A'))
  assert.match(r, /_BANCO_RAW!\$A\$4:\$A/, 'la fórmula tiene que citar la columna de fechas del dato')
  // Si la fecha mostrada fuera TODAY(), el rótulo volvería a declarar la frescura del reloj.
  assert.doesNotMatch(r, /TEXT\(TODAY\(\);/, 'estaría mostrando el día de hoy en vez del último dato')
})

// ═══ TRAMPA 1 — UNA FECHA FUTURA NO ES FRESCURA ═══

test('una fecha futura NUNCA puede ser el corte: sólo cuenta lo que ya pasó', () => {
  // Sin `<=TODAY()`, Compras (fecha prevista de pago) y Cheques Emitidos (pago diferido) empujarían
  // el rótulo a septiembre y la pestaña declararía frescura de algo que todavía no ocurrió.
  assert.match(formulaUltimaFecha('$I$20:$I'), /<=TODAY\(\)/)
})

// ═══ TRAMPA 2 — LA COLUMNA EN FORMATO MIXTO ═══

test('la columna mixta se coacciona: un MAX crudo pierde las fechas tipeadas EN SILENCIO', () => {
  const m = fechaNumerica("'Compras'!$AD$4:$AD", { mixto: true })
  assert.match(m, /DATEVALUE/, 'sin DATEVALUE las fechas cargadas como texto no se comparan')
  assert.match(m, /IFERROR/, 'las que ya son número de serie tienen que caer a N()')
  assert.match(m, /N\('Compras'!\$AD\$4:\$AD\)/)
})

test('la columna normal neutraliza el texto: el encabezado cae dentro del rango abierto', () => {
  assert.equal(fechaNumerica('$C$20:$C'), 'IF(ISNUMBER($C$20:$C);$C$20:$C;0)')
})

// ═══ TRAMPA 3 — LA POSICIÓN NO SE ESCRIBE ═══

test('el rango es ABIERTO: uno cerrado envejece y deja de ver las filas nuevas', () => {
  const f = formulaUltimaFecha('_BANCO_RAW!$A$4:$A')
  assert.doesNotMatch(f, /\$A\$4:\$A\$\d+/, 'un tope de filas es un rango que caduca')
})

test('sin ARRAYFORMULA: en una celda de rótulo derramaría sobre las de al lado', () => {
  assert.doesNotMatch(formulaUltimaFecha('$C$21:$C'), /ARRAYFORMULA/)
  // SUMPRODUCT(MAX(...)) es lo que fuerza la evaluación de array sin derrame.
  assert.match(formulaUltimaFecha('$C$21:$C'), /^SUMPRODUCT\(MAX\(/)
})

// ═══ LOCALE es-AR ═══

test('separador es-AR: los argumentos van con ";" — la coma es el decimal', () => {
  const r = rotuloAlDia('x', formulaFrescuraDe(['A', 'B']), { cola: 'en pesos' })
  // Ninguna coma puede aparecer: en es-AR una coma como separador de argumentos rompe la fórmula.
  assert.doesNotMatch(r, /,/, `hay una coma en la fórmula: ${r}`)
  assert.match(r, /MAX\(A;B\)/)
})

test('la fecha se muestra dd/mm/yyyy, no el número de serie ni el formato inglés', () => {
  assert.match(rotuloAlDia('x', 'F'), /TEXT\(F;"dd\/mm\/yyyy"\)/)
})

// ═══ LOS TRES ESTADOS QUE EL RÓTULO TIENE QUE SABER DECIR ═══

test('sin datos NO muestra una fecha de 1899: un MAX vacío formateado es un dato falso', () => {
  const r = rotuloAlDia('x', 'F')
  assert.match(r, /IF\(F=0;"⚠ sin datos cargados"/)
})

test('pasados los días de aviso el rótulo lo GRITA, en vez de envejecer callado', () => {
  const r = rotuloAlDia('x', 'F')
  assert.equal(DIAS_AVISO, 7, 'el mismo umbral que la columna Antigüedad de CAJA')
  assert.match(r, /IF\(TODAY\(\)-F>7;" · ⚠ hace "&TEXT\(TODAY\(\)-F;"0"\)&" días";""\)/)
})

test('la cola queda DESPUÉS de la fecha: el subtítulo termina en la unidad', () => {
  assert.ok(rotuloAlDia('x', 'F', { cola: 'en pesos' }).endsWith('&" · "&"en pesos"'))
})

// ═══ LAS COMILLAS QUE PARTEN UNA FÓRMULA AL MEDIO ═══

test('una comilla en el texto se escapa: si no, la celda entera queda en #ERROR!', () => {
  assert.equal(literal('dice "hola"'), '"dice ""hola"""')
  assert.match(rotuloAlDia('el "corte"', 'F'), /"el ""corte"" · "/)
})

// ═══ VARIAS PUERTAS, UNA SOLA FECHA ═══

test('con varias fuentes gana la MÁS NUEVA: cualquiera que se mueva mueve el rótulo', () => {
  assert.equal(formulaFrescuraDe(['A', 'B', 'C']), 'MAX(A;B;C)')
})

test('una sola fuente no se envuelve en MAX al pedo', () => {
  assert.equal(formulaFrescuraDe(['A']), 'A')
})

test('las fuentes vacías se descartan: una puerta que no existe no es una referencia rota', () => {
  // Es el caso real de un libro sin la réplica _BANCO_RAW: sin este filtro quedaba un MAX(;B) o una
  // referencia a una hoja inexistente, y el subtítulo entero se iba a #REF!.
  assert.equal(formulaFrescuraDe(['', 'B', null]), 'B')
})

test('sin ninguna fuente NO devuelve 0: eso diría "sin datos" culpando al dato', () => {
  assert.throws(() => formulaFrescuraDe([]), /sin fuentes/)
})

// ═══ EL PATRÓN BUENO QUE EL DUEÑO SEÑALÓ (la columna "Antigüedad" de CAJA) ═══

test('la antigüedad se mide contra la fecha del saldo, no contra la corrida', () => {
  assert.equal(
    formulaAntiguedad('F19'),
    '=IF(F19="";"⚠ sin cargar";IF(TODAY()-F19>7;"⚠ "&TEXT(TODAY()-F19;"0")&" días";TEXT(TODAY()-F19;"0")&" días"))',
    'este texto es EXACTAMENTE el que CAJA ya tenía: si cambia, cambió el patrón bueno',
  )
})
