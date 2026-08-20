// EL VEREDICTO SIN MAPA DE POSICIÓN — el agujero por el que volvía lo que el dueño borraba.
//
// El defecto que estos tests atrapan es concreto y estaba medido contra el archivo vivo: en las
// pestañas donde la huella no alinea (Cash Flow Semanal 0,47 · Mensual 0,52 · Recurrentes 0,59 ·
// _PRESUPUESTO_MENSUAL 0,37) `aplicarHuella` devolvía la grilla INTACTA, así que todo lo que el dueño
// vaciaba volvía en la corrida siguiente — y encima no quedaba marca, porque no había supresión que
// registrar. Sobre 5.858 huellas de esas cuatro pestañas había CERO marcas de borrado.
//
// Si se revierte `aplicarHuella` a devolver `vacio` cuando no alinea, (a) y (b) se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  esDistintiva, esFormulaNula, formaComparable, formaDe, formasAusentes, formasPresentes,
  noReponerAusentes, LARGO_FORMA, MIN_FORMAS_PRESENTES, TOPE_BORRADOS_NUEVOS,
} from './huella-forma.mjs'
import { aplicarHuella, claveCelda, huellasDeEscritura, mejorDesplazamiento } from './huella-celda.mjs'
import { fusionar } from './preservar-anotaciones.mjs'
import { preservarNoVacias } from './no-borrar.mjs'

/** Lo que QUEDA en la pestaña: la cadena entera, no el paso del medio. Igual que en huella-celda.test. */
const enLaPestana = (grid, hoy) => preservarNoVacias(hoy, fusionar(grid, hoy)).values

/**
 * Rótulos ÚNICOS por letras y no por número: `número 1` y `número 2` se enmascaran a la MISMA forma
 * (`<n>`), así que una lista numerada da UNA sola forma y ningún test que cuente formas mide lo que
 * cree medir. Con letras, cada fila es una forma distinta.
 */
const abc = 'abcdefghijklmnopqrstuvwxyz'
const unico = (k) => `${abc[Math.floor(k / 26) % 26]}${abc[k % 26]}`

const huellasDe = (grid, opts = {}) =>
  new Map(huellasDeEscritura(grid, opts).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))

/**
 * Un cuadro con la forma del Cash Flow Semanal: rótulos largos y fórmulas. `desde` corre TODO el
 * bloque para que ningún desplazamiento de los que prueba la huella (±5) lo alinee — que es
 * exactamente lo que le pasa a un cuadro al que se le agrega una columna por semana.
 */
const cuadro = (desde = 0) => [
  ...Array.from({ length: desde }, (_, k) => [`Relleno de arriba número ${k} sin ninguna forma repetida`]),
  ['ACTIVIDADES OPERATIVAS DEL PERIODO'],
  ['Cobranzas de certificados de obra civil'],
  ['Pagos a proveedores de materiales'],
  ['=SUMPRODUCT(_MOVIMIENTOS!$D$2:$D;--(_MOVIMIENTOS!$A$2:$A>=B3))'],
  ['⇒ AUMENTO / (DISMINUCIÓN) NETA DEL EFECTIVO'],
  ['Saldo de caja al cierre del periodo semanal'],
  ['Financiación bancaria neta del periodo'],
  ['Impuestos y contribuciones del periodo'],
  ['Anticipos de clientes recibidos en el periodo'],
]

test('(a) sin mapa de posición, un rótulo que el dueño vació NO se repone', () => {
  const generado = cuadro()
  const huellas = huellasDe(generado)
  // La pestaña de HOY: el bloque corrido 9 filas (ningún desplazamiento probado la alinea) y con la
  // línea "AUMENTO / (DISMINUCIÓN)" vaciada por el dueño.
  const hoy = cuadro(9).map((f) => (String(f[0]).includes('AUMENTO') ? [''] : f))

  const r = aplicarHuella(generado, hoy, huellas, { fila0: 1, col0: 0 })
  assert.equal(r.alineacion.alineada, false, 'el escenario exige que el mapa NO alinee')
  // LA CELDA NO SE REPONE, PERO NO SE REGISTRA COMO BORRADA POR EL DUEÑO. Sin mapa, la ausencia de
  // una forma tiene tres explicaciones y sólo una es "la borró él" (ver `aplicarHuella`). Lo que este
  // test protege —que el rótulo vaciado NO vuelva— se comprueba tres líneas más abajo, sobre la
  // GRILLA, que es donde vive de verdad: el registro sólo agrega una consecuencia permanente.
  assert.equal(r.noRepuestas.length, 1, 'la celda vaciada tiene que dejar de reponerse')
  assert.deepEqual(r.suprimidas, [], 'sin mapa NO se puede afirmar un borrado del dueño: 27 celdas del generador se marcaron así')

  const queda = enLaPestana(r.grid, hoy)
  const textos = queda.flat().map(String)
  assert.ok(!textos.some((t) => t.includes('AUMENTO')), 'el rótulo que vaciaste NO puede volver')
  assert.ok(textos.some((t) => t.includes('ACTIVIDADES OPERATIVAS')), 'el resto del cuadro se sigue escribiendo')
})

test('(b) una FÓRMULA que el dueño vació tampoco vuelve (la Regla 0 sólo ve rótulos)', () => {
  const generado = cuadro()
  const huellas = huellasDe(generado)
  const hoy = cuadro(9).map((f) => (String(f[0]).startsWith('=SUMPRODUCT') ? [''] : f))
  const r = aplicarHuella(generado, hoy, huellas, { fila0: 1, col0: 0 })
  const queda = enLaPestana(r.grid, hoy).flat().map(String)
  assert.ok(!queda.some((t) => t.startsWith('=SUMPRODUCT')), 'la fórmula que vaciaste NO vuelve')
})

test('(c) una celda vacía que NUNCA se escribió SÍ se puede escribir: el arreglo no congela la pestaña', () => {
  const generado = [...cuadro(), ['Línea NUEVA que este generador estrena hoy']]
  // Las huellas son del cuadro SIN la línea nueva: nunca la escribí, así que no puedo haberla borrado.
  const huellas = huellasDe(cuadro())
  const hoy = cuadro(9)
  const r = aplicarHuella(generado, hoy, huellas, { fila0: 1, col0: 0 })
  const queda = enLaPestana(r.grid, hoy).flat().map(String)
  assert.ok(queda.some((t) => t.includes('Línea NUEVA')), 'una celda que nunca existió se escribe normal')
})

test('(d) una lectura que devuelve casi nada NO se lee como "borraste todo"', () => {
  const generado = cuadro()
  const huellas = huellasDe(generado)
  const r = noReponerAusentes(generado, [[''], ['algo suelto']], huellas, { fila0: 1, col0: 0 })
  assert.deepEqual(r.suprimidas, [], 'sin formas presentes no se decide nada')
  assert.match(r.motivo, /no alcanza para juzgar/)
  assert.ok(formasPresentes([[''], ['algo suelto']]).size < MIN_FORMAS_PRESENTES)
})

test('(e) el techo: un rediseño que deja muchas formas huérfanas no se lee como borrado del dueño', () => {
  const viejo = Array.from({ length: TOPE_BORRADOS_NUEVOS + 20 },
    (_, k) => [`Rótulo largo ${unico(k)} del layout anterior de la pestaña`])
  const huellas = huellasDe(viejo)
  // La pestaña de hoy tiene OTRO layout: ninguna de mis formas viejas está, y el generador las quiere
  // escribir todas (es el arranque de un rediseño, no una limpieza a mano del dueño).
  const hoy = Array.from({ length: 12 }, (_, k) => [`Texto ajeno ${unico(k)} de control en la pestaña`])
  const r = noReponerAusentes(viejo, hoy, huellas, { fila0: 1, col0: 0 })
  assert.deepEqual(r.suprimidas, [], 'por encima del techo no se suprime ninguna forma nueva')
  assert.match(r.motivo, /el techo es/)
})

test('(f) una marca YA CONFIRMADA no paga el techo: es una decisión probada, no una sospecha', () => {
  const viejo = Array.from({ length: TOPE_BORRADOS_NUEVOS + 20 },
    (_, k) => [`Rótulo largo ${unico(k)} del layout anterior de la pestaña`])
  const huellas = huellasDe(viejo)
  // Una sola, ya marcada como borrada por el dueño en una corrida anterior.
  huellas.get(claveCelda(1, 0)).borrada = true
  // Y en la pestaña esa celda está VACÍA: es la que él vació. El resto tiene contenido ajeno.
  const hoy = Array.from({ length: 12 }, (_, k) => (k ? [`Texto ajeno ${unico(k)} de control en la pestaña`] : ['']))
  const r = noReponerAusentes(viejo, hoy, huellas, { fila0: 1, col0: 0 })
  assert.equal(r.suprimidas.length, 1)
  assert.equal(r.suprimidas[0].confirmada, true)
})

test('(g) una forma genérica NUNCA es evidencia: un importe ausente no apaga otro importe', () => {
  assert.equal(esDistintiva('<$>'), false)
  assert.equal(esDistintiva('<n>'), false)
  assert.equal(esDistintiva('total'), false, 'una palabra corta la tipea cualquiera al anotar')
  assert.equal(esDistintiva('=sumproduct(_movimientos!$d$#:$d)'), true)
  assert.equal(esDistintiva('⇒ costo de la nómina'), true, 'la marca tipográfica alcanza')
  assert.equal(esDistintiva('aumento / (disminución) neta del efectivo'), true, 'el texto largo también')
})

test('(h) el dueño REEMPLAZA mi rótulo por texto suyo: no lo repongo y no le borro nada', () => {
  const generado = cuadro()
  const huellas = huellasDe(generado)
  // Ya no es un borrado sino una reescritura, y el resultado esperado es el mismo: gana lo suyo.
  const hoy = cuadro(9).map((f) => (String(f[0]).includes('AUMENTO') ? ['Mi propio título de esta fila'] : f))
  const r = noReponerAusentes(generado, hoy, huellas, { fila0: 1, col0: 0 })
  assert.equal(r.suprimidas.length, 1, 'mi rótulo no se vuelve a escribir')
  const queda = enLaPestana(r.grid, hoy).flat().map(String)
  assert.ok(queda.some((t) => t === 'Mi propio título de esta fila'), 'y su texto queda intacto')
  assert.ok(!queda.some((t) => t.includes('AUMENTO')))
})

test('(i) formasAusentes separa lo confirmado de lo nuevo y no cuenta dos veces', () => {
  const huellas = new Map([
    ['1:0', { forma: 'un rótulo largo que ya no está en la pestaña', borrada: true }],
    ['2:0', { forma: 'otro rótulo largo que tampoco está en la pestaña', borrada: false }],
    ['3:0', { forma: 'presente en la pestaña de hoy con texto largo', borrada: false }],
    ['4:0', { forma: '<$>', borrada: false }],
  ])
  const presentes = new Set(['presente en la pestaña de hoy con texto largo'])
  const { confirmadas, nuevas } = formasAusentes(huellas, presentes)
  assert.deepEqual([...confirmadas], ['un rótulo largo que ya no está en la pestaña'])
  assert.deepEqual([...nuevas], ['otro rótulo largo que tampoco está en la pestaña'])
})

// ═══ LA CAUSA RAÍZ DE LOS DOS CASH FLOW: UNA FÓRMULA LARGA NO COINCIDÍA NI CONSIGO MISMA ═══
//
// La huella se sella cortada a `LARGO_FORMA` y se comparaba entera. El Cash Flow Semanal está hecho
// de fórmulas de más de 300 caracteres, así que CADA UNA se leía como "esto ya no está en la pestaña".
// Medido contra el archivo vivo antes y después de este arreglo, fracción de huellas que caen donde el
// mapa dice: Semanal 0,47 → 0,99 · Mensual 0,52 → 0,99 · Recurrentes 0,59 → 0,92 · OBRAS 0,69 → 1,00.
// El umbral es 0,60: en esas tres pestañas la huella pasó de NO DECIDIR NUNCA a decidir siempre.
//
// Si se revierte el truncado de `formaComparable`, este test se pone rojo.
test('(j) una fórmula más larga que el corte del sellado sigue siendo la misma forma', () => {
  const larga = `=SUMPRODUCT(ISNUMBER('_MOVIMIENTOS'!$A$2:$A)*('_MOVIMIENTOS'!$A$2:$A>=$N$5)*(${'ABCDEFGHIJ'.repeat(40)}))`
  assert.ok(larga.length > LARGO_FORMA, 'el escenario exige una fórmula más larga que el corte')
  // Así queda sellada (`huellasDeEscritura` corta) y así se lee de la pestaña (entera).
  const sellada = huellasDeEscritura([[larga]])[0].forma
  assert.equal(formaComparable(sellada), formaComparable(formaDe(larga)),
    'la forma sellada y la de hoy tienen que comparar IGUAL, o la huella no decide nunca')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// `=""` NO ES CONTENIDO — y el margen del predicado, que es lo único que lo hace seguro (15/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
test('(l) `=""` se reconoce como la fórmula que no publica nada, con o sin lo que le agrega Google', () => {
  for (const v of ['=""', '= ""', ' ="" ', '\'=""']) {
    assert.equal(esFormulaNula(v), true, `${JSON.stringify(v)} publica la cadena vacía y nada más`)
  }
})

test('(m) y NO se traga nada que sí pueda publicar algo: el margen es la seguridad del veredicto', () => {
  // Todas éstas publican un dato casi siempre. Si alguna entrara acá, el veredicto de propiedad
  // pasaría a pisar fórmulas vivas del dueño con la excusa de que "no dicen nada".
  const publican = [
    '=IFERROR(INDEX(A1:A9;1);"")',                 // la fórmula de «Hasta»: vacía SÓLO si falla
    '=IF(N(B10)=0;"";B10)',
    '=""&A1',
    '=CONCAT("";A1)',
    '""', '', ' ', 0, null, undefined, 'sin datos',
  ]
  for (const v of publican) assert.equal(esFormulaNula(v), false, `${JSON.stringify(v)} no es una fórmula nula`)
})

test('(k) y con la fórmula larga, la huella vuelve a alinear', () => {
  const larga = (n) => `=SUMPRODUCT(ISNUMBER('_MOVIMIENTOS'!$A$2:$A)*('_MOVIMIENTOS'!$A$2:$A>=$${unico(n)}$5)*(${'ABCDEFGHIJ'.repeat(40)}))`
  const grid = Array.from({ length: 12 }, (_, k) => [larga(k)])
  const huellas = huellasDe(grid)
  // La pestaña devuelve las MISMAS fórmulas, con los apóstrofos que le pone Google. Nada cambió.
  const al = mejorDesplazamiento(grid, huellas, { fila0: 1, col0: 0 })
  assert.equal(al.alineada, true, 'la pestaña no cambió: el mapa TIENE que alinear')
  assert.ok(al.fraccion > 0.9)
})

// ═══ EL DEFECTO DE LAS 27 · SIN MAPA NO SE REGISTRA NI UN BORRADO, PASE LO QUE PASE ═══
//
// MEDIDO en el archivo real: la primera corrida de "Proveedores" con la huella enchufada dejó 27
// celdas con `borrada_en`. Se revisaron una por una y las 27 son del GENERADOR —fórmulas
// `=SUMPRODUCT((_ARCA_RAW!…))`, `=SUM($F$#:$F$#)` y rótulos propios como "· ▲ sin cargar en
// Compras"—. Ninguna del dueño. Antes de esa corrida la pestaña no tenía una sola marca.
//
// La marca es permanente y se auto-sostiene: `borrada_en` sólo se limpia si la celda vuelve a tener
// contenido, y el generador dejó de escribirla porque la marca se lo dice. Un lazo cerrado.
//
// Este control es el freno: cuando la alineación falla, `suprimidas` sale VACÍO haya las formas que
// haya. No mide un caso, mide la propiedad — recorre varios escenarios que antes sí registraban.
test('EL DEFECTO · con el mapa desalineado, NINGÚN escenario registra una supresión', () => {
  // Rótulos únicos POR LETRAS: un `número 1` y un `número 2` se enmascaran a la misma forma (`<n>`) y
  // entonces cualquier desplazamiento alinea — el error que este mismo test cometió al escribirse.
  const bloque = (n, pre = 'Rótulo distintivo del generador') => Array.from({ length: n }, (_, k) => [`${pre} ${unico(k)} de esta pestaña`])
  const escenarios = [
    ['todas mis formas desaparecieron', bloque(20), bloque(20, 'Texto ajeno enteramente distinto')],
    ['la pestaña se corrió 9 filas', bloque(20), [...bloque(9, 'Relleno de arriba'), ...bloque(20)]],
    ['una sola forma mía falta y el resto se corrió', bloque(20), [...bloque(9, 'Relleno de arriba'), ...bloque(20).filter((_, k) => k !== 3)]],
    ['la pestaña quedó casi vacía', bloque(20), [['algo suelto']]],
  ]
  for (const [nombre, generado, hoy] of escenarios) {
    const huellas = huellasDe(generado)
    const r = aplicarHuella(generado, hoy, huellas, { fila0: 1, col0: 0 })
    assert.equal(r.alineacion.alineada, false, `"${nombre}": el escenario exige que el mapa NO alinee`)
    assert.deepEqual(r.suprimidas, [],
      `"${nombre}": se registró un borrado sin mapa que lo pruebe — así nacieron las 27 celdas del generador marcadas como borradas por el dueño`)
  }
})

// La contracara, para que el arreglo no se coma la protección real: CON mapa alineado, una celda que
// el dueño vació de verdad SÍ se registra. Sin este test, "no registrar nunca" pasaría el de arriba.
test('con el mapa alineado, un borrado real del dueño SÍ se registra', () => {
  const generado = Array.from({ length: 20 }, (_, k) => [`Rótulo distintivo del generador número ${k}`])
  const huellas = huellasDe(generado)
  const hoy = generado.map((f, k) => (k === 3 ? [''] : [...f]))
  const r = aplicarHuella(generado, hoy, huellas, { fila0: 1, col0: 0 })
  assert.equal(r.alineacion.alineada, true, r.alineacion.motivo)
  assert.equal(r.suprimidas.length, 1, 'con mapa, la celda vacía bajo huella propia es un borrado del dueño y se registra')
  assert.equal(r.suprimidas[0].fila, 4)
})
