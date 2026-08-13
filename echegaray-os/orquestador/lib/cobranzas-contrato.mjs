// EL CONTRATO DE UNA OBRA YA ESTÁ ESCRITO EN COBRANZAS — HAY QUE LEERLO, NO PEDIRLO.
//
// QUÉ RESUELVE (13/08/2026). La pestaña OBRAS declaraba como límite que el `SALDO PENDIENTE` del
// modelo del dueño no se podía calcular *"sin inventarlo"*, porque el contrato de cada obra no
// existía como dato. Se le preguntó al dueño si quería declararlo y contestó: *"ya tenes todo lo
// necesario en pestaña cobranzas"*. Tenía razón — la columna ORDEN DE COMPRA lo dice con todas las
// letras, fila por fila:
//
//   "Anticipo inicio obra 50% $ 47.590.272 Cotización n°"           → contrato $47.590.272
//   "Resto 50% s/ total 47.590.272 — certificación quincenal 1/4"   → el MISMO contrato, repetido
//   "Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9" → contrato $97.650.000
//   "Venta propia s/ total 8.758.810 — cobro íntegro al cierre"     → contrato $8.758.810
//
// ═══ POR QUÉ EL EXTRACTOR EXIGE UN MARCADOR Y NO AGARRA "EL NÚMERO MÁS GRANDE" ═══
//
// La misma columna guarda los NÚMEROS DE ORDEN DE COMPRA, y son números grandes: "OC 53239034",
// "53312775 6A", "02-00002097", "00002-00001864". Un extractor que busque cifras leería un contrato
// de $53.239.034 en una fila de ARCOR que no tiene contrato ninguno — y no daría ni un error: daría
// un saldo pendiente creíble y falso, que es la peor clase de defecto de este repo.
//
// Por eso un número sólo cuenta como contrato si viene precedido de un MARCADOR explícito: `$` o
// `s/ total` / `s/ contrato`. Verificado contra las 91 filas del archivo (13/08): las 29 filas con
// número de OC devuelven null, y las 22 que declaran contrato lo devuelven completo.
//
// EL COSTO DE ESA DECISIÓN, DECLARADO: si alguien escribe "s/ total 47590272" sin marcador o cambia
// la redacción, el contrato deja de leerse y el saldo queda VACÍO. Es la dirección correcta para
// equivocarse — un saldo que falta se ve; uno inventado, no.
//
// ═══ UN VALOR POR OBRA, PERO LAS PARTES SE SUMAN ═══
//
// Las filas de una obra repiten el mismo contrato (las 4 certificaciones de Pisos Industriales dicen
// las cuatro $47.590.272): sumarlas daría $190M sobre un contrato de $47M. Se toman los valores
// DISTINTOS.
//
// Y una obra puede estar PARTIDA: Playón de Azufre es blanco $65.000.000 + negro $37.500.000, dos
// contratos reales que suman los $102.500.000 de la obra. Por eso los valores distintos se SUMAN en
// vez de quedarse con uno.
//
// LA CONSECUENCIA HAY QUE MIRARLA DE FRENTE: si una fila tuviera el contrato mal tipeado, el
// resultado sería la suma de los dos y no un error. Por eso `contratoDeObra` devuelve SIEMPRE la
// composición (`valores`, con la fila de la que salió cada uno) y marca `partido`: el número que
// decide se publica, y la evidencia de cómo se formó viaja con él para que se pueda desmentir.

/**
 * EL MARCADOR QUE CONVIERTE UN NÚMERO EN UN CONTRATO.
 *
 * `$` con o sin espacios (el archivo escribe "$ 47.590.272" y también "$65.000.000"), o la frase
 * "s/ total" / "s/ contrato". La barra opcional cubre "s/total" pegado.
 *
 * El monto se acepta en formato es-AR (miles con punto) o en dígitos corridos: lo que NO se acepta
 * es un monto SIN marcador, que es todo el punto de este módulo.
 */
export const MARCADOR_CONTRATO = /(?:\$\s*|s\/?\s*(?:total|contrato)\s+)(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/i

/**
 * EL CONTRATO QUE DECLARA UN TEXTO DE ORDEN DE COMPRA.
 *
 * @param {string} texto la celda "ORDEN DE COMPRA" tal cual
 * @returns {number|null} el monto declarado, o null si esa fila no declara ninguno
 */
export function contratoDeclarado(texto) {
  const m = MARCADOR_CONTRATO.exec(String(texto ?? ''))
  if (!m) return null
  // es-AR: el punto separa miles y la coma es el decimal. Al revés da 47,59 en vez de 47.590.272.
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** El código con el que Cobranzas marca una fila en dólares (col "Moneda"). */
export const MONEDA_USD = 'USD'

/**
 * QUÉ MONEDA ES UNA CELDA DE LA COLUMNA "Moneda".
 *
 * VACÍO ES PESOS, y no por comodidad: 88 de las 91 filas del archivo la tienen vacía y todas son en
 * pesos. Exigir el código explícito dejaría la pestaña sin datos.
 *
 * EL CERO TAMBIÉN ES PESOS, Y ES BASURA DECLARADA. Las filas ID 35 y 36 (LA ESTRELLA) tienen un `0`
 * en esa celda, que la pestaña dibuja "$0,00" porque la columna arrastra formato de moneda de la de
 * al lado. No es un código de moneda: es formato derramado sobre una columna categórica. Se lee como
 * pesos —que es lo que esas dos filas son— y se declara, en vez de tratarlo como moneda válida.
 *
 * @returns {'ARS'|'USD'|null} null significa DESCONOCIDA: ni pesos ni dólares, y hay que gritar.
 */
export function normalizarMoneda(valor) {
  const t = String(valor ?? '').trim().toUpperCase()
  if (t === '' || t === '0' || t === '$0,00' || t === 'ARS' || t === '$') return 'ARS'
  if (t === MONEDA_USD || t === 'U$S' || t === 'US$' || t === 'DOLAR' || t === 'DÓLAR') return 'USD'
  return null
}

/**
 * LA COLUMNA "Moneda" DE COBRANZAS, DECLARADA COMO RESPALDO POSICIONAL.
 *
 * Se resuelve SIEMPRE por rótulo primero —una columna insertada mueve la letra y no el nombre—; esto
 * es lo que se usa cuando el rótulo no aparece en el encabezado leído. Mismo patrón que
 * `COL_VALOR_BANCO` para la BB. Verificado contra el archivo vivo el 13/08/2026.
 */
export const COL_MONEDA_COBRANZAS = 'AA'

/**
 * UN IMPORTE DE COBRANZAS, VALUADO EN LA MONEDA DEL LIBRO (PESOS).
 *
 * ES LA MISMA DECISIÓN QUE `sumaConUSD`, DEL OTRO LADO. Aquella compone el texto de la fórmula para
 * que Sheets valúe dentro del archivo; ésta valúa en JavaScript para el Libro. Las dos leen la MISMA
 * columna con el MISMO `normalizarMoneda` y multiplican por el MISMO `TIPO_CAMBIO_USD`: si el criterio
 * cambiara en un solo lado, la pestaña OBRAS y el Cash Flow contarían la misma venta distinto — que es
 * exactamente lo que pasaba el 13/08 (Obras!D14 valuaba los U$S 15.400 de Quattropani en $22.984.870 y
 * el Cash Flow los sumaba como $15.400).
 *
 * NO CONVIERTE "POR LAS DUDAS", Y ESO ES EL PUNTO. Cuando no se puede valuar devuelve `motivo` y NINGÚN
 * importe: el llamador tiene que abortar nombrando la fila. Grabar el monto nativo cuando la moneda no
 * se entiende, o cuando falta el tipo de cambio, es volver a producir el defecto que este módulo
 * arregla — un número en la moneda equivocada con cara de número sano.
 *
 * @param {number} importe el monto tal como lo escribe la fila, en SU moneda
 * @param {any} celdaMoneda la celda de la columna "Moneda"
 * @param {number|null} tc el tipo de cambio en uso (`TIPO_CAMBIO_USD`), o null si no se pudo leer
 * @returns {{moneda:string|null, pesos?:number, tipoCambio?:number, motivo?:string}}
 */
export function valuarEnPesos(importe, celdaMoneda, tc = null) {
  const moneda = normalizarMoneda(celdaMoneda)
  if (moneda === null) {
    return { moneda: null, motivo: `declara la moneda "${String(celdaMoneda ?? '').trim()}", que no sé convertir` }
  }
  if (moneda === 'ARS') return { moneda, tipoCambio: 1, pesos: importe }
  if (!Number.isFinite(tc) || tc <= 0) {
    return { moneda, motivo: `está en ${MONEDA_USD} y no tengo tipo de cambio (leí ${JSON.stringify(tc)})` }
  }
  return { moneda, tipoCambio: tc, pesos: importe * tc }
}

/**
 * LAS FILAS CUYA MONEDA NO SE ENTIENDE.
 *
 * POR QUÉ ES UN CONTROL Y NO UNA CONVERSIÓN MÁS. La fórmula de la pestaña reparte en dos baldes: lo
 * que dice "USD" se valúa al tipo de cambio y TODO LO DEMÁS se suma como pesos. Ese "todo lo demás"
 * es un balde de descarte: el día que alguien escriba "EUR" o "USD BLUE", esos importes entrarían al
 * total como pesos sin un solo error a la vista — exactamente el defecto que este trabajo vino a
 * arreglar, con otro código de moneda.
 *
 * @param {Array<Array>} filas las filas de datos de Cobranzas
 * @param {number} col índice 0-based de la columna "Moneda"
 * @param {number} desde fila 1-based donde empiezan los datos
 * @returns {Array<{fila:number, valor:string}>}
 */
export function monedasDesconocidas(filas = [], col = 0, desde = 1) {
  const fuera = []
  filas.forEach((f, i) => {
    const v = f?.[col]
    if (normalizarMoneda(v) === null) fuera.push({ fila: desde + i, valor: String(v ?? '') })
  })
  return fuera
}

/**
 * UNA SUMA DE COBRANZAS CON LOS DÓLARES VALUADOS — LA FORMA DE LA FÓRMULA, EN UN SOLO LUGAR.
 *
 * EL DEFECTO QUE ARREGLA (13/08). La fila ID 58 de Cobranzas (anticipo de Quattropani) tiene
 * `Moneda = USD` y un importe de 15.400. El dueño, textual: *"Son 15.400 dólares"*. Toda suma de la
 * pestaña la tomaba como $15.400 — dólares y pesos en la misma columna, que es la clase de dato
 * falso que la regla de oro 3 prohíbe. A 1.491,97 son $22.976.338: la venta de Quattropani estaba
 * subestimada en $22.960.938.
 *
 * LA FORMA ES LA FRASE: **todo, menos los dólares mal contados, más los dólares valuados.**
 *
 *   SUMIFS(x; crit) − SUMIFS(x; crit; moneda;"USD") + SUMIFS(x; crit; moneda;"USD") × TC
 *
 * POR QUÉ NO EL CAMINO CORTO. La versión compacta —sumar todo y corregir con `× (TC−1)`— da el mismo
 * número con un SUMIFS menos, y tiene una trampa: si el tipo de cambio queda en blanco (GOOGLEFINANCE
 * falla y no hay declarado), `(TC−1)` vale −1 y el importe en dólares se RESTA. Un dato falso con el
 * signo cambiado. Con esta forma, un TC vacío hace que los dólares aporten 0: se degrada perdiendo
 * el importe, no inventándole el signo. Y el escritor aborta antes de publicar si hay filas en USD
 * sin tipo de cambio, así que el caso no llega a la pestaña.
 *
 * TAMPOCO SE USA EL BALDE `moneda;"<>USD"` para los pesos: si Sheets excluyera las celdas vacías de
 * ese criterio —88 de 91 filas la tienen vacía— la pestaña quedaría casi en cero. La forma de arriba
 * usa sólo criterios positivos y no depende de esa semántica.
 *
 * @param {{rango:string, criterios:string, moneda:string, tc:string}} p rangos ya armados por quien
 *   sabe resolverlos contra el archivo; acá sólo se compone el texto.
 */
export function sumaConUSD({ rango, criterios, moneda, tc }) {
  const enUSD = `SUMIFS(${rango};${criterios};${moneda};"${MONEDA_USD}")`
  return `SUMIFS(${rango};${criterios})-${enUSD}+${enUSD}*${tc}`
}

/** ¿Este texto contiene la aguja? Sin distinguir mayúsculas — el archivo escribe "Playon Azufre" en
 *  el Concepto y "Playon de Azufre" en la OC. */
const contiene = (texto, aguja) => String(texto ?? '').toLowerCase().includes(String(aguja ?? '').toLowerCase())

/**
 * LAS FILAS DE COBRANZAS QUE SON DE ESTA OBRA.
 *
 * ES LA MISMA REGLA QUE `tramos()` DE `obras-grilla.mjs`, EN JAVASCRIPT. La de allá arma criterios de
 * SUMIFS para que Sheets los evalúe; ésta selecciona filas acá. Son dos representaciones de UNA
 * decisión de negocio, y por eso `obras-contrato.test.mjs` las corre a las dos sobre las mismas filas
 * y compara: si divergen, el contrato se estaría midiendo sobre un universo distinto que la venta, y
 * el saldo saldría mal sin dar error.
 *
 * · `unica`  — un cliente con UNA sola obra declarada ES esa obra (regla del dueño, 13/08): su
 *   anticipo no nombra la obra en ninguna columna y sin esto quedaba media obra afuera.
 * · si no, la obra se reconoce por el Concepto **O** por la Orden de Compra.
 *
 * @param {Array<Array>} filas filas de datos de Cobranzas (sin encabezado)
 * @param {{cliente:number, concepto:number, oc:number}} cols índices 0-based
 * @param {{variantes:string[], needle:string, unica:boolean}} obra
 * @returns {number[]} índices 0-based dentro de `filas`
 */
export function filasDeObra(filas = [], cols = {}, obra = {}) {
  const variantes = obra.variantes ?? []
  const out = []
  filas.forEach((f, i) => {
    if (!variantes.includes(String(f?.[cols.cliente] ?? '').trim())) return
    if (obra.unica) { out.push(i); return }
    if (contiene(f?.[cols.concepto], obra.needle) || contiene(f?.[cols.oc], obra.needle)) out.push(i)
  })
  return out
}

/**
 * EL CONTRATO DE UNA OBRA, LEÍDO DE SUS PROPIAS FILAS.
 *
 * @returns {{contrato:number|null, valores:Array<{monto:number, fila:number, texto:string}>,
 *   distintos:number[], partido:boolean}}
 *   `contrato` es null —no cero— cuando ninguna fila lo declara: un cero se leería como "el contrato
 *   vale cero", y lo que pasa es que no se sabe. `distintos` son los valores que se sumaron.
 */
export function contratoDeObra(filas = [], cols = {}, obra = {}, desde = 1) {
  const valores = []
  for (const i of filasDeObra(filas, cols, obra)) {
    const texto = String(filas[i]?.[cols.oc] ?? '')
    const monto = contratoDeclarado(texto)
    if (monto) valores.push({ monto, fila: desde + i, texto })
  }
  const distintos = [...new Set(valores.map((v) => v.monto))]
  return {
    contrato: distintos.length ? distintos.reduce((a, b) => a + b, 0) : null,
    valores,
    distintos,
    partido: distintos.length > 1,
  }
}
