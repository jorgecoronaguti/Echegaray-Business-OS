// LO QUE SE PRUEBA ACÁ ES QUE EL RÓTULO NO PUEDA VOLVER A MENTIR.
//
// El defecto original no daba error: la pestaña se veía perfecta y la fecha estaba mal. Por eso cada
// test de abajo ataca una forma CONCRETA de que vuelva a pasar, no la "forma general" de la fórmula.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIAS_AVISO, DIAS_AVISO_MENSUAL, literal, fechaNumerica, formulaUltimaFecha, formulaUltimaFechaConImporte,
  formulaUltimoPeriodo, formulaFrescuraDe, rotuloAlDia, rotuloPorFuente, formulaAntiguedad,
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
  assert.match(r, /IF\(F=0;"▲ sin datos cargados"/)
})

test('pasados los días de aviso el rótulo lo GRITA, en vez de envejecer callado', () => {
  const r = rotuloAlDia('x', 'F')
  assert.equal(DIAS_AVISO, 7, 'el mismo umbral que la columna Antigüedad de CAJA')
  assert.match(r, /IF\(TODAY\(\)-F>7;" · ▲ hace "&TEXT\(TODAY\(\)-F;"0"\)&" días";""\)/)
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
    '=IF(F19="";"▲ sin cargar";IF(TODAY()-F19>7;"▲ "&TEXT(TODAY()-F19;"0")&" días";TEXT(TODAY()-F19;"0")&" días"))',
    'este texto es EXACTAMENTE el que CAJA ya tenía: si cambia, cambió el patrón bueno',
  )
})

// ═══ LA FRESCURA SALE DE LA PLATA CARGADA, NO DEL ENCABEZADO DE LA FILA ═══

test('la frescura de un registro por bloques se condiciona al importe, no a la fecha sola', () => {
  // El defecto: la planilla de jornales escribe la fila de la quincena —con su "Hasta"— el día que la
  // abre, catorce días antes de que tenga un peso adentro. Un MAX sobre las fechas declara frescura
  // por un encabezado vacío. Sin el condicional al importe, este test se cae.
  const f = formulaUltimaFechaConImporte('$B$83:$B$96', '$J$83:$J$96')
  assert.match(f, /MAXIFS\(/)
  assert.match(f, /\$J\$83:\$J\$96;">0"/, 'tiene que exigir que la fila tenga importe')
})

test('la quincena en curso, con "Hasta" futuro y plata a medio cargar, no adelanta el rótulo', () => {
  assert.match(formulaUltimaFechaConImporte('$B$83:$B$96', '$J$83:$J$96'), /"<="&TODAY\(\)/)
})

test('el separador es el punto y coma de es-AR: una coma parte la fórmula', () => {
  assert.doesNotMatch(formulaUltimaFechaConImporte('$B$83:$B$96', '$J$83:$J$96'), /,/)
})

// ═══ UNA FUENTE MENSUAL DECLARA SU PERÍODO, NO EL DÍA EN QUE SE LEYÓ EL PDF ═══

test('el período "AAAA-MM" se convierte sin DATEVALUE: el locale del libro no puede decidir el mes', () => {
  // DATEVALUE("2026-06-01") depende del locale; en un libro es-AR puede leerse dd/mm y devolver otro
  // mes SIN dar error. DATE(VALUE(LEFT…);VALUE(MID…);1) no depende del locale de nadie.
  const f = formulaUltimoPeriodo('_F931_RAW!$A$4:$A')
  assert.doesNotMatch(f, /DATEVALUE/)
  assert.match(f, /DATE\(VALUE\(LEFT\(_F931_RAW!\$A\$4:\$A;4\)\);VALUE\(MID\(_F931_RAW!\$A\$4:\$A;6;2\)\);1\)/)
})

test('sin ningún período cargado devuelve 0, NO el 31/01/1900 que da EOMONTH(0;0)', () => {
  // Es la trampa: una fecha plausible y falsa es peor que un "sin datos". El cero se ataja ANTES del
  // EOMONTH, y `rotuloPorFuente` lo traduce a texto.
  const f = formulaUltimoPeriodo('_F931_RAW!$A$4:$A')
  assert.match(f, /^IF\(.*=0;0;EOMONTH\(/s, `el cero tiene que atajarse antes del EOMONTH: ${f}`)
})

test('el período declara el ÚLTIMO DÍA que cubre, no el primero', () => {
  assert.match(formulaUltimoPeriodo('_IIBB_RAW!$A$4:$A'), /EOMONTH\(/)
})

// ═══ FUENTES MIXTAS: NI MAX NI MIN — CADA UNA DECLARA LA SUYA ═══

test('con fuentes mixtas NO hay un MAX que las resuma: eso presta frescura viva a una congelada', () => {
  const r = rotuloPorFuente('Impuestos', [
    { nombre: 'ARCA', expr: 'A' },
    { nombre: 'F931', expr: 'B', avisoDias: 45 },
  ])
  // El defecto que esto evita: `MAX(A;B)` pondría la fecha de ARCA arriba del cuadro de F931.
  assert.doesNotMatch(r, /MAX\(A;B\)/)
  assert.match(r, /"ARCA al "/)
  assert.match(r, /"F931 al "/)
})

test('cada fuente lleva SU umbral: con uno solo, el ▲ de una DDJJ estaría prendido siempre', () => {
  const r = rotuloPorFuente('x', [
    { nombre: 'banco', expr: 'A' },
    { nombre: 'F931', expr: 'B', avisoDias: 45 },
  ])
  assert.match(r, /TODAY\(\)-A>7/, 'la fuente diaria avisa a los 7 días')
  assert.match(r, /TODAY\(\)-B>45/, 'la mensual, a los 45')
})

test('una fuente sin datos lo dice por su nombre y no se disfraza de fecha', () => {
  assert.match(rotuloPorFuente('x', [{ nombre: 'F931', expr: 'B' }]), /IF\(B=0;"F931 sin datos"/)
})

test('el rótulo por fuente es una FÓRMULA y no trae ninguna fecha estampada', () => {
  const r = rotuloPorFuente('x', [{ nombre: 'ARCA', expr: 'A' }], { cola: 'en pesos' })
  assert.ok(r.startsWith('='))
  assert.doesNotMatch(r.replace(/"dd\/mm"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/)
  assert.ok(r.endsWith('&" · "&"en pesos"'))
})

test('sin fuentes tampoco inventa: es el código el que falta, no el dato', () => {
  assert.throws(() => rotuloPorFuente('x', []), /sin fuentes/)
})

test('el umbral mensual es mayor que el diario, o el aviso no se apaga nunca', () => {
  assert.ok(DIAS_AVISO_MENSUAL > DIAS_AVISO)
})
