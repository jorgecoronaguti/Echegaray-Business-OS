import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partirTexto, notasDeColumna, altoDeParrafo, entranEn, origenANota } from './nota-celda.mjs'

test('un texto que entra en la celda no genera nota', () => {
  // Una nota que repite lo que ya se ve es ruido.
  assert.deepEqual(partirTexto('Arqueo de caja', 44), { corto: 'Arqueo de caja', nota: null })
})

test('un texto largo deja la etiqueta en la celda y el detalle en la nota', () => {
  const t = 'Acuerdo N° 00007, Activo · vence el 2026-12-03 · TNA 55% · costo financiero total 62,78% anual'
  const { corto, nota } = partirTexto(t, 44)
  assert.ok(corto.length <= 46, `la etiqueta tiene que entrar: ${corto.length}`)
  assert.match(corto, /…$/)
  assert.equal(nota, t)          // el texto completo NO se pierde: es la trazabilidad
  assert.ok(t.startsWith(corto.replace('…', '').trim()))
})

test('el corte respeta el separador de campos y no parte una palabra', () => {
  const t = 'Santander Empresas · captura del 21/07/2026 09:19 · réplica del banco'
  const { corto } = partirTexto(t, 44)
  // La etiqueta tiene que terminar donde termina una palabra: el carácter siguiente en el original
  // es un espacio o un separador, nunca el medio de "Empres|as".
  const prefijo = corto.replace('…', '')
  assert.ok(t.startsWith(prefijo))
  assert.match(t.charAt(prefijo.length), /[\s·]|^$/)
})

test('las notas se arman por columna y sólo donde hacen falta', () => {
  const filas = [['Caja', 'Arqueo'], ['Banco', 'x'.repeat(120)]]
  const { requests, celdas, conNota } = notasDeColumna(filas, 1, 7, 44)
  assert.equal(conNota, 1)
  assert.equal(requests.length, 1)
  assert.equal(celdas[0][1], 'Arqueo')            // la corta queda igual
  assert.ok(celdas[1][1].length < 50)             // la larga se acorta
  assert.equal(requests[0].updateCells.rows[0].values[0].note.length, 120)
})

test('un párrafo declara cuánto alto necesita', () => {
  // 300 caracteres en una fila de 20px es lo que hoy hace ilegible la introducción de CAJA.
  assert.ok(altoDeParrafo('x'.repeat(300), 1500) > 20)
  assert.equal(altoDeParrafo('', 400), 20)
  assert.ok(entranEn(300) > 40 && entranEn(300) < 60)
})

test('una FÓRMULA nunca se acorta: cortarla la deja sin parsear y la celda vacía', () => {
  // Regresión real (21/07): las tres alertas de CAJA perdieron su explicación porque la fórmula
  // =CONCATENATE(...) se cortó a 44 caracteres y Sheets no pudo leerla.
  const f = '=CONCATENATE("fila 33: lo que Cobranzas dice que hay en echeq (";TEXT(C32;"$#.##0");")")'
  const { corto, nota } = partirTexto(f, 44)
  assert.equal(corto, f)
  assert.equal(nota, null)
})

test('origenANota saca la procedencia del cuerpo y la cuelga del concepto', () => {
  const filas = [['Concepto', 'ene', 'Origen'], ['F931', 100, 'Compras · por fecha de caja']]
  const { requests, conNota } = origenANota(filas, 2, 7)
  assert.equal(conNota, 1)
  assert.equal(filas[1][2], '', 'la columna de origen queda vacía: deja de robar ancho')
  assert.equal(filas[1][1], 100, 'el dato no se toca')
  const r = requests[0].updateCells
  assert.equal(r.range.startColumnIndex, 0, 'la nota cuelga del concepto, no del importe')
  assert.equal(r.range.startRowIndex, 1)
  assert.equal(r.rows[0].values[0].note, 'Compras · por fecha de caja')
})

test('origenANota no toca una fórmula ni una celda vacía', () => {
  const filas = [['x', 1, ''], ['y', 2, '=A1&"algo"']]
  const { conNota } = origenANota(filas, 2, 7)
  assert.equal(conNota, 0)
  assert.equal(filas[1][2], '=A1&"algo"')
})

test('el centinela del generador NUNCA se convierte en una nota', async () => {
  const { VACIO } = await import('./preservar-anotaciones.mjs')
  const filas = [['Vacaciones', '', VACIO]]
  const { requests, conNota } = origenANota(filas, 2, 7)
  assert.equal(conNota, 0, 'no crea una nota que diga "::VACIO::"')
  assert.equal(requests.length, 0)
  assert.equal(filas[0][2], '', 'y además limpia la celda')
})

// ═══ `borrarNotas` BORRA NOTAS, NO COLUMNAS (03/08) ═══
//
// LA TRAMPA, MEDIDA. Tres generadores —impuestos, cargas sociales, jornales— llaman a `borrarNotas`
// convencidos de que con eso su columna "De dónde sale" desaparece de la planilla. No desaparece, por
// dos razones independientes, y las dos son invisibles leyendo el call site:
//
//   1 · La llaman desde `formatear()`, que corre DESPUÉS de `escribirPreservando`. Cuando muta la
//       grilla, el texto ya se escribió.
//   2 · Aunque la llamaran antes, blanquea con `''`, y para la fusión `''` significa "no es mi celda":
//       PRESERVA lo que hubiera. El único valor que limpia es el centinela VACIO.
//
// Medido en el snapshot del 03/08 del archivo real: 44 celdas de prosa en la columna O de Impuestos y
// 58 en la de Cargas Sociales, con la pestaña ya "sin notas" según el código. Este test fija lo que la
// función HACE para que nadie más vuelva a creerle lo que su nombre promete.
test('borrarNotas blanquea con "", que la fusión PRESERVA: no saca la columna de la planilla', async () => {
  const { borrarNotas } = await import('./nota-celda.mjs')
  const { fusionar, VACIO } = await import('./preservar-anotaciones.mjs')
  const filas = [['IVA', 100, 'DDJJ F.2002 del último período presentado']]
  borrarNotas(filas, 2, 1)
  assert.equal(filas[0][2], '', 'hoy blanquea con cadena vacía')
  // Y eso, contra lo que ya está en la pestaña, deja el texto intacto.
  const quedaria = fusionar(filas, [['IVA', 100, 'DDJJ F.2002 del último período presentado']])
  assert.equal(quedaria[0][2], 'DDJJ F.2002 del último período presentado',
    'con "" la fusión conserva el texto viejo: la columna NO se va')
  // El centinela sí la saca. Es lo que hace caja-pestana desde hoy con su columna H.
  const conCentinela = fusionar([['IVA', 100, VACIO]], [['IVA', 100, 'DDJJ F.2002…']])
  assert.equal(conCentinela[0][2], '', 'el centinela VACIO es lo único que limpia')
})

// ═══ LA QUE SÍ SACA LA COLUMNA (03/08) ═══
//
// El test de arriba fija que `borrarNotas` NO saca la columna. Éste fija que `vaciarColumnaDeProsa`
// sí, y la diferencia es exactamente un valor: `''` significa "no es mi celda" y la fusión preserva
// lo que hubiera; `VACIO` significa "es mi celda y va vacía" y la fusión la limpia.

test('vaciarColumnaDeProsa marca la columna con VACIO: la fusión SÍ la limpia', async () => {
  const { vaciarColumnaDeProsa } = await import('./nota-celda.mjs')
  const { VACIO, fusionar } = await import('./preservar-anotaciones.mjs')
  const filas = [['Concepto', 100, 'De dónde sale'], ['IVA', 200, 'F.2051 · lo que sea']]
  vaciarColumnaDeProsa(filas, 2)
  assert.equal(filas[0][2], VACIO)
  assert.equal(filas[1][2], VACIO)
  // Y contra lo que la pestaña ya tenía: la prosa se va, el resto se queda.
  const existente = [['Concepto', 100, 'De dónde sale'], ['IVA', 200, 'F.2051 · lo que sea']]
  const out = fusionar(filas, existente)
  assert.equal(out[1][2], '', 'la prosa tenía que quedar vacía')
  assert.equal(out[1][0], 'IVA', 'el concepto no se toca')
  assert.equal(out[1][1], 200, 'el número no se toca')
})

test('ensancha la fila corta sin borrar nada: el relleno es "", que la fusión preserva', async () => {
  const { vaciarColumnaDeProsa } = await import('./nota-celda.mjs')
  const { VACIO, fusionar } = await import('./preservar-anotaciones.mjs')
  const filas = [['solo A']]
  vaciarColumnaDeProsa(filas, 3)
  assert.equal(filas[0].length, 4)
  assert.equal(filas[0][3], VACIO)
  // La columna C es del dueño y quedó como relleno '': tiene que sobrevivir la fusión.
  const out = fusionar(filas, [['solo A', 'suyo B', 'suyo C', 'prosa']])
  assert.deepEqual(out[0], ['solo A', 'suyo B', 'suyo C', ''])
})
