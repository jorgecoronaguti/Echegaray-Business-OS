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
import { preservarNoVacias } from './no-borrar.mjs'

/**
 * LO QUE QUEDA EN LA PESTAÑA — la cadena entera, no el paso del medio.
 *
 * Un test que se detenía en `fusionar()` daba verde sobre una limpieza que en producción NUNCA
 * ocurría: después de la fusión corre `no-borrar.mjs`, que reponía toda celda que la escritura
 * dejaba vacía. Ésa es la diferencia entre la pantalla que contesta que sí y el dato leído en su
 * destino, y por eso acá se recorre hasta el final.
 */
const enLaPestana = (grid, hoy) => preservarNoVacias(hoy, fusionar(grid, hoy)).values

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
  // La prueba del efecto: en la pestaña la celda queda VACÍA, no reescrita.
  assert.equal(enLaPestana(grid, hoy)[ayer.length - 2][0], '')
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
  // LA PRUEBA DEL EFECTO: la celda queda vacía EN LA PESTAÑA, con `no-borrar` incluido en el camino.
  // Antes del 13/08 esta misma comprobación se hacía sólo hasta `fusionar()` y daba verde mientras el
  // residuo seguía visible en el Sheet: la guarda ciega lo reponía porque no podía probar de quién era.
  const enPestana = enLaPestana(grid, hoy)
  assert.equal(enPestana[quiere.length - 2][2], '', 'el residuo se limpia')
  assert.equal(enPestana[quiere.length - 2][3], '')
  // Y la celda donde el texto SÍ va se sigue escribiendo.
  assert.equal(enPestana.at(-1)[2], PROY)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL PEDIDO DEL DUEÑO, ENTERO, EN UNA SOLA PASADA (13/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// "estoy eliminando cosas de las pestañas que no me interesan q se vean y me las estas volviendo a
// poner, no hacer eso". Son tres exigencias distintas sobre la misma pestaña y las tres tienen que
// valer a la vez — cumplir dos de tres es no cumplir ninguna, porque el que falla es el que borra.
// Se recorre hasta la PESTAÑA (con `no-borrar` incluido): parar en `fusionar()` daba verde sobre
// limpiezas que en producción no ocurrían nunca.

test('(g) lo mío se saca · lo tuyo se conserva · lo que vaciaste no vuelve', () => {
  const ayer = [...lastre(),
    ['Nota al pie que el cuadro ya no lleva'],
    ['Rótulo que el dueño va a borrar'],
    ['Total del bloque', '⇒ cierra contra Compras'],
  ]
  const huellas = huellasDe(ayer)
  // LA PESTAÑA HOY: el dueño vació el rótulo y anotó algo suyo en la columna C, donde el generador
  // nunca escribió nada.
  const hoy = ayer.map((f) => [...f])
  hoy[ayer.length - 2] = ['']
  hoy[ayer.length - 1] = ['Total del bloque', '⇒ cierra contra Compras', 'revisar con el contador']
  // LO QUE EL GENERADOR QUIERE ESCRIBIR: ya no produce la nota al pie (pide limpiar SU celda), vuelve
  // a escribir el rótulo que el dueño borró, y ahora también quiere ocupar la columna C.
  const quiere = [...lastre(), [VACIO], ['Rótulo que el dueño va a borrar'],
    ['Total del bloque', '⇒ cierra contra Compras', '⇒ control de la columna nueva']]

  const r = aplicarHuella(quiere, hoy, huellas)
  assert.equal(r.alineacion.alineada, true, r.alineacion.motivo)
  const enPestana = enLaPestana(r.grid, hoy)

  // 1 · LO MÍO SE SACA. La escribí yo, sigue teniendo la forma con la que la dejé, y ya no la produzco.
  assert.equal(r.limpiadas.length, 1, 'la nota al pie se reconoce propia')
  assert.equal(enPestana[ayer.length - 3][0], '', 'la celda que el generador ya no produce queda VACÍA en la pestaña')

  // 2 · LO TUYO SE CONSERVA. Nunca escribí en esa columna: no la piso ni con un control mío.
  assert.equal(r.ajenas.length, 1)
  assert.equal(enPestana.at(-1)[2], 'revisar con el contador', 'la anotación del dueño sobrevive a la escritura')

  // 3 · LO QUE VACIASTE NO VUELVE. Tengo huella propia y hoy no hay nada: no lo resucito.
  assert.equal(r.suprimidas.length, 1)
  assert.equal(enPestana[ayer.length - 2][0], '', 'el rótulo borrado NO se vuelve a escribir')

  // Y lo que sí es mío y sigue vigente se actualiza: la huella no congela la pestaña.
  assert.equal(enPestana.at(-1)[0], 'Total del bloque')
})

test('(h) si editaste MI celda encima, pedir limpiarla NO la borra', () => {
  // El seguro del caso (f). La propiedad se prueba con posición Y FORMA: si la forma de hoy no es la
  // que dejé escrita, alguien escribió arriba de lo mío y limpiar sería borrar su trabajo. Sin este
  // control, el tercer estado sería un permiso general de borrado disfrazado de huella.
  const ayer = [...lastre(), ['Cobranzas proyectadas del mes']]
  const huellas = huellasDe(ayer)
  const hoy = [...ayer.slice(0, -1), ['OJO: esto lo confirma Jorge']]
  const quiere = [...lastre(), [VACIO]]
  const { grid, limpiadas, editadas } = aplicarHuella(quiere, hoy, huellas)
  assert.deepEqual(limpiadas, [], 'no se limpia lo que ya no tiene mi forma')
  assert.equal(editadas.length, 1)
  assert.equal(enLaPestana(grid, hoy).at(-1)[0], 'OJO: esto lo confirma Jorge')
})

test('(i) sin veredicto de alineación no se limpia NADA: el lado tímido sigue siendo el defecto', () => {
  // Una pestaña que cambió de forma, o una primera corrida, no habilitan ninguna limpieza. La grilla
  // sale con el centinela `VACIO` —"conservá lo que haya"— y no con el centinela probado.
  const quiere = [...lastre(), [VACIO]]
  const hoy = [...lastre(), ['algo que había ahí']]
  const { grid, limpiadas, alineacion } = aplicarHuella(quiere, hoy, new Map())
  assert.equal(alineacion.alineada, false)
  assert.deepEqual(limpiadas, [])
  assert.equal(enLaPestana(grid, hoy).at(-1)[0], 'algo que había ahí')
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

test('(f) UNA PALABRA COMÚN DEL DUEÑO NO SE BORRA aunque el generador también la escriba', () => {
  // EL CONTRAEJEMPLO DEL AUDITOR DE CIERRE (06/08), probado sobre la grilla real de Impuestos: la
  // regla reclamaba TODA palabra de la grilla (129 formas — "total", "iva", "disponible") y una
  // anotación del dueño que coincidiera se borraba. La propiedad exige una marca tipográfica que
  // ningún humano tipea al anotar (⚠ ⇒ ‖ § · —) o un rótulo largo.
  const quiere = [...lastre(), ['Calendario', '=$I$86', VACIO, VACIO], ['Detalle', 'Total', 'IVA', 'disponible']]
  const huellas = huellasDe(quiere)
  // El dueño anotó "Total" y "IVA" en las celdas que el generador manda a limpiar.
  const hoy = quiere.map((f, i) => (i === quiere.length - 2 ? [f[0], f[1], 'Total', 'IVA'] : f))
  const { grid, residuos, ajenas } = aplicarHuella(quiere, hoy, huellas)
  assert.equal(residuos.length, 0, 'una palabra común NUNCA es evidencia de que la escribí yo')
  assert.equal(ajenas.length, 2, 'las dos anotaciones son del dueño: se preservan')
  const fusionada = fusionar(grid, hoy)
  assert.equal(fusionada[quiere.length - 2][2], 'Total', 'la anotación del dueño sobrevive')
  assert.equal(fusionada[quiere.length - 2][3], 'IVA')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL APÓSTROFO QUE APAGABA LA HUELLA EN LOS DOS CASH FLOW (13/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La huella se sella con lo que el generador MANDÓ y se compara contra lo que la pestaña DEVUELVE.
// Google le pone comillas al nombre de una pestaña que arranca con `_`, así que cada fórmula que
// toca `_MOVIMIENTOS` cambiaba de forma sola. Medido contra el Sheet vivo: la fracción de huellas
// que caían donde el mapa dice era 0,25 en "Cash Flow Semanal" y 0,35 en "Cash Flow Mensual", contra
// un umbral de 0,60 — la huella NO decidía nunca, y todo lo que el dueño borraba ahí volvía.

test('(j) Google le pone comillas a la pestaña y eso NO es una edición del dueño', () => {
  const MANDE = '=SUMPRODUCT(ISNUMBER(_MOVIMIENTOS!$A$2:$A)*(_MOVIMIENTOS!$A$2:$A>=$B$7))'
  const DEVUELVE = "=SUMPRODUCT(ISNUMBER('_MOVIMIENTOS'!$A$2:$A)*('_MOVIMIENTOS'!$A$2:$A>=$B$7))"
  assert.equal(formaDe(MANDE), formaDe(DEVUELVE), 'la misma fórmula tiene que tener la misma forma')
  assert.equal(huellaDe(MANDE), huellaDe(DEVUELVE))
})

test('(k) una pestaña de fórmulas vuelve a alinear — el caso de los dos Cash Flow', () => {
  // La proporción importa y por eso se reproduce: 3 rótulos y 10 fórmulas, como una matriz de cash
  // flow donde casi todo el cuadro son fórmulas contra `_MOVIMIENTOS`. Con la comparación vieja
  // coincidían 3 de 13 (0,23 contra un umbral de 0,60) y la huella no decidía NUNCA.
  const mande = [...lastre(3), ...Array.from({ length: 10 }, (_, k) => [`=N(_MOVIMIENTOS!$A$${k + 2})`])]
  const huellas = huellasDe(mande)                              // sellada con lo que mandé
  const hoy = mande.map((f) => f.map((c) => String(c).replace(/_MOVIMIENTOS/g, "'_MOVIMIENTOS'")))
  const { alineacion, suprimidas, ajenas } = aplicarHuella(mande, hoy, huellas)
  assert.equal(alineacion.fraccion, 1, 'las 13 celdas caen donde el mapa dice')
  assert.equal(alineacion.alineada, true, alineacion.motivo)
  assert.deepEqual(suprimidas, [], 'la pestaña no cambió: nadie borró nada')
  assert.deepEqual(ajenas, [], 'y ninguna celda propia se lee como ajena')
})

test('(l) el apóstrofo no tapa un borrado de verdad: la fórmula que vaciaste sigue sin volver', () => {
  // El seguro de (j) y (k). Normalizar comillas no puede convertirse en "todo coincide": una celda
  // que el dueño vació tiene que seguir dando `suprimida`.
  const mande = [...lastre(), ['Saldo proyectado', '=N(_MOVIMIENTOS!$A$2)']]
  const huellas = huellasDe(mande)
  const hoy = mande.map((f, i) => (i === mande.length - 1 ? ["'_MOVIMIENTOS' ya no va", ''] : f))
  const { suprimidas } = aplicarHuella(mande, hoy, huellas)
  assert.equal(suprimidas.length, 1)
  assert.equal(suprimidas[0].col, 1, 'la celda vaciada es la de la fórmula')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL RESIDUO DE REDISEÑO — el veredicto `ajena` que lo volvía inmortal (14/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La pestaña "Jornales por Quincena" se rediseñó el 13/08 y las filas se movieron. Al día siguiente
// tres celdas seguían con lo que el layout ANTERIOR tenía en esa posición, y la peor —`F80`, con el
// texto "Banco" donde va el `INDEX/MATCH` del básico de convenio— hizo que la Σ del plantel publicara
// $46.988 en vez de $97.772: la mitad de las 16 personas afuera, sin un solo #ERROR.
//
// La causa no era el generador: era el veredicto de la huella. Sin huella en la coordenada nueva y
// con contenido en la celda, `aplicarHuella` devolvía `''` ("nunca fue mía y tiene algo tuyo"),
// `fusionar` preservaba el residuo, no se sellaba huella, y la corrida siguiente repetía el veredicto.
// Un lazo que se confirma solo, en cada corrida, para siempre.

/** La fila real 80 de la pestaña: la escribe el generador entera salvo la E, que es del dueño. */
const filaPlantel = (basico) => ['OF M', '=COUNTIFS(D;"OF M")', '=SUMIFS(W;D;"OF M")', '=MINIFS(W)', '', basico, '=IF(N(F)=0;"";D/F-1)', 'sin escala para esa categoría']

test('(m) EL RESIDUO DE REDISEÑO: "Banco" donde va el básico de convenio se PISA', () => {
  const quiero = [...lastre(), ['Período', 'Hasta', 'Se paga el', 'Obreros', 'Oficina', 'Dirección', 'TOTAL', 'Banco'],
    filaPlantel('=IFERROR(INDEX(_UOCRA_RAW!$D$5:$D$8;MATCH("Oficial";_UOCRA_RAW!$B$5:$B$8;0));"")')]
  // La huella de la corrida anterior tiene TODA la fila menos la F: ahí el layout viejo dejó "Banco",
  // así que esa coordenada nunca se selló. Es exactamente el estado que se leyó en la base el 14/08.
  const huellas = huellasDe(quiero)
  huellas.delete(claveCelda(quiero.length, 5))
  const hoy = quiero.map((f, i) => (i === quiero.length - 1 ? filaPlantel('Banco') : f))

  const { grid, ajenas, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(reescritos.length, 1, 'el residuo tiene que reconocerse como propio, no como del dueño')
  assert.equal(reescritos[0].suyo, 'Banco')
  assert.deepEqual(ajenas, [], 'el residuo dejó de contarse como celda del dueño')
  // Y LA PRUEBA DEL EFECTO, hasta el final de la cadena: la fórmula queda EN LA PESTAÑA.
  assert.match(String(enLaPestana(grid, hoy).at(-1)[5]), /^=IFERROR\(INDEX/,
    'el básico de convenio no llegó a la celda: la Σ vuelve a publicarse con medio plantel afuera')
})

test('(n) el residuo se pisa SÓLO si es un rótulo mío: un texto del dueño se conserva', () => {
  const quiero = [...lastre(), ['Período', 'Hasta', 'Se paga el', 'Obreros', 'Oficina', 'Dirección', 'TOTAL', 'Banco'],
    filaPlantel('=IFERROR(INDEX(_UOCRA_RAW!$D$5:$D$8;MATCH("Oficial";_UOCRA_RAW!$B$5:$B$8;0));"")')]
  const huellas = huellasDe(quiero)
  huellas.delete(claveCelda(quiero.length, 5))
  // Misma fila, misma coordenada sin huella — pero lo que hay es una nota que el generador NO escribe
  // en ninguna parte de su grilla. No hay evidencia de propiedad y la celda se queda como está.
  const hoy = quiero.map((f, i) => (i === quiero.length - 1 ? filaPlantel('ojo: Pérez cambió de categoría') : f))
  const { grid, ajenas, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.deepEqual(reescritos, [])
  assert.equal(ajenas.length, 1)
  assert.equal(enLaPestana(grid, hoy).at(-1)[5], 'ojo: Pérez cambió de categoría',
    'una nota del dueño adentro de una fila mía tiene que sobrevivir')
})

test('(ñ) y sólo adentro de una fila PROBADA mía: un rótulo suelto en una fila ajena no se pisa', () => {
  // La segunda condición, que es la que impide que este camino se vuelva un bypass. Si la fila no
  // tiene huella propia —es una fila del dueño, o una que el generador nunca escribió— no alcanza con
  // que el texto coincida con un rótulo mío: podría haberlo tipeado él.
  const quiero = [...lastre(), ['Banco', 'Adelanto', 'Total recibo'], ['nuevo bloque', 'x', 'y']]
  const huellas = huellasDe(quiero)
  // NINGUNA celda de la última fila tiene huella: la fila entera es territorio no probado.
  for (let j = 0; j < 3; j++) huellas.delete(claveCelda(quiero.length, j))
  const hoy = quiero.map((f, i) => (i === quiero.length - 1 ? ['Banco', 'x', 'y'] : f))
  const { ajenas, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.deepEqual(reescritos, [], 'sin fila probada mía no se pisa nada, aunque el texto coincida')
  assert.ok(ajenas.some((a) => a.suyo === 'Banco'), 'la celda con mi rótulo se conserva como ajena')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CUADRANTE QUE FALTABA: el fósil que NO es texto, en una celda donde el generador escribe (15/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El registro de quincenas de "Jornales por Quincena" (filas 134..148) publicaba OCHO de sus quince
// celdas de «Hasta» vacías, y la de abril publicaba el cierre de la ÚLTIMA quincena. `aplicarHuella`
// lo explicaba entero: `ajenas` en la columna B de las filas 140..148, `sheet_huella_celda` con doce
// huellas por fila en TODAS las columnas menos ésa. El registro creció, sus filas nuevas nacieron
// sobre lo que el layout viejo había dejado ahí, y el veredicto se realimentaba — sin huella no hay
// prueba de propiedad, y sin escribir no hay huella. `JORNALES_REAL_HASTA` es esas quince celdas.
//
// Si se revierte el cuadrante, (p) y (q) se ponen rojos; (r), (s) y (t) son los frenos que impiden
// que este camino se vuelva un bypass para pisarle una fórmula al dueño.

/** Una fila del registro: la escribe el generador entera salvo la N («Pagado el»), que es del dueño. */
const hastaDe = (f) => `=IFERROR(INDEX('_J_OBREROS'!F${f}:U${f};SUMPRODUCT(MAX(('_J_OBREROS'!F${f}:U${f}<>"")*(COLUMN('_J_OBREROS'!F${f}:U${f})-COLUMN('_J_OBREROS'!F${f})+1))));"")`
const filaRegistro = (f, hasta = hastaDe(f)) =>
  [`='_J_OBREROS'!F${f}`, hasta, `=IF(N(B1)=0;"";WORKDAY(B1;3))`, `=COUNTA('_J_OBREROS'!F${f}:U${f})`, `=COUNT('_J_OBREROS'!A${f + 1}:A${f + 9})`]
/**
 * El registro como lo emite el generador, y la huella de ayer SIN la columna «Hasta» de las filas
 * que nacieron sobre un layout viejo — que es el estado exacto que se leyó en `sheet_huella_celda`.
 */
const registro = (filas, sinHuella = []) => {
  const quiero = [...lastre(), ['Quincena', 'Hasta', 'Se paga el', 'Días hábiles', 'Personas'], ...filas.map((f) => filaRegistro(f))]
  const huellas = huellasDe(quiero)
  const fila1 = quiero.length - filas.length + 1
  for (const k of sinHuella) huellas.delete(claveCelda(fila1 + k, 1))
  return { quiero, huellas }
}

test('(p) `=""` en «Hasta» de una fila mía se PISA: ocho celdas que el registro publicaba vacías', () => {
  const { quiero, huellas } = registro([6, 35, 216, 247], [2, 3])
  // Lo que hay hoy: las dos primeras con su fórmula, las dos últimas con el `=""` que quedó ahí.
  const hoy = quiero.map((f, i) => (i >= quiero.length - 2 ? [f[0], '=""', ...f.slice(2)] : f))

  const { grid, ajenas, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(reescritos.length, 2, 'un `=""` no es contenido de nadie: las dos celdas son reclamables')
  assert.ok(reescritos.every((r) => r.por.includes('no publica nada')), 'el log tiene que decir con qué evidencia decidí')
  assert.deepEqual(ajenas, [], 'ninguna de las dos puede seguir contándose como celda del dueño')
  // LA PRUEBA DEL EFECTO, hasta el final de la cadena: la fórmula queda EN LA PESTAÑA.
  assert.equal(enLaPestana(grid, hoy).at(-1)[1], hastaDe(247),
    '«Hasta» de la última quincena sigue vacía: JORNALES_REAL_HASTA reparte un vacío')
})

test('(q) y el fósil de la MISMA fórmula en OTRA fila también: abril publicaba el cierre de agosto', () => {
  const { quiero, huellas } = registro([6, 35, 216, 496], [2])
  // La fila de abril (216) quedó con el `INDEX` de la ÚLTIMA quincena (496) de cuando el registro
  // tenía menos filas. No es un vacío: es una FECHA REAL en la fila equivocada, que es peor.
  const hoy = quiero.map((f, i) => (i === quiero.length - 2 ? [f[0], hastaDe(496), ...f.slice(2)] : f))

  const { grid, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(reescritos.length, 1)
  assert.ok(reescritos[0].por.includes('en esta columna'), 'la evidencia es la fórmula exacta de mi propia columna')
  assert.equal(enLaPestana(grid, hoy).at(-2)[1], hastaDe(216),
    'abril sigue publicando el cierre de la última quincena: una fecha mala miente más que un vacío')
})

test('(r) una fórmula que YO NO escribo en esa columna se conserva: es del dueño', () => {
  const { quiero, huellas } = registro([6, 35, 216, 247], [3])
  const suya = '=SUMIFS(Compras!$M:$M;Compras!$C:$C;$A150)'
  const hoy = quiero.map((f, i) => (i === quiero.length - 1 ? [f[0], suya, ...f.slice(2)] : f))
  const { grid, ajenas, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.deepEqual(reescritos, [], 'una fórmula ajena adentro de una fila mía NO es evidencia de propiedad')
  assert.equal(ajenas.length, 1)
  assert.equal(enLaPestana(grid, hoy).at(-1)[1], suya, 'le pisé una fórmula al dueño')
})

test('(r bis) el fósil de mi propia columna NO necesita dos anclas: una fila de dos celdas no puede tenerlas', () => {
  // Los renglones "De lo pagado — por banco" y "— en adelantos" (129 y 130) los escribe el generador
  // con DOS celdas: el rótulo y el importe. `filaProbadaMia` pide dos anclas en OTRAS columnas, así
  // que esas filas no pueden probarse nunca — y publicaban un serial de fecha con formato de moneda.
  // La evidencia que decide acá es la misma que el camino de la limpieza ya acepta sola para VACIAR.
  const quiero = [...lastre(), ['De lo pagado — por banco', '=SUMPRODUCT(($N$134:$N$148<>"")*N($H$134:$H$148))'],
    ['Hasta', hastaDe(396)]]
  const huellas = huellasDe(quiero)
  huellas.delete(claveCelda(quiero.length - 1, 1))
  const hoy = quiero.map((f, i) => (i === quiero.length - 2 ? [f[0], hastaDe(396)] : f))
  const { grid, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.equal(reescritos.length, 1, 'una fila de dos celdas queda a un ancla: si se le exigen dos, no se cura nunca')
  assert.match(String(enLaPestana(grid, hoy).at(-2)[1]), /^=SUMPRODUCT/,
    'el renglón sigue publicando un serial de fecha donde va la plata que salió por ese canal')
})

// ═══ (s) REESCRITO EL 18/08 — ANTES EXIGÍA LA FILA PROBADA, Y ESO CONGELABA CELDAS ═══
//
// Acá vivía *"el `=""` SÍ exige la fila probada mía: es la evidencia débil de las dos"*, con una
// fixture titulada «Nota del dueño». No era una nota: por la definición de `esFormulaNula` —que es de
// este mismo repo— un `=""` NO PUBLICA NADA y se ve igual que una celda en blanco. Nadie escribe eso
// para decir algo.
//
// El costo de la exigencia, medido en el archivo vivo: `Jornales por Quincena!B118` —«Margen sobre el
// piso», o sea EL número del cuadro «4.3 · CONTROL DE PISO — NINGÚN JORNAL POR DEBAJO»— es una fila
// de DOS celdas, nunca puede juntar dos anclas, tenía `=""` y quedó congelada. El cuadro existía para
// publicar ese porcentaje y publicaba un blanco. Es el mismo lazo que el test (r bis) de arriba ya
// había roto para el fósil de la propia columna, sin extender la conclusión a esta vía.
test('(s) un `=""` se pisa cuando lo mío SÍ publica: no hay nada visible que destruir', () => {
  const quiero = [...lastre(), ['Margen sobre el piso', '=""']]
  const huellas = huellasDe(quiero)
  huellas.delete(claveCelda(quiero.length, 1))
  const nuevo = quiero.map((f, i) => (i === quiero.length - 1 ? [f[0], '=SUM(Z1:Z9)'] : f))
  const { grid, reescritos } = aplicarHuella(nuevo, quiero, huellas)
  assert.equal(reescritos.filter((r) => r.col === 1).length, 1, 'una fila de dos celdas no junta dos anclas nunca')
  assert.equal(enLaPestana(grid, quiero).at(-1)[1], '=SUM(Z1:Z9)', 'el cuadro sigue publicando un blanco')
})

test('(s bis) si lo mío TAMPOCO publica nada, el `=""` se conserva: no se usa de excusa para vaciar', () => {
  // La condición que sí queda. Sin ella, un `=""` sería una llave para vaciar cualquier coordenada
  // ajena donde el generador no tiene nada que poner — y vaciar es la acción más destructiva de las
  // cinco vías, no la más suave.
  const quiero = [...lastre(), ['Margen sobre el piso', '=""']]
  const huellas = huellasDe(quiero)
  huellas.delete(claveCelda(quiero.length, 1))
  const nuevo = quiero.map((f, i) => (i === quiero.length - 1 ? [f[0], ''] : f))
  const { grid, reescritos } = aplicarHuella(nuevo, quiero, huellas)
  assert.deepEqual(reescritos.filter((r) => r.col === 1), [])
  assert.equal(enLaPestana(grid, quiero).at(-1)[1], '=""', 'se vació una celda sin nada que poner en su lugar')
})

test('(t) el fósil sólo se pisa donde el generador ESCRIBE: donde pide limpiar sigue mandando VACIO', () => {
  // `c === VACIO` corta antes del cuadrante nuevo. Si no cortara, la columna del dueño —la que se
  // emite vacía a propósito— entraría por acá, y ése es exactamente el borrado que ya costó dos veces.
  const { quiero, huellas } = registro([6, 35, 216, 247], [3])
  const conVacio = quiero.map((f, i) => (i === quiero.length - 1 ? [f[0], VACIO, ...f.slice(2)] : f))
  const hoy = quiero.map((f, i) => (i === quiero.length - 1 ? [f[0], '=""', ...f.slice(2)] : f))
  const { reescritos } = aplicarHuella(conVacio, hoy, huellas)
  assert.deepEqual(reescritos, [], 'pedir limpiar no es pedir escribir: son dos veredictos distintos')
})

test('(o) un residuo NUMÉRICO no se pisa: un serial se parece a cualquier dato del dueño', () => {
  // Los otros residuos del mismo rediseño son seriales de fecha (`46063`, `46038`). Deliberadamente
  // quedan afuera de este camino: comparten apariencia con cualquier número de la planilla y ninguna
  // de las dos evidencias los separa. Se limpian por la vía declarada, con una persona nombrándolos.
  const quiero = [...lastre(), ['Convenio (tuya)', 'Básico convenio'], ['A M', 5399]]
  const huellas = huellasDe(quiero)
  huellas.delete(claveCelda(quiero.length, 1))
  const hoy = quiero.map((f, i) => (i === quiero.length - 1 ? ['A M', 46063] : f))
  const { ajenas, reescritos } = aplicarHuella(quiero, hoy, huellas)
  assert.deepEqual(reescritos, [], 'un número nunca es evidencia de propiedad')
  assert.equal(ajenas.length, 1)
})
