// LOS TRES CASOS REALES DE LA HUELLA POR CELDA, más los seguros que la sostienen.
//
// Cada test de acá abajo prueba un DEFECTO que ya pasó, no el código que lo cura: si se revierte
// `aplicarHuella` a "escribir siempre", los tres primeros se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formaDe, huellaDe, claveCelda, aplicarHuella, huellasDeEscritura, mejorDesplazamiento,
  coincidencias, MIN_COMPARABLES,
} from './huella-celda.mjs'
import { VACIO, fusionar } from './preservar-anotaciones.mjs'

/** Arma el mapa de huellas como lo devuelve `leerHuellas`, a partir de la grilla que el OS escribió. */
const huellasDe = (grid, opts = {}) =>
  new Map(huellasDeEscritura(grid, opts).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))

/**
 * Relleno para superar MIN_COMPARABLES: filas propias que nadie toca, así la alineación es creíble.
 * Los rótulos llevan LETRA y no número a propósito: `Ancla 1` y `Ancla 2` tienen la MISMA forma
 * (el número se enmascara), y con formas idénticas cualquier desplazamiento alinearía — el lastre
 * dejaría de ser un control.
 */
const lastre = (n = MIN_COMPARABLES + 2) =>
  Array.from({ length: n }, (_, k) => [`Ancla ${'abcdefghijklmnopqrstuvwxyz'[k % 26]} de control`])

test('(a) el dueño borra un rótulo que el generador escribió: NO vuelve', () => {
  const ayer = [...lastre(), ['ACTIVIDADES OPERATIVAS'], ['Cobranzas de obra civil']]
  const huellas = huellasDe(ayer)
  // El dueño vació la fila del rótulo. Todo lo demás sigue igual.
  const hoy = ayer.map((f, i) => (i === ayer.length - 2 ? [''] : f))
  const { grid, suprimidas, alineacion } = aplicarHuella(ayer, hoy, huellas)
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  assert.equal(grid[ayer.length - 2][0], '', 'el rótulo borrado NO se vuelve a escribir')
  assert.equal(suprimidas.length, 1)
  assert.equal(suprimidas[0].mio, 'ACTIVIDADES OPERATIVAS')
  // Y lo que el dueño no tocó se sigue escribiendo: la huella no congela la pestaña entera.
  assert.equal(grid.at(-1)[0], 'Cobranzas de obra civil')
  // La prueba del efecto: al fusionar, la celda queda VACÍA, no reescrita.
  assert.equal(fusionar(grid, hoy)[ayer.length - 2][0], '')
})

test('(b) el generador cambia un importe de su propia celda: SÍ se actualiza', () => {
  const ayer = [...lastre(), ['Saldo del banco', '$ 1.234.567,89']]
  const huellas = huellasDe(ayer)
  const hoy = ayer                                    // la pestaña muestra lo de ayer
  const nuevo = [...lastre(), ['Saldo del banco', '$ 9.870.000,00']]
  const { grid, suprimidas, ajenas } = aplicarHuella(nuevo, hoy, huellas)
  assert.equal(grid.at(-1)[1], '$ 9.870.000,00', 'la celda propia se actualiza con el importe de hoy')
  assert.deepEqual(suprimidas, [])
  assert.deepEqual(ajenas, [])
})

test('(c) un rótulo con la fecha de hoy adentro NO cuenta como borrado', () => {
  const ayer = [...lastre(), ['Conciliación del OS al 2026-08-04 — 3 diferencias']]
  const huellas = huellasDe(ayer)
  const hoy = ayer                                    // la pestaña sigue mostrando el de ayer
  const nuevo = [...lastre(), ['Conciliación del OS al 2026-08-05 — 7 diferencias']]
  // La forma es la misma: la fecha y el contador están enmascarados.
  assert.equal(formaDe(ayer.at(-1)[0]), formaDe(nuevo.at(-1)[0]))
  const { grid, suprimidas, alineacion } = aplicarHuella(nuevo, hoy, huellas)
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  assert.equal(grid.at(-1)[0], 'Conciliación del OS al 2026-08-05 — 7 diferencias')
  assert.deepEqual(suprimidas, [], 'un texto que cambia porque lleva la fecha de hoy no es un borrado')
})

test('una celda que nunca fue mía y tiene contenido del dueño no se pisa jamás', () => {
  const mio = [...lastre(), ['Total del mes', 100]]
  const huellas = huellasDe(mio)
  // El dueño anotó a la derecha, en una columna que la huella nunca registró.
  const hoy = mio.map((f, i) => (i === mio.length - 1 ? [...f, 'ojo: falta la factura de Arcor'] : f))
  const quiereEscribir = mio.map((f, i) => (i === mio.length - 1 ? [...f, 'Observaciones'] : f))
  const { grid, ajenas } = aplicarHuella(quiereEscribir, hoy, huellas)
  assert.equal(grid.at(-1)[2], '', 'no se pisa: al fusionar queda la nota del dueño')
  assert.equal(fusionar(grid, hoy).at(-1)[2], 'ojo: falta la factura de Arcor')
  assert.equal(ajenas.length, 1)
})

test('el centinela VACIO tampoco limpia una celda ajena', () => {
  // Pérdida documentada: "columna del dueño fuera del footprint — anchoHoja rellena igual; le borré
  // 14 fechas dos veces". El generador manda VACIO sobre una columna que nunca fue suya.
  const mio = [...lastre(), ['Fila propia']]
  const huellas = huellasDe(mio)
  const hoy = mio.map((f, i) => (i === mio.length - 1 ? [...f, '12/03/2026'] : f))
  const quiere = mio.map((f, i) => (i === mio.length - 1 ? [...f, VACIO] : f))
  const { grid, ajenas } = aplicarHuella(quiere, hoy, huellas)
  assert.equal(fusionar(grid, hoy).at(-1)[1], '12/03/2026', 'la fecha del dueño sobrevive')
  assert.equal(ajenas.length, 1)
})

test('una fórmula que se ve vacía no se lee como borrada (se compara contra la lectura FORMULA)', () => {
  const ayer = [...lastre(), ['=SI(A#="";"";SUMA(B4:B9))'.replace(/#/g, '1')]]
  const huellas = huellasDe(ayer)
  const { grid, suprimidas } = aplicarHuella(ayer, ayer, huellas)
  assert.deepEqual(suprimidas, [], 'la celda tiene fórmula: hay contenido, no está borrada')
  assert.equal(grid.at(-1)[0], ayer.at(-1)[0])
})

test('si la pestaña se corrió una fila, la huella sigue alineada y no suprime de más', () => {
  // El defecto de la primera versión de la Regla 0: una fila de subtítulo nueva corrió todo un
  // renglón y la regla "respetó" un importe pegado donde iba un título.
  const ayer = [...lastre(), ['TOTAL DISPONIBILIDADES', '$ 10.000,00']]
  const huellas = huellasDe(ayer)
  const hoy = [['Subtítulo nuevo del dueño'], ...ayer]     // todo bajó una fila
  const nuevo = [['Subtítulo nuevo del dueño'], ...ayer]
  const { suprimidas, ajenas, alineacion } = aplicarHuella(nuevo, hoy, huellas)
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  // Convención del signo: `off` es cuánto hay que correr el MAPA para encontrar la celda en la
  // pestaña de hoy. La pestaña bajó una fila ⇒ off = +1.
  assert.equal(alineacion.off, 1, 'detecta el corrimiento de una fila')
  assert.deepEqual(suprimidas, [])
  assert.deepEqual(ajenas.map((a) => a.suyo), ['Subtítulo nuevo del dueño'])
})

test('sin huella previa la regla NO decide: la primera corrida siembra, no congela', () => {
  const nuevo = [...lastre(), ['Título nuevo']]
  const { grid, suprimidas, ajenas, alineacion } = aplicarHuella(nuevo, [], new Map())
  assert.equal(alineacion.alineada, false)
  assert.match(alineacion.motivo, /sin huella previa/)
  assert.deepEqual(grid, nuevo, 'se escribe igual que hoy: la huella arranca en la corrida siguiente')
  assert.deepEqual([...suprimidas, ...ajenas], [])
})

test('si el mapa ya no cae donde dice, la huella no decide (fail-closed hacia lo tímido)', () => {
  const ayer = lastre(20)
  const huellas = huellasDe(ayer)
  const otraCosa = Array.from({ length: 20 }, (_, k) => [`Nada que ver ${k} distinto`])
  const r = mejorDesplazamiento(otraCosa, huellas)
  assert.equal(r.alineada, false)
  assert.match(r.motivo, /ya no cae donde dice/)
  const { grid } = aplicarHuella(ayer, otraCosa, huellas)
  assert.deepEqual(grid, ayer, 'no suprime nada con un mapa que no puede probar')
})

test('las celdas vacías no cuentan para juzgar la alineación', () => {
  // Si contaran, cada borrado del dueño empujaría el veredicto a "desalineada" y la huella dejaría
  // de proteger justo cuando hace falta.
  const ayer = lastre(12)
  const huellas = huellasDe(ayer)
  const hoy = ayer.map((f, i) => (i < 6 ? [''] : f))
  const r = coincidencias(hoy, huellas, 0, {})
  assert.equal(r.comparables, 6)
  assert.equal(r.coinciden, 6)
})

test('formaDe enmascara fecha, importe, porcentaje y número; y una celda vacía no tiene forma', () => {
  assert.equal(formaDe('Al 4/8/2026'), formaDe('Al 12/11/2025'))
  assert.equal(formaDe('$ 1.234,56'), formaDe('-$9.999.999,00'))
  assert.equal(formaDe('12,5%'), formaDe('3%'))
  assert.equal(formaDe("'ene-26"), formaDe('ago-2026'))
  assert.equal(formaDe(''), '')
  assert.equal(formaDe(null), '')
  assert.equal(formaDe(VACIO), '')
  assert.equal(huellaDe(''), null)
  // Dos rótulos distintos NO comparten forma: la máscara no borra el texto.
  assert.notEqual(formaDe('Cobranzas de obra civil'), formaDe('ACTIVIDADES OPERATIVAS'))
})

test('el apóstrofo de Sheets no cambia la forma', () => {
  assert.equal(formaDe("'Texto"), formaDe('Texto'))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL RESIDUO DE UN LAYOUT ANTERIOR (06/08) — el caso medido en "Impuestos y Financieros"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// I20:M20 tenía cinco "⚠ PROYECCIÓN" colgando a la derecha de una fila del calendario. Ese texto lo
// escribe la fila "DDJJ presentada", que en el layout viejo estaba en la 20 y hoy está en la 57. El
// generador pedía limpiar (VACIO) y la huella lo bloqueaba: una celda VACIO no deja huella, el barrido
// borró la vieja, y de ahí en más la celda parecía del dueño. Se verificó en la base: para la fila 20
// hay huella de las columnas 0 y 1 y ninguna de la 8 a la 12, con la pestaña mostrando el residuo.

test('(d) mi propio texto de un layout anterior SÍ se limpia cuando pido limpiar', () => {
  const PROY = '⚠ PROYECCIÓN'
  // Lo que el generador escribe HOY: el rótulo del calendario en la fila del residuo, y el texto
  // "⚠ PROYECCIÓN" en otra fila (la de la DDJJ), que es donde vive ahora.
  const quiere = [...lastre(), ['18/08 · Planes de pago F931 (ARCA) · ago', '=$I$86', VACIO, VACIO],
    ['DDJJ presentada', '19/08·N…4821', PROY, PROY]]
  // La huella de la corrida anterior: el VACIO no deja huella, así que las dos últimas columnas de la
  // fila del calendario no están en el mapa.
  const huellas = huellasDe(quiere)
  assert.equal(huellas.has(claveCelda(lastre().length + 1, 2)), false, 'una celda VACIO no deja huella')
  // La pestaña hoy: la fila del calendario ARRASTRA el residuo del layout viejo.
  const hoy = quiere.map((f, i) => (i === quiere.length - 2 ? [f[0], f[1], PROY, PROY] : f))

  const { grid, residuos, ajenas, alineacion } = aplicarHuella(quiere, hoy, huellas)
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  assert.equal(residuos.length, 2, 'las dos celdas de residuo se reconocen como propias')
  assert.deepEqual(ajenas, [], 'no son del dueño: es texto que yo mismo escribo hoy en otra fila')
  // LA PRUEBA DEL EFECTO: después de fusionar, la celda queda vacía en la pestaña.
  const fusionada = fusionar(grid, hoy)
  assert.equal(fusionada[quiere.length - 2][2], '', 'el residuo se limpia')
  assert.equal(fusionada[quiere.length - 2][3], '')
  // Y la celda donde el texto SÍ va se sigue escribiendo.
  assert.equal(fusionada.at(-1)[2], PROY)
})

test('(e) un IMPORTE sin huella no se toca aunque yo escriba importes en otras celdas', () => {
  // El seguro del caso (d): si la coincidencia se midiera sobre cualquier forma, `<$>` haría propio
  // cualquier número del dueño. Sólo cuenta el texto con letras.
  const quiere = [...lastre(), ['Total del mes', '$ 1.000.000,00', VACIO]]
  const huellas = huellasDe(quiere)
  const hoy = quiere.map((f, i) => (i === quiere.length - 1 ? [f[0], f[1], '$ 60.433,00'] : f))
  const { grid, residuos, ajenas } = aplicarHuella(quiere, hoy, huellas)
  assert.deepEqual(residuos, [], 'un importe no es un rótulo: no se reclama como propio')
  assert.equal(ajenas.length, 1)
  assert.equal(fusionar(grid, hoy).at(-1)[2], '$ 60.433,00', 'el número del dueño sobrevive')
})
