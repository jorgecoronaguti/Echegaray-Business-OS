// EL NÚCLEO PURO DEL MOTOR DE PLANILLAS. Sin API, sin red, sin base.
//
// Cada test de acá prueba una regla que, incumplida, ya costó plata o trabajo en este repo. El
// comentario de cada bloque dice cuál — un test sin esa línea es un test que nadie sabe por qué
// borrar cuando estorbe.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  citarHoja, contiene, descitarHoja, dimensiones, formatearCelda, formatearRango,
  indiceCol, letraCol, parsearCelda, parsearRango, rangoDeGrilla, rectangular,
} from './direcciones.mjs'
import { TIPOS, coincideTipo, esErrorSheet, fechaASerial, parsearFechaEsAr, parsearNumeroEsAr, serialAFecha, tipoDe, validarTipos } from './tipos.mjs'
import { compararEscritura, huella, mismaFormula, mismoValor, normalizar } from './verificacion.mjs'
import { FORMATOS, capacidades, formatoDe, permite } from './formatos.mjs'
import { buscar, columna, filtrar, leerTabla, normalizarClave, ordenar, planUpsert } from './tabla.mjs'
import { CODIGOS, esError } from './errores.mjs'

// ══════════════════════════════════════════════ direcciones ══════════════════════════════════════

test('direcciones · la columna va y vuelve, incluidas las de dos letras', () => {
  assert.equal(letraCol(0), 'A')
  assert.equal(letraCol(25), 'Z')
  assert.equal(letraCol(26), 'AA')
  assert.equal(letraCol(51), 'AZ')
  assert.equal(letraCol(701), 'ZZ')
  for (const i of [0, 25, 26, 51, 701, 1000]) assert.equal(indiceCol(letraCol(i)), i)
})

test('direcciones · una celda va y vuelve, y la fila de A1 es la 0', () => {
  assert.deepEqual(parsearCelda('A1'), { fila: 0, col: 0 })
  assert.deepEqual(parsearCelda('$C$7'), { fila: 6, col: 2 })
  assert.equal(formatearCelda({ fila: 6, col: 2 }), 'C7')
})

// UN RANGO ABIERTO CAMBIA DE SIGNIFICADO CUANDO ALGUIEN AGREGA UNA FILA. En este repo eso ya dejó
// plata afuera de un total. El motor tiene que poder DECIRLO, no descubrirlo en Google.
test('direcciones · un rango abierto queda marcado como abierto', () => {
  for (const abierto of ['A:A', 'Hoja!A:C', 'Hoja!5:9', 'A5:C']) {
    assert.equal(parsearRango(abierto).abierto, true, `"${abierto}" tendría que salir abierto`)
  }
  for (const cerrado of ['A1:C10', "'Panel Caja'!A5:C1000", 'B7']) {
    assert.equal(parsearRango(cerrado).abierto, false, `"${cerrado}" tendría que salir cerrado`)
  }
})

test('direcciones · el nombre de hoja con espacios o punto se cita, y vuelve entero', () => {
  assert.equal(citarHoja('Panel Caja'), "'Panel Caja'")
  assert.equal(citarHoja('Hoja.2'), "'Hoja.2'")
  assert.equal(citarHoja('Compras'), 'Compras')
  // Una hoja que se llama como una celda ("A1") TIENE que citarse o el rango es ambiguo.
  assert.equal(citarHoja('A1'), "'A1'")
  assert.equal(descitarHoja(citarHoja("Don't")), "Don't")
  const r = parsearRango("'Panel Caja'!A1:C3")
  assert.equal(r.hoja, 'Panel Caja')
  assert.equal(formatearRango(r), "'Panel Caja'!A1:C3")
})

test('direcciones · un rango al revés es un error, no un rango vacío', () => {
  assert.throws(() => parsearRango('A70:O69'), (e) => esError(e, CODIGOS.RANGO_INVALIDO))
})

// EL BLOQUE DECLARA TODO SU ANCHO. Con filas de largo distinto, tomar el ancho de la fila 0 deja
// columnas sin cubrir y ahí sobrevive la capa fósil de la corrida anterior.
test('direcciones · el rango de una grilla toma el ancho de la fila MÁS ANCHA', () => {
  const r = rangoDeGrilla('Compras', 'B2', [['a'], ['b', 'c', 'd'], ['e', 'f']])
  assert.equal(formatearRango(r), 'Compras!B2:D4')
  assert.deepEqual(dimensiones(r), { filas: 3, columnas: 3 })
})

test('direcciones · rectangular rellena los huecos para que la comparación tenga contra qué comparar', () => {
  assert.deepEqual(rectangular([['a'], ['b', 'c']], { filas: 3, columnas: 2 }),
    [['a', ''], ['b', 'c'], ['', '']])
})

test('direcciones · contiene sólo vale entre rangos cerrados de la misma hoja', () => {
  const g = parsearRango('Compras!A1:D10')
  assert.equal(contiene(g, parsearRango('Compras!B2:C5')), true)
  assert.equal(contiene(g, parsearRango('Compras!B2:E5')), false)
  assert.equal(contiene(g, parsearRango('Otra!B2:C5')), false)
  assert.equal(contiene(g, parsearRango('Compras!A:A')), false)
})

// ══════════════════════════════════════════════ tipos ══════════════════════════════════════════

// LA TRAMPA dd/mm/yy. `new Date("05/08/26")` en Node da el 26 de mayo de 2008: mes, día y año, los
// tres mal. Un parser así ya vació una columna de fechas entera en este repo.
test('tipos · una fecha es-AR se lee día/mes, y el año de dos dígitos usa la ventana 1970-2069', () => {
  assert.equal(parsearFechaEsAr('05/08/2026').toISOString().slice(0, 10), '2026-08-05')
  assert.equal(parsearFechaEsAr('05/08/26').toISOString().slice(0, 10), '2026-08-05')
  assert.equal(parsearFechaEsAr('05/08/85').toISOString().slice(0, 10), '1985-08-05')
  // Lo que Node haría mal, para que quede la comparación a la vista:
  assert.notEqual(new Date('05/08/26').getUTCMonth(), 7)
})

test('tipos · el 31 de febrero no existe y no se corrige en silencio', () => {
  assert.equal(parsearFechaEsAr('31/02/2026'), null)
  assert.equal(parsearFechaEsAr('32/01/2026'), null)
  assert.equal(parsearFechaEsAr('cualquier cosa'), null)
})

test('tipos · el serial de Sheets va y vuelve sin correrse un día', () => {
  const d = new Date(Date.UTC(2026, 7, 5))
  assert.equal(serialAFecha(fechaASerial(d)).toISOString(), d.toISOString())
  assert.equal(fechaASerial(new Date(Date.UTC(1899, 11, 30))), 0)
})

// EL NÚMERO ES-AR. "1.234" es ambiguo (mil doscientos treinta y cuatro o 1,234) y adivinarlo es cómo
// un importe se multiplica por mil sin que nadie lo note.
test('tipos · el número es-AR se parsea, y el ambiguo devuelve null en vez de adivinar', () => {
  assert.equal(parsearNumeroEsAr('1.234,56'), 1234.56)
  assert.equal(parsearNumeroEsAr('$ 1.234,56'), 1234.56)
  assert.equal(parsearNumeroEsAr('-45,5'), -45.5)
  assert.equal(parsearNumeroEsAr('1.234'), null, 'ambiguo: no se adivina')
  assert.equal(parsearNumeroEsAr('hola'), null)
})

test('tipos · un error de Sheets se reconoce, y un texto que empieza con # no', () => {
  assert.equal(esErrorSheet('#REF!'), true)
  assert.equal(esErrorSheet('#N/A'), true)
  assert.equal(esErrorSheet('#¡DIV/0!'), true)
  assert.equal(esErrorSheet('#1 Proveedor'), false, 'un texto con # no es un error')
})

test('tipos · el tipo de una celda distingue fórmula, error, fecha, número y texto', () => {
  assert.equal(tipoDe(1234), TIPOS.NUMERO)
  assert.equal(tipoDe(''), TIPOS.VACIO)
  assert.equal(tipoDe('=SUM(A1:A2)'), TIPOS.FORMULA)
  assert.equal(tipoDe(1234, { formula: '=A1*2' }), TIPOS.FORMULA)
  assert.equal(tipoDe('#REF!'), TIPOS.ERROR)
  assert.equal(tipoDe('05/08/2026'), TIPOS.FECHA)
  assert.equal(tipoDe('ACME S.A.'), TIPOS.TEXTO)
  assert.equal(tipoDe(true), TIPOS.BOOLEANO)
})

// UNA CELDA VACÍA NO ES UN DATO DEL TIPO EQUIVOCADO. Si lo fuera, cada tabla con huecos sería un
// muro de falsos positivos y la validación se apagaría — perdiendo con ella la detección real.
test('tipos · la validación acepta el vacío y rechaza el texto en una columna de importes', () => {
  assert.equal(coincideTipo('', TIPOS.NUMERO), true)
  assert.equal(coincideTipo('mil quinientos', TIPOS.NUMERO), false)
  assert.equal(coincideTipo('=A1*2', TIPOS.NUMERO), true, 'una fórmula puede dar cualquier tipo')
  assert.equal(coincideTipo('05/08/2026', TIPOS.NUMERO), true, 'una fecha ES un número en Sheets')
  assert.equal(coincideTipo(1234, TIPOS.FECHA), false, 'pero no todo número es una fecha')

  const malas = validarTipos([[1, 'x'], ['mil', 'y']], [TIPOS.NUMERO, null])
  assert.equal(malas.length, 1)
  assert.deepEqual({ fila: malas[0].fila, col: malas[0].col, valor: malas[0].valor }, { fila: 1, col: 0, valor: 'mil' })
})

// ══════════════════════════════════════════ verificación ══════════════════════════════════════

test('verificación · el número escrito y el releído son el mismo dato aunque cambie el formato', () => {
  assert.equal(mismoValor(1234.5, '1.234,5'), true)
  assert.equal(mismoValor(1234.5, 1234.5000000001), true, 'redondeo de double, no cambio de dato')
  assert.equal(mismoValor(1234.5, 1234.6), false)
  assert.equal(mismoValor('ACME ', 'ACME'), true)
  assert.equal(normalizar('#REF!').tipo, TIPOS.ERROR)
})

// EL SEPARADOR NO SE COMPARA. `google.mjs` convierte la fórmula canónica a es-AR antes de mandarla;
// exigir igualdad literal pondría en rojo justo la conversión que TIENE que ocurrir.
test('verificación · una fórmula es la misma con ; que con , y con espacios de más', () => {
  assert.equal(mismaFormula('=SUM(A1,A2)', '=SUM(A1;A2)'), true)
  assert.equal(mismaFormula('=SUM( A1 , A2 )', '=SUM(A1;A2)'), true)
  assert.equal(mismaFormula('=SUM(A1,A2)', '=SUM(A1,A3)'), false)
  // Los DOS PUNTOS NO son un separador: `SUM(B1:B3)` es un rango y `SUM(B1;B3)` son dos celdas
  // sueltas. Tratarlos como equivalentes dejaría pasar una fórmula que suma tres celdas donde el
  // llamador pidió sumar dos.
  assert.equal(mismaFormula('=SUM(B1:B3)', '=SUM(B1;B3)'), false)
  // Dentro de un literal de texto el punto y coma NO se toca: es contenido, no sintaxis.
  assert.equal(mismaFormula('=CONCAT("a;b")', '=CONCAT("a,b")'), false)
})

// LA TRAMPA QUE CASI COSTÓ $46.435.828. Comparar con render FORMULA miente sobre las celdas
// derramadas: la salida de un QUERY no tiene fórmula propia y el diff la ve como borrada.
test('verificación · sólo se compara la fórmula DONDE SE ESCRIBIÓ una fórmula', () => {
  const esperado = [['=ROUND(SUM(B1:B3),2)', 'texto']]
  // La segunda celda vuelve VACÍA en el render de fórmulas —es un literal, no tiene fórmula— y eso
  // NO puede contar como diferencia. Si contara, todo derrame se reportaría como borrado.
  const leidoValores = [[100, 'texto']]
  const leidoFormulas = [['=ROUND(SUM(B1:B3);2)', '']] // el `;` es la localización, no un cambio
  assert.deepEqual(compararEscritura(esperado, leidoValores, leidoFormulas), { ok: true, diferencias: [] })
})

test('verificación · una fórmula que aterrizó perfecta pero devuelve #REF! es una escritura fallida', () => {
  const r = compararEscritura([['=SUM(Otra!A1:A3)']], [['#REF!']], [['=SUM(Otra!A1:A3)']])
  assert.equal(r.ok, false)
  assert.equal(r.diferencias[0].motivo, 'formula_en_error')
})

test('verificación · la huella cambia cuando cambia el dato y no cuando cambia el formato', () => {
  assert.equal(huella([[1234.5, 'ACME']]), huella([['1.234,5', 'ACME ']]), 'mismo dato, otra apariencia')
  assert.notEqual(huella([[1234.5]]), huella([[1234.6]]))
  assert.notEqual(huella([[1]]), huella([[1], ['']]), 'el alto también cuenta')
})

// ══════════════════════════════════════════ formatos ══════════════════════════════════════════

test('formatos · el MIME manda, y sin MIME manda la extensión', () => {
  assert.equal(formatoDe({ mimeType: 'application/vnd.google-apps.spreadsheet' }), FORMATOS.GOOGLE)
  assert.equal(formatoDe({ mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12' }), FORMATOS.XLSM)
  assert.equal(formatoDe({ mimeType: 'application/octet-stream', name: 'Presupuesto.xlsm' }), FORMATOS.XLSM)
  assert.equal(formatoDe({ mimeType: 'application/pdf' }), FORMATOS.DESCONOCIDO)
})

// XLSM SE LEE Y NO SE ESCRIBE, Y SE DICE POR QUÉ. Un motor que "soporta XLSM" con SheetJS community
// no lo soporta: lo abre, le borra las macros y la validación, y devuelve ok.
test('formatos · un .xlsm se lee y NUNCA se escribe, con el motivo dicho', () => {
  const cap = capacidades(FORMATOS.XLSM)
  assert.equal(cap.leer, true)
  assert.equal(cap.escribir, false)
  assert.equal(cap.estructura, false)
  assert.match(cap.motivo, /macros|VBA/i)
  assert.ok(cap.alternativa, 'un NO sin alternativa deja al llamador sin salida')
  assert.equal(permite(FORMATOS.XLSM, 'leer'), null)
  assert.equal(permite(FORMATOS.XLSM, 'escribir')?.formato, FORMATOS.XLSM)
  assert.equal(permite(FORMATOS.GOOGLE, 'escribir'), null)
})

// ══════════════════════════════════════════ tabla ══════════════════════════════════════════

const GRID = [
  ['Proveedor', 'Fecha', 'Neto', 'Obra'],
  ['ACME S.A.', '05/08/2026', 120000, 'Quattropani'],
  ['  acme  s.a. ', '12/08/2026', 45500.5, 'San Francisco'],
  ['Corralón Norte', '02/08/2026', 210000, ''],
  ['Ferretería Sur', '', 9000, 'Quattropani'],
]

// LA CLAVE SE RECORTA DE LOS DOS LADOS. Este repo ya tuvo una clave recortada en JS y cruda en el
// COUNTIFS del Sheet: la suma dio 3,58 veces de menos.
test('tabla · la clave normaliza espacios, acentos y mayúsculas — una sola definición', () => {
  assert.equal(normalizarClave('  ACME  S.A. '), 'acme s.a.')
  assert.equal(normalizarClave('Corralón'), 'corralon')
  assert.equal(normalizarClave('  ACME  S.A. '), normalizarClave('acme s.a.'))
})

test('tabla · buscar encuentra por clave normalizada y devuelve el índice para poder reescribir', () => {
  const t = leerTabla(GRID)
  assert.equal(columna(t, 'neto'), 2, 'la columna se ubica por nombre, no por posición')
  const r = buscar(t, 'Proveedor', 'ACME S.A.')
  assert.equal(r.resultados.length, 2, 'las dos escrituras de ACME son el mismo proveedor')
  assert.deepEqual(r.resultados.map((x) => x.indice), [0, 1])
  assert.equal(buscar(t, 'Proveedor', 'ferre', { exacto: false }).resultados.length, 1)
  assert.equal(buscar(t, 'ColumnaQueNoExiste', 'x').columna, -1)
})

test('tabla · filtrar compara números como números, no como texto', () => {
  const t = leerTabla(GRID)
  assert.equal(filtrar(t, [{ campo: 'Neto', op: '>', valor: 100000 }]).resultados.length, 2)
  assert.equal(filtrar(t, [{ campo: 'Obra', op: 'vacio' }]).resultados.length, 1)
  assert.equal(filtrar(t, [
    { campo: 'Obra', op: '=', valor: 'quattropani' },
    { campo: 'Neto', op: '<', valor: 100000 },
  ]).resultados.length, 1, 'las condiciones se cumplen TODAS')
  assert.deepEqual(filtrar(t, [{ campo: 'Inexistente', op: '=', valor: 1 }]).columnasFaltantes, ['Inexistente'])
})

// "10/01/2026" ordenado como TEXTO va antes que "9/01/2026" porque "1" < "9". Una fecha se ordena
// como fecha o el cuadro cronológico miente.
test('tabla · ordenar por fecha usa la fecha, y las vacías van al final en los dos sentidos', () => {
  const t = leerTabla(GRID)
  assert.deepEqual(ordenar(t, [{ campo: 'Fecha' }]).orden, [2, 0, 1, 3])
  assert.deepEqual(ordenar(t, [{ campo: 'Fecha', desc: true }]).orden, [1, 0, 2, 3])
  assert.deepEqual(ordenar(t, [{ campo: 'Neto' }]).filas.map((f) => f[2]), [9000, 45500.5, 120000, 210000])
})

test('tabla · ordenar es estable: ante un empate gana el orden de llegada', () => {
  const t = leerTabla([['k', 'v'], ['a', 1], ['a', 2], ['a', 3]])
  assert.deepEqual(ordenar(t, [{ campo: 'k' }]).orden, [0, 1, 2])
})

// SE TOCA SÓLO LA CELDA QUE CAMBIA. Escribir la fila entera pisaría con vacíos las columnas que el
// registro entrante no trae — las anotaciones de la persona y las fórmulas de la planilla.
test('tabla · el upsert propone celdas, no filas, y no elige entre dos duplicadas', () => {
  const t = leerTabla(GRID)
  const plan = planUpsert(t, 'Proveedor', [
    { Proveedor: 'Corralón Norte', Obra: 'Quattropani' },       // existe → una sola celda
    { Proveedor: 'Corralón Norte', Neto: 210000 },              // ya está igual → nada
    { Proveedor: 'Vidriería Este', Neto: 9000, Obra: 'Nueva' }, // no existe → alta
  ])
  assert.deepEqual(plan.ediciones.map((e) => ({ i: e.indice, campo: e.campo, a: e.a })),
    [{ i: 2, campo: 'Obra', a: 'Quattropani' }])
  assert.equal(plan.altas.length, 1)
  assert.deepEqual(plan.altas[0], ['Vidriería Este', '', 9000, 'Nueva'])
  // ACME está dos veces: elegir cuál es "la buena" es una decisión de negocio, no del motor.
  assert.equal(plan.conflictos.length, 1)
  assert.deepEqual(plan.conflictos[0].indices, [0, 1])
})

test('tabla · un campo que el encabezado no tiene se declara ignorado, no se agrega una columna sola', () => {
  const t = leerTabla(GRID)
  const plan = planUpsert(t, 'Proveedor', [{ Proveedor: 'Nuevo', CUIT: '30-1234-5' }])
  assert.deepEqual(plan.camposIgnorados, ['CUIT'])
  assert.equal(plan.altas[0].length, 4, 'la fila sigue teniendo el ancho del encabezado')
})
