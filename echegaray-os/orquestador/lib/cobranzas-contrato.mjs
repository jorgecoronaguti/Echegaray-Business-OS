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
 * UNA CUENTA ANOTADA AL PASO NO ES UN CONTRATO — Y ESCRIBE UN `$` IGUAL DE VÁLIDO.
 *
 * EL DEFECTO QUE ARREGLA (10/09/2026). Alguien agregó al final de la H78 de Quattropani la cuenta con
 * la que estimó la certificación del día:
 *
 *   "Resto 50% s/ contrato U$S 63.000 + IVA — certificación quincenal 1/9 -  ($1503,6*USD3500)"
 *
 * Ese "$1503,6" es el TIPO DE CAMBIO del día, no plata: es el primer factor de una multiplicación. El
 * marcador lo leyó como contrato en pesos, el camino "OC en pesos" le ganó al de dólares y la obra se
 * publicó CONTRATADA EN $1.504 — con un margen de −$39,1 M en OBRAS y en /clientes. El defecto no dio
 * ni un error: dio un número chiquito y creíble, que es la peor clase de defecto de este repo.
 *
 * POR QUÉ SE BORRA LA EXPRESIÓN ENTERA Y NO SE "IGNORA EL NÚMERO". Un lookahead que rechace el número
 * seguido de `*` no alcanza: el motor de regex retrocede y se queda con "1503" —el prefijo que NO
 * está pegado al asterisco— y publica un contrato de $1.503. La única forma robusta es sacar del
 * texto la MULTIPLICACIÓN COMPLETA antes de buscar marcadores; lo que queda afuera de la cuenta se
 * sigue leyendo igual.
 *
 * EL COSTO, DECLARADO: si alguien escribiera un contrato real dentro de una multiplicación
 * ("s/ contrato $ 95.000.000 x 2 obras"), dejaría de leerse y la obra caería a su suma viva. Es la
 * misma dirección de error que eligió todo este módulo: un contrato que falta se ve; uno inventado, no.
 */
const CUENTA_ESCRITA = /(?:U\$S|US\$|USD|\$)?\s*\d[\d.,]*\s*[*\u00d7x]\s*(?:U\$S|US\$|USD|\$)?\s*\d[\d.,]*/gi

/** El texto de la Orden de Compra sin las cuentas anotadas al paso. Ver `CUENTA_ESCRITA`. */
export function sinCuentas(texto) {
  return String(texto ?? '').replace(CUENTA_ESCRITA, ' ')
}

/** El precio de la obra cuando la fila lo distingue de su saldo. Ver `contratoDeclarado`. */
export const MARCADOR_PRECIO = /precio\s+(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/i

/**
 * EL CONTRATO QUE DECLARA UN TEXTO DE ORDEN DE COMPRA.
 *
 * @param {string} texto la celda "ORDEN DE COMPRA" tal cual
 * @returns {number|null} el monto declarado, o null si esa fila no declara ninguno
 */
export function contratoDeclarado(texto) {
  // EL "PRECIO" LE GANA AL "S/ TOTAL" CUANDO LA MISMA FILA DICE LOS DOS (07/09/2026).
  //
  // Mampostería: *"Venta propia s/ total 9.273.576,40 — saldo de mampostería y cierre pádel (precio
  // 14.273.576,40; 5.000.000 cobrados el 17/07 en la fila 50)"*. Los dos números son ciertos y dicen
  // cosas distintas: 9.273.576,40 es lo que queda por facturar y 14.273.576,40 es lo que vale la
  // obra. La columna se llama «Contratado», así que manda el precio — publicar el saldo dejaba la
  // obra $5.000.000 más barata de lo que es y su margen $5.000.000 peor.
  //
  // ES EL ÚNICO RENGLÓN DE COBRANZAS QUE USA LA PALABRA (verificado el 07/09 sobre las 100 filas del
  // archivo vivo), y por eso el marcador exige un número PEGADO a ella: "ACTUALIZACIÓN DE PRECIOS"
  // no declara nada y no puede engancharse.
  const limpio = sinCuentas(texto)
  const precio = MARCADOR_PRECIO.exec(limpio)
  const m = precio ?? MARCADOR_CONTRATO.exec(limpio)
  if (!m) return null
  // es-AR: el punto separa miles y la coma es el decimal. Al revés da 47,59 en vez de 47.590.272.
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * EL MARCADOR DEL CONTRATO EN DÓLARES.
 *
 * Quattropani escribe su contrato así: *"Resto 50% s/ contrato U$S 63.000 + IVA — certificación
 * quincenal 1/9"*. El marcador de pesos NO lo puede leer y no es un descuido: el `$` de "U$S" está
 * seguido de una letra, así que `MARCADOR_CONTRATO` no engancha, y menos mal — leer 63.000 como
 * pesos publicaría un contrato noventa y cinco millones más chico que el real.
 *
 * SE DEVUELVE EN DÓLARES, NO EN PESOS. Convertir acá congelaría el contrato al tipo de cambio del
 * día de la corrida; la pestaña publica `U$S × TC` como FÓRMULA VIVA y el número se mueve solo.
 */
export const MARCADOR_CONTRATO_USD = /(?:U\$S|US\$|USD)\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/i

/**
 * EL CONTRATO EN DÓLARES QUE DECLARA UN TEXTO DE ORDEN DE COMPRA.
 *
 * @param {string} texto la celda "ORDEN DE COMPRA" tal cual
 * @returns {number|null} el monto en USD, o null si esa fila no declara ninguno
 */
export function contratoUsdDeclarado(texto) {
  // Mismo saneo que en pesos: el "USD3500" de la cuenta de la H78 es el importe de UNA certificación,
  // no el contrato. Sin sacar la multiplicación, una fila que sólo tuviera la cuenta declararía un
  // contrato de U$S 3.500.
  const m = MARCADOR_CONTRATO_USD.exec(sinCuentas(texto))
  if (!m) return null
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

/** La letra de columna del Sheet, como índice 0-based dentro de una fila leída desde la A. */
export const indiceDeColumna = (letra) =>
  String(letra).toUpperCase().split('').reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1

/** Índice 0-based de la columna "Moneda" dentro de una fila leída desde la A. */
export const IDX_MONEDA_COBRANZAS = indiceDeColumna(COL_MONEDA_COBRANZAS)

/**
 * EL RANGO QUE HAY QUE LEER PARA REPLICAR COBRANZAS — DERIVADO DE LA COLUMNA DE LA MONEDA.
 *
 * `sync-cobranzas.mjs` lo tenía escrito a mano como `A5:R5000` y por eso la moneda no llegaba nunca:
 * la R es la 18 y la moneda es la 27. Un rango a mano y una columna declarada aparte son dos verdades
 * que se separan sin avisar — el modo de falla no es un error, es una fila en dólares sumada como
 * pesos. Acá el rango NO PUEDE quedarse corto: sale de la misma constante.
 */
export const RANGO_COBRANZAS = `Cobranzas!A5:${COL_MONEDA_COBRANZAS}5000`

/**
 * LA FORMA DE COBRO, TRADUCIDA AL INSTRUMENTO. PURA.
 *
 * Vive en el contrato de la pestaña —y no en el extractor del Libro, donde nació— desde el 15/08:
 * ahora la usan tres lugares (el Libro para clasificar el movimiento, el cruce de endosos para saber
 * qué se puede endosar, y el respaldo bancario para saber qué cobro DEBERÍA aparecer en la cuenta).
 * Escrita tres veces, la copia que se olvide del "eCheq" clasifica un echeq como cheque y el cruce
 * empieza a buscar en la lista equivocada.
 *
 * "eCheq" contiene "cheque": el orden de las condiciones es el que decide, no un adorno.
 */
export function instrumentoDeCobro(forma) {
  const f = String(forma ?? '').trim().toLowerCase()
  if (/echeq/.test(f)) return 'echeq'
  if (/cheque/.test(f)) return 'cheque'
  if (/efectivo/.test(f)) return 'efectivo'
  if (/transfer/.test(f)) return 'transferencia'
  return 'desconocido'
}

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
 * LOS IMPORTES DE UNA FILA DE COBRANZAS, TODOS VALUADOS EN PESOS DE UNA SOLA VEZ.
 *
 * EL DEFECTO QUE ARREGLA (10/09/2026). `sync-cobranzas.mjs` leía `A5:R` — hasta la columna 18— y la
 * columna "Moneda" es la AA. La fila 62 de Quattropani dice `U$S 15.400` y entraba a
 * `public.cobranzas` como **$15.400**: el cobrado de su cuenta corriente daba $23.273.434 de menos
 * que el Sheet, y nadie podía verlo, porque un 15.400 en una columna de pesos no se ve mal. Es el
 * MISMO defecto que se arregló en la pestaña el 13/08 —ahí Obras!D14 valuaba y el Cash Flow no—,
 * reaparecido en la réplica de Postgres por el lado del rango leído.
 *
 * LOS CUATRO IMPORTES DE LA FILA SON DE LA MISMA MONEDA: neto, IVA, retenciones y total bruto
 * describen UN comprobante. Valuar uno solo dejaría una fila donde el total no es la suma de sus
 * partes — un cuadre roto que después nadie sabe de dónde salió.
 *
 * NO CONVIERTE A MEDIAS: si la moneda no se entiende o falta el tipo de cambio, devuelve `motivo` y
 * NINGÚN importe. El llamador tiene que abortar nombrando la fila, nunca grabar el número nativo.
 *
 * @param {Record<string, any>} importes los importes tal como los escribe la fila, en SU moneda
 * @param {any} celdaMoneda la celda de la columna "Moneda" (AA)
 * @param {number|null} tc el tipo de cambio en uso, o null
 * @returns {{moneda:string|null, tipoCambio?:number, importes?:Record<string,number|null>, motivo?:string}}
 */
export function valuarFilaCobranza(importes = {}, celdaMoneda = '', tc = null) {
  const cabeza = valuarEnPesos(1, celdaMoneda, tc)
  if (cabeza.motivo) return { moneda: cabeza.moneda, motivo: cabeza.motivo }
  const factor = cabeza.tipoCambio
  const out = {}
  for (const [k, v] of Object.entries(importes)) {
    out[k] = Number.isFinite(v) ? v * factor : null
  }
  return { moneda: cabeza.moneda, tipoCambio: factor, importes: out }
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
 * ¿ESTA FILA CAE EN EL AÑO DE LA VENTANA? Sin `anio` declarado, TODAS caen.
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (10/09/2026) ═══
 *
 * La columna D de OBRAS acota la venta por su FECHA DE VENTA al año del rótulo (`enElAno` en
 * `obras-grilla.mjs`, «⇒ TOTAL 2026»); `ventaViva()` —la misma cuenta hecha en JS para persistirla en
 * `obra_economia_sheet`— no acotaba nada. Las dos caras publicaban la misma obra sobre universos
 * distintos y la diferencia no se veía: la fila 3 de San Francisco vende $15.000.000 el 15/12/2025 y
 * entraba entera en la pantalla y en ninguna celda de la pestaña.
 *
 * La fecha se lee como SERIAL de Sheets (`UNFORMATTED_VALUE`) o como texto ISO. Una fecha ilegible NO
 * saca la fila: sacarla restaría plata por un formato, que es peor que contarla de más y además es
 * invisible. Se cuenta, y quien audita ve la fila.
 */
export function enElAnio(valor, anio) {
  if (!anio) return true
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return new Date(Date.UTC(1899, 11, 30) + valor * 86400000).getUTCFullYear() === anio
  }
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(String(valor ?? '').trim())
  return m ? Number(m[1]) === anio : true
}

/**
 * LAS FILAS DE COBRANZAS QUE SON DE ESTA OBRA — POR LA IMPUTACIÓN CANÓNICA O POR EL ESPEJO DE LA
 * FÓRMULA.
 *
 * ═══ EL CAMINO BUENO: `imputadas` ═══
 *
 * Los índices ya resueltos por `cobro_por_obra` —la OC de la columna H contra `cliente_orden`, el
 * texto que nombra la obra, la bolsa del cliente— tal como los publica `public.cobranza_imputacion`.
 * Cuando vienen, MANDAN: no se mira ni el cliente ni el `needle`, porque la imputación ya resolvió
 * las dos cosas y volver a filtrar sería una segunda regla encima de la canónica.
 *
 * ═══ EL CAMINO VIEJO: `needle`, Y POR QUÉ SIGUE VIVO ═══
 *
 * Es el espejo EXACTO de `tramos()` de `obras-grilla.mjs`, que arma los criterios del SUMIFS que
 * publica la pestaña OBRAS. La pestaña no puede consultar Postgres: su celda D es una fórmula que
 * Sheets evalúa sobre la propia hoja, así que el generador del Sheet tiene que seguir seleccionando
 * por texto y `obras-contrato.test.mjs` corre las dos y compara.
 *
 * PERO NO ES LA DEFINICIÓN DE «QUÉ FILA ES DE QUÉ OBRA» Y NO PUEDE USARSE PARA LEER. Medido el
 * 10/09/2026: la fila 46 —«ACTUALIZACION DE PRECIOS OC 02-00000279», $3.583.956— pertenece a BSA por
 * su orden de compra 00002-00001984 y no dice «BSA» en ninguna columna. El `needle` la dejaba afuera
 * del contratado ($14.120.243,40) mientras el cobro —que sí sale de la imputación— la incluía: la
 * misma obra, dos universos, y una obra $3,58 M más barata de lo que es. El registro
 * `orquestador/datos/definiciones.json` prohíbe el patrón fuera de los dos generadores de Sheets.
 *
 * @param {Array<Array>} filas filas de datos de Cobranzas (sin encabezado)
 * @param {{cliente:number, concepto:number, oc:number, fechaVenta?:number}} cols índices 0-based
 * @param {{imputadas?:number[], variantes?:string[], needle?:string, unica?:boolean, anio?:number}} obra
 * @returns {number[]} índices 0-based dentro de `filas`
 */
export function filasDeObra(filas = [], cols = {}, obra = {}) {
  const enVentana = (i) => enElAnio(filas[i]?.[cols.fechaVenta], obra.anio)
  if (obra.imputadas) return [...obra.imputadas].filter((i) => filas[i] !== undefined && enVentana(i))
  const variantes = obra.variantes ?? []
  const out = []
  filas.forEach((f, i) => {
    if (!variantes.includes(String(f?.[cols.cliente] ?? '').trim())) return
    if (!enVentana(i)) return
    if (obra.unica) { out.push(i); return }
    if (contiene(f?.[cols.concepto], obra.needle) || contiene(f?.[cols.oc], obra.needle)) out.push(i)
  })
  return out
}

/**
 * ¿ESTA OBRA TODAVÍA TIENE PLATA POR COBRAR?
 *
 * Regla del dueño (07/09/2026): *«quitar obras q ya no tiene saldo pendiente»*. La pestaña OBRAS es
 * una herramienta de cobranza, no un archivo histórico: una obra íntegramente cobrada ya no admite
 * ninguna decisión y ocupa un renglón que compite con las que sí.
 *
 * SE MIDE SOBRE EL ESTADO DE SUS FILAS, NO SOBRE UN IMPORTE. Comparar cobrado contra contratado
 * daría falsos cierres —una obra en dólares y una con retenciones nunca cierran al peso—, y daría
 * también falsas aperturas por un centavo de diferencia. El estado es lo que el dueño escribe.
 *
 * UNA OBRA SIN NINGUNA FILA NO SE DA POR COBRADA: no se sabe nada de ella, y esconderla sería
 * afirmar que se cobró. Las que sí tienen filas, se esconden sólo si TODAS están Cobrado o Cancelar.
 *
 * @param {Array<Array>} filas filas de datos de Cobranzas
 * @param {{cliente:number, concepto:number, oc:number, estado:number}} cols índices 0-based
 * @param {{variantes:string[], needle:string, unica:boolean}} obra
 * @returns {{cobrada:boolean, pendientes:number[], total:number}} `pendientes` son las filas
 *   1-based que todavía deben plata: la evidencia de por qué la obra se queda.
 */
export function saldoDeObra(filas = [], cols = {}, obra = {}, desde = 1) {
  const cerrado = new Set(['cobrado', 'cancelar'])
  const indices = filasDeObra(filas, cols, obra)
  const pendientes = indices
    .filter((i) => !cerrado.has(String(filas[i]?.[cols.estado] ?? '').trim().toLowerCase()))
    .map((i) => desde + i)
  return { cobrada: indices.length > 0 && pendientes.length === 0, pendientes, total: indices.length }
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
  const enUsd = []
  for (const i of filasDeObra(filas, cols, obra)) {
    const texto = String(filas[i]?.[cols.oc] ?? '')
    const monto = contratoDeclarado(texto)
    if (monto) valores.push({ monto, fila: desde + i, texto })
    // EL DÓLAR SE JUNTA APARTE Y NO SE SUMA AL PESO: son unidades distintas y sumarlas daría un
    // número sin significado. Quattropani declara U$S 63.000 y ninguna de sus filas declara pesos,
    // así que las dos listas nunca se pisan; si algún día se pisaran, gana el peso —está en la
    // moneda en la que se cobra— y el dólar queda visible en `usd` para poder mirarlo.
    const usd = contratoUsdDeclarado(texto)
    if (usd) enUsd.push({ monto: usd, fila: desde + i, texto })
  }
  const distintos = [...new Set(valores.map((v) => v.monto))]
  const distintosUsd = [...new Set(enUsd.map((v) => v.monto))]
  return {
    contrato: distintos.length ? distintos.reduce((a, b) => a + b, 0) : null,
    contratoUsd: distintosUsd.length ? distintosUsd.reduce((a, b) => a + b, 0) : null,
    valores,
    usd: enUsd,
    distintos,
    partido: distintos.length > 1,
  }
}

/**
 * CUÁL DE LOS DOS CONTRATOS MANDA CUANDO LA OBRA DECLARA PESOS Y DÓLARES — UNA SOLA VEZ.
 *
 * La regla vive acá y no en cada consumidor porque son DOS: la columna D de la pestaña OBRAS
 * (`contratado()` en obras-grilla, que publica la fórmula) y `contratadoEnPesos` (que persiste el
 * número en `obra_economia_sheet` para /clientes). Escrita dos veces, el día que una cambie la
 * pantalla y la pestaña dirían distinto de la misma obra — que es lo que REALIDAD ÚNICA prohíbe.
 *
 * EL CRITERIO, Y POR QUÉ ES SEGURO: un contrato en pesos NUNCA puede ser menor que su propia cifra en
 * dólares, porque el tipo de cambio es mayor que uno. Si el "pesos" leído es más chico que el "USD"
 * leído, ese pesos NO es un contrato: es un número de otra cosa que se coló con un `$` adelante —el
 * tipo de cambio anotado en la H78 de Quattropani, sin ir más lejos. Ante esa contradicción manda el
 * dólar, que es la moneda en la que ESE contrato está escrito.
 *
 * Es una segunda línea de defensa, no la primera: la primera es `sinCuentas`. Se ponen las dos porque
 * la anotación que rompió esto la escribe una persona en una celda libre, y la próxima va a estar
 * redactada de otra forma.
 */
export function prefiereContratoUsd(contrato, contratoUsd) {
  if (!Number.isFinite(contratoUsd) || contratoUsd <= 0) return false
  if (!Number.isFinite(contrato) || contrato <= 0) return true
  return contrato < contratoUsd
}
