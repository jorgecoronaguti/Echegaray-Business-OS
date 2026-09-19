// EL RESIDUO QUE MIGRA — los cuatro focos medidos en «Jornales por Quincena» el 14/08, y los frenos.
//
// Cada test de acá abajo reproduce un DEFECTO leído en el archivo vivo, no el código que lo cura: si
// se saca la cuarta evidencia de `aplicarHuella`, los cuatro primeros se ponen rojos porque la celda
// residual sigue en la pestaña. Se recorre hasta `preservarNoVacias` a propósito: la limpieza que
// importa es la que sobrevive a la guarda ciega, no la que devuelve el paso del medio.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveDeCosa, cosasDeLaGrilla, esNumero, residuosMigrantes, MIN_RACHA_RESIDUO, TOPE_RACHAS,
} from './huella-residuo.mjs'
import { aplicarHuella, claveCelda, huellasDeEscritura } from './huella-celda.mjs'
import { VACIO, fusionar } from './preservar-anotaciones.mjs'
import { preservarNoVacias } from './no-borrar.mjs'

/** Lo que QUEDA en la pestaña: fusión + la guarda ciega que repone toda celda que quedó vacía. */
const enLaPestana = (grid, hoy) => preservarNoVacias(hoy, fusionar(grid, hoy)).values

const huellasDe = (grid, opts = {}) =>
  new Map(huellasDeEscritura(grid, opts).map((h) => [claveCelda(h.fila, h.col), { forma: h.forma, huella: h.huella, borrada: false }]))

/** Filas de ancla con formas DISTINTAS entre sí, para que la alineación sea un juicio y no un empate. */
const lastre = (n = 10) =>
  Array.from({ length: n }, (_, k) => [`Ancla ${'abcdefghijklmnopqrstuvwxyz'[k % 26]} de control`, VACIO])

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS CUATRO FOCOS REALES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * G80:G84 — el bloque 4.1 se mudó de la columna G a la F y dejó su encabezado y sus cuatro básicos.
 *
 * El dueño lo vio así: `G80` dice "Básico convenio" y `G81:G84` tienen $5.399 · $6.348 · $6.348 ·
 * $5.399 sueltos, al lado de los títulos del cuadro 4. Son las fórmulas del layout anterior: leídas
 * con render FORMULA devuelven el INDEX/MATCH, no el número que se ve en pantalla.
 *
 * `formasDeTextoPropio` las deja pasar por diseño: "Básico convenio" tiene 15 caracteres (el umbral es
 * 23) y las otras cuatro son fórmulas, que ese filtro descarta a propósito.
 */
test('(1) el cuadro 4.1 se corrió de columna y dejó su encabezado y sus cuatro básicos', () => {
  const basico = (cat) => `=IFERROR(INDEX($C$88:$C$91;MATCH("${cat}";$B$88:$B$91;0));"")`
  // Lo que el generador escribe HOY: el mismo cuadro, una columna a la izquierda y siete filas abajo.
  const genera = [
    ...lastre(),
    [VACIO, VACIO],                 // fila 11 · G80 en la pestaña: el encabezado viejo quedó acá
    [VACIO, VACIO],                 // fila 12 · G81
    [VACIO, VACIO],                 // fila 13 · G82
    [VACIO, VACIO],                 // fila 14 · G83
    [VACIO, VACIO],                 // fila 15 · G84
    ['Básico convenio', VACIO],
    [basico('Ayudante'), VACIO],
    [basico('Oficial'), VACIO],
    [basico('Oficial Especializado'), VACIO],
    [basico('Medio Oficial'), VACIO],
  ]
  // Lo que la pestaña tiene hoy: el cuadro vivo abajo, y su copia huérfana arriba.
  const hoy = genera.map((f) => [...f])
  hoy[10][0] = 'Básico convenio'
  hoy[11][0] = basico('Ayudante')
  hoy[12][0] = basico('Oficial')
  hoy[13][0] = basico('Oficial Especializado')
  hoy[14][0] = basico('Medio Oficial')

  const { grid, migrantes, ajenas } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 5, 'las cinco celdas del bloque se reconocen como copia mía')
  assert.equal(ajenas.length, 0, 'ninguna queda clasificada como "nunca fue mía"')
  const pestana = enLaPestana(grid, hoy)
  for (const i of [10, 11, 12, 13, 14]) {
    assert.equal(pestana[i][0], '', `la fila ${i + 1} quedó limpia en la pestaña`)
  }
  // Y el cuadro VIVO no se toca: la limpieza saca la copia, no el original.
  assert.equal(pestana[15][0], 'Básico convenio')
  assert.equal(pestana[16][0], basico('Ayudante'))
})

/**
 * B140:B151 — doce seriales de fecha derramando debajo de la fila de total del registro.
 *
 * Es la cola de la pestaña (`conColaMedida` marca VACIO ahí) con el bloque mensual del layout
 * anterior. Doce celdas contiguas de la MISMA columna: la firma más clara que existe de un cuadro
 * que se movió, y la que un tope medido en CELDAS habría dejado afuera.
 */
test('(2) doce filas de un bloque mensual quedaron derramando debajo del total del registro', () => {
  const mensual = (f) => `=IFERROR(INDEX('_J_OBREROS'!F${f}:U${f};SUMPRODUCT(MAX(('_J_OBREROS'!F${f}:U${f}<>"")*COLUMN('_J_OBREROS'!F${f}:U${f}))));"")`
  const vivas = Array.from({ length: 12 }, (_, k) => [mensual(105 + k)])
  const genera = [...lastre(), ...vivas, ...Array.from({ length: 12 }, () => [VACIO])]
  const hoy = genera.map((f) => [...f])
  // La cola tiene el bloque viejo: las mismas fórmulas citando OTRAS filas del espejo.
  for (let k = 0; k < 12; k++) hoy[genera.length - 12 + k][0] = mensual(60 + k)

  const { grid, migrantes } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 12, 'el bloque entero de doce filas se reconoce')
  const pestana = enLaPestana(grid, hoy)
  for (let k = 0; k < 12; k++) {
    assert.equal(pestana[genera.length - 12 + k][0], '', `la fila ${k} de la cola quedó limpia`)
  }
})

/**
 * EL CASO QUE DA NOMBRE A TODO: el residuo MIGRA, y el mecanismo no puede depender de la coordenada.
 *
 * El mismo residuo, reparado a mano en una fila, reaparece trece filas más abajo cuando el cuadro de
 * arriba se acorta. Un limpiador con coordenadas declaradas queda obsoleto en la corrida siguiente;
 * este veredicto sale del par (generado, actual) y por eso no envejece.
 */
test('(3) el mismo residuo trece filas más abajo se limpia igual: no depende de la coordenada', () => {
  const armar = (offset) => {
    const genera = [...lastre(), ...Array.from({ length: offset }, () => [VACIO, VACIO]),
      [VACIO, VACIO], [VACIO, VACIO], [VACIO, VACIO],
      ['Banco', 'Básico convenio'], ['=SUM(F1:F9)', '=SUM(G1:G9)']]
    const hoy = genera.map((f) => [...f])
    const base = 10 + offset
    hoy[base][0] = 'Banco'
    hoy[base + 1][0] = 'Básico convenio'
    hoy[base + 2][0] = '=SUM(F1:F9)'
    return { genera, hoy, base }
  }
  for (const offset of [0, 13]) {
    const { genera, hoy, base } = armar(offset)
    const { grid, migrantes } = aplicarHuella(genera, hoy, huellasDe(genera))
    assert.equal(migrantes.length, 3, `con el cuadro corrido ${offset} filas el bloque se reconoce igual`)
    const pestana = enLaPestana(grid, hoy)
    for (const k of [0, 1, 2]) assert.equal(pestana[base + k][0], '', `offset ${offset}, fila ${k}`)
  }
})

/**
 * SIN MAPA DE POSICIÓN TAMBIÉN LIMPIA — y ése es el caso que importa.
 *
 * `DESPLAZAMIENTOS` llega hasta ±5 y el cuadro que abre la pestaña se acortó TRECE filas: la
 * alineación no puede dar, `aplicarHuella` sale por el camino de `noReponerAusentes` y hasta hoy ese
 * camino no limpiaba nada. Es exactamente la corrida en la que el residuo NACE.
 */
test('(4) la pestaña se rediseñó y el mapa ya no alinea: el residuo se limpia igual', () => {
  const genera = [...lastre(), [VACIO], [VACIO], [VACIO], ['Básico convenio'], ['=SUM(B1:B9)'], ['Banco']]
  const hoy = genera.map((f) => [...f])
  hoy[10][0] = 'Básico convenio'
  hoy[11][0] = '=SUM(B1:B9)'
  hoy[12][0] = 'Banco'
  // Un mapa que no cae en ninguna parte: la pestaña se rediseñó y las huellas son de otro layout.
  const huellas = new Map(Array.from({ length: 12 }, (_, k) =>
    [claveCelda(k + 1, 0), { forma: `residuo viejo numero ${k} de otro layout`, huella: `h${k}`, borrada: false }]))
  const { grid, migrantes, alineacion } = aplicarHuella(genera, hoy, huellas)
  assert.equal(alineacion.alineada, false, 'el mapa no alinea, que es la premisa del caso')
  assert.equal(migrantes.length, 3, 'la cuarta evidencia decide sin mapa de posición')
  const pestana = enLaPestana(grid, hoy)
  for (const i of [10, 11, 12]) assert.equal(pestana[i][0], '', `fila ${i + 1}`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS FRENOS — lo que este veredicto NO puede hacer
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('(5) una fórmula suelta que el dueño copió NO se borra: no llega a la racha', () => {
  const genera = [...lastre(), [VACIO], ['=SUM(B1:B9)']]
  const hoy = genera.map((f) => [...f])
  hoy[10][0] = '=SUM(B1:B9)'                          // una sola celda, no un bloque
  const { grid, migrantes, ajenas } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 0, 'una celda aislada nunca es un cuadro que se mudó')
  assert.equal(ajenas.length, 1, 'sigue tratándose como ajena: no se pisa')
  assert.equal(enLaPestana(grid, hoy)[10][0], '=SUM(B1:B9)', 'la fórmula del dueño sigue ahí')
})

test('(6) dos celdas contiguas tampoco alcanzan: el mínimo es una decisión, no un accidente', () => {
  assert.equal(MIN_RACHA_RESIDUO, 3)
  const genera = [...lastre(), [VACIO], [VACIO], ['Básico convenio'], ['=SUM(B1:B9)']]
  const hoy = genera.map((f) => [...f])
  hoy[10][0] = 'Básico convenio'
  hoy[11][0] = '=SUM(B1:B9)'
  const { grid, migrantes } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 0)
  assert.equal(enLaPestana(grid, hoy)[10][0], 'Básico convenio')
})

/**
 * EL FRENO QUE PROTEGE EL DATO DEL DUEÑO. `formaDe` enmascara TODO número como `<n>`: si los números
 * se compararan por forma, un serial de fecha que el dueño cargó y que el generador nunca escribió
 * sería "la misma cosa" que cualquier otro número del cuadro. Se comparan por VALOR EXACTO.
 */
test('(7) tres seriales de fecha del dueño que NO son copia de nada mío se conservan', () => {
  const genera = [...lastre(), [VACIO], [VACIO], [VACIO], ['46200'], ['46201'], ['46202']]
  const hoy = genera.map((f) => [...f])
  hoy[10][0] = '46081'                                // los del dueño: valores que YO no escribo
  hoy[11][0] = '46095'
  hoy[12][0] = '46112'
  const { grid, migrantes } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 0, 'ningún valor coincide: no hay copia que probar')
  const pestana = enLaPestana(grid, hoy)
  assert.deepEqual([pestana[10][0], pestana[11][0], pestana[12][0]], ['46081', '46095', '46112'])
})

test('(8) el generador escribe CONTENIDO en la celda: no es una orden de limpiar, no entra acá', () => {
  const genera = [...lastre(), ['Banco'], ['Banco'], ['Banco'], ['Banco']]
  const hoy = genera.map((f) => [...f])
  const { migrantes } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 0, 'sólo el centinela VACIO abre esta puerta')
})

test('(9) la columna del dueño llega con cadena vacía y queda intacta', () => {
  const genera = [...lastre(), [VACIO, ''], [VACIO, ''], [VACIO, ''], ['Banco', 'Pagado el']]
  const hoy = genera.map((f) => [...f])
  for (const i of [10, 11, 12]) { hoy[i][0] = 'Banco'; hoy[i][1] = 'Pagado el' }
  const { grid, migrantes } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 3, 'la columna del generador sí se limpia')
  assert.deepEqual(migrantes.map((m) => m.col), [0, 0, 0], 'y sólo ésa')
  assert.equal(enLaPestana(grid, hoy)[10][1], 'Pagado el', 'la columna del dueño no se toca')
})

test('(10) EL TOPE: más bloques que el techo y no se limpia NI UNO', () => {
  const N = TOPE_RACHAS + 1
  // El rótulo es CORTO y sin marca tipográfica a propósito: así ninguna de las puertas anteriores lo
  // reclama y lo único que puede limpiarlo —o frenarlo— es la cuarta evidencia.
  const fila = (v) => Array.from({ length: N }, () => v)
  // Un bloque de tres por cada una de las N columnas: cada uno pasa la racha, el conjunto rompe el techo.
  const genera = [...lastre().map((f) => [f[0], ...Array(N - 1).fill(VACIO)]),
    fila('Banco'), fila(VACIO), fila(VACIO), fila(VACIO)]
  const hoy = genera.map((f) => [...f])
  for (const i of [11, 12, 13]) hoy[i] = fila('Banco')

  const r = residuosMigrantes(genera, hoy, { esOrdenDeLimpiar: (c) => c === VACIO })
  assert.equal(r.bloques, N, `los ${N} bloques se detectan`)
  assert.equal(r.frenado, true, 'el tope frenó el veredicto entero')
  assert.equal(r.celdas.length, 0, 'no se limpia ninguna, ni las de los bloques que sí probaban')
  assert.match(r.motivo, /No limpio ninguno/)
  const { grid, migrantes } = aplicarHuella(genera, hoy, huellasDe(genera))
  assert.equal(migrantes.length, 0)
  assert.equal(enLaPestana(grid, hoy)[11][0], 'Banco', 'ante duda entre conservar y borrar, se conserva')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL VOCABULARIO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('(11) un número es su VALOR y una fórmula es su FORMA', () => {
  assert.equal(esNumero('46.081'), true)
  assert.equal(esNumero('=SUM(A1:A9)'), false, 'una fórmula no es un número aunque rinda uno')
  assert.equal(claveDeCosa('46.081'), claveDeCosa('46081'), 'el separador de miles no cambia el valor')
  assert.notEqual(claveDeCosa('46081'), claveDeCosa('46095'), 'dos seriales distintos NO son la misma cosa')
  // Dos fórmulas que sólo difieren en el número de fila SÍ: es un cuadro corrido de lugar.
  assert.equal(claveDeCosa('=SUM(B4:B9)'), claveDeCosa('=SUM(B5:B10)'))
})

test('(12) un texto de menos de tres letras no prueba nada', () => {
  assert.equal(claveDeCosa('—'), null)
  assert.equal(claveDeCosa('$'), null)
  assert.equal(claveDeCosa('Banco'), 'f:banco')
  assert.equal(claveDeCosa(VACIO), null, 'el centinela no es contenido')
  assert.equal(cosasDeLaGrilla([[VACIO, '', null]]).size, 0)
})
