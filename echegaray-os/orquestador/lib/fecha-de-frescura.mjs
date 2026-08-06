// LA FECHA QUE UNA PESTAÑA MUESTRA SALE DEL DATO, NUNCA DEL RELOJ DE LA CORRIDA.
//
// EL DUEÑO (03/08): *"siempre q modifiques valores de caja con el extracto q te envio o se haga
// modificaciones por compras pagas en efectivo o transferencias o cobranzas, las fechas que aparecen
// se deben actualizar de manera automatica"*.
//
// ═══ EL DEFECTO QUE ESTO ARREGLA ═══
//
// Los generadores escribían el rótulo de corte con `new Date()` — la fecha del día en que corrieron:
//
//     push([`… · al ${new Date().toLocaleDateString('es-AR')}`])
//
// Eso es un TEXTO. Queda clavado en el momento de la escritura y no vuelve a moverse. Mientras tanto
// los números de la misma pestaña SÍ se mueven, porque son fórmulas sobre rangos vivos: entra un
// extracto nuevo, se marca una compra pagada, se cobra una factura. Medido el 03/08 con el pipeline
// detenido: "Cheques Emitidos" decía "al 24/7/2026" con el registro llegando al 03/08.
//
// UNA FECHA DE FRESCURA QUE MIENTE ES PEOR QUE NO TENERLA, porque el dueño decide mirando ese rótulo:
// un "al 24/07" lo hace desconfiar de números que están bien, y —al revés— un "al 03/08" sobre datos
// viejos lo hace confiar en números que no están. Es la misma trampa que ya congeló el espejo de
// JORNALES y el IPC: una fuente que envejece sin gritar.
//
// ═══ LA REGLA ═══
//
//     LA FECHA DE FRESCURA SE CALCULA SOBRE LAS MISMAS CELDAS QUE LA PESTAÑA MUESTRA.
//
// Si el cuadro suma `_BANCO_RAW!$C$4:$C`, su rótulo de corte tiene que leer `_BANCO_RAW!$A$4:$A`. Así
// lo recalcula el motor de Sheets cada vez que alguien abre la planilla — no espera a que corra el
// agente, que es justo lo que hoy no está pasando.
//
// Y AL REVÉS, LO QUE NO SE PUEDE: un rótulo NO se convierte en fórmula cuando el dato que rotula es
// una constante de JavaScript o una marca que el OS congeló en esa corrida (la columna "Estado en el
// OS" de cheques-cobertura, la conciliación de Proveedores). Ahí la fórmula no daría frescura: daría
// una frescura FALSA sobre un dato congelado, que es peor que el texto honesto.
//
// ═══ LAS TRES TRAMPAS QUE ESTE ARCHIVO EVITA ═══
//
// 1. UNA FECHA FUTURA NO ES FRESCURA. "Compras" trae fecha prevista de pago, "Cheques Emitidos"
//    fecha de pago diferida y "Jornales" declara los catorce días de la quincena el día que abre: un
//    MAX crudo sobre esas columnas devuelve 30/09 y el rótulo pasa a mentir para adelante. Sólo
//    cuenta la mayor fecha que YA PASÓ.
//
// 2. LA COLUMNA VIENE EN FORMATO MIXTO. La "Fecha de caja" de Compras tiene unas filas como número
//    de serie y otras como texto "dd/mm/aaaa" (se tipearon). `MAX` ignora el texto EN SILENCIO, así
//    que el rótulo se quedaría en la última fecha que por casualidad entró como número. Se coacciona
//    con DATEVALUE, el mismo remedio ya probado en lib/caja-posterior-al-corte.mjs.
//
// 3. LA POSICIÓN NO SE ESCRIBE. Ninguna fórmula de acá cita un número de fila propio: los rangos son
//    ABIERTOS (`$C$21:$C`) y su fila de arranque la pasa el generador desde el ancla que ya calculó.
//    Una fila 40 clavada a fuego rompió una pestaña este mismo día, con `#NUM!` contaminando el
//    titular de CAJA. Un rango abierto además envejece bien: no hay que agrandarlo cuando crece.
//
// NADA DE `LET`. Un nombre de LET que se parece a una referencia A1 da `#NAME?`, y un rango metido en
// un LET pierde la expansión de array. La expresión se repite; es una sola celda y sale gratis.
//
// LOCALE es-AR: separador de argumentos `;` — la coma es el decimal. Formato de fecha dd/mm/yyyy.

/** Cuántos días sin datos nuevos hacen que el rótulo avise. El mismo umbral que la columna
 *  "Antigüedad" de CAJA, para que la pestaña hable con una sola voz. */
export const DIAS_AVISO = 7

/**
 * El mismo umbral, para una fuente MENSUAL (una DDJJ, un F931, una liquidación de IIBB).
 *
 * Una DDJJ de junio se presenta a mediados de julio: contra los 7 días de una fuente diaria el ⚠
 * estaría prendido SIEMPRE, y un aviso que nunca se apaga deja de leerse — es el mismo fracaso del
 * trinquete de frescura que ya hubo que arreglar una vez. 45 días = el mes del período más la demora
 * normal de presentación; pasado eso, falta una DDJJ de verdad.
 */
export const DIAS_AVISO_MENSUAL = 45

/**
 * NÚCLEO PURO: un texto, listo para entrar adentro de una fórmula de Sheets.
 *
 * La comilla doble se duplica: sin esto un rótulo con comillas parte la fórmula al medio y la celda
 * queda en `#ERROR!` — un subtítulo roto arriba de todo se lee como si la pestaña entera lo estuviera.
 *
 * @param {unknown} texto
 * @returns {string} el literal entre comillas, escapado
 */
export const literal = (texto) => `"${String(texto ?? '').replace(/"/g, '""')}"`

/**
 * NÚCLEO PURO: un rango de fechas coaccionado a número, para poder compararlo y sacarle el MAX.
 *
 * @param {string} rango en notación A1, ya con hoja y anclas ("_BANCO_RAW!$A$4:$A")
 * @param {{mixto?:boolean}} [opts] `mixto` = la columna mezcla número de serie y texto "dd/mm/aaaa"
 * @returns {string} expresión sin `=`
 */
export function fechaNumerica(rango, { mixto = false } = {}) {
  // DATEVALUE parsea el texto (en es-AR, dd/mm/aaaa) y falla sobre un serial; ahí IFERROR cae a N(),
  // que devuelve el propio número. Los dos formatos entran así en la misma comparación. Es la misma
  // coacción que ya usa `fechaCajaCoerc` en lib/caja-posterior-al-corte.mjs, probada en vivo.
  if (mixto) return `IFERROR(DATEVALUE(${rango}&"");N(${rango}))`
  // Sin formato mixto alcanza con neutralizar el texto: un rótulo de encabezado que caiga adentro del
  // rango abierto haría `#VALUE!` en la multiplicación de abajo y tumbaría el subtítulo entero.
  return `IF(ISNUMBER(${rango});${rango};0)`
}

/**
 * NÚCLEO PURO: la última fecha YA OCURRIDA de un rango. Es la definición de "hasta cuándo llega el
 * dato" de una columna de fechas.
 *
 * `SUMPRODUCT(MAX(...))` y no `MAX(IF(...))`: obliga a Sheets a evaluar el array sin que haya que
 * escribir un `ARRAYFORMULA`, que en una celda de rótulo derramaría sobre las de al lado. Es el mismo
 * idioma que ya usa `formulaUltimoSaldo`.
 *
 * @param {string} rango
 * @param {{mixto?:boolean, cuando?:string}} [opts] `cuando` es una condición de array extra —
 *        `(Compras!$X$4:$X="Pagado")`— para que sólo cuente la fila que de verdad movió la caja.
 * @returns {string} expresión sin `=`
 */
export function formulaUltimaFecha(rango, { mixto = false, cuando = '' } = {}) {
  const n = fechaNumerica(rango, { mixto })
  const filtro = cuando ? `${cuando}*` : ''
  return `SUMPRODUCT(MAX(${filtro}${n}*(${n}<=TODAY())))`
}

/**
 * NÚCLEO PURO: la última fecha de las filas QUE YA TIENEN IMPORTE CARGADO.
 *
 * Es más fuerte que `formulaUltimaFecha` sobre la misma columna, y la diferencia importa. Un registro
 * por quincenas escribe la FILA —con su "Hasta"— el día que la quincena abre, mucho antes de que haya
 * un solo peso adentro. Un MAX sobre las fechas declara frescura por un encabezado vacío; un MAXIFS
 * condicionado al importe declara frescura por PLATA CARGADA, que es lo que la pestaña muestra.
 *
 * Es el patrón que la fila 4 de "Jornales por Quincena" ya usa en vivo y que funciona:
 *     MAXIFS($B:$B;$K:$K;">0")
 * con dos diferencias, las dos a propósito:
 *
 *   · RANGOS CERRADOS, no columnas enteras. La columna entera anduvo de casualidad: sólo funciona
 *     mientras ninguna otra sección de la pestaña use esa misma letra. En el layout de este generador
 *     la columna K es "Σ $/hora" y no el TOTAL —una letra corrida por una columna que se agregó
 *     arriba—, así que la fórmula copiada al pie de la letra apuntaría a otra cosa sin dar error.
 *     Las letras las pasa el generador desde su PROPIO encabezado.
 *   · `<=TODAY()`. La quincena en curso tiene importe PARCIAL y un "Hasta" que todavía no llegó: sin
 *     el filtro, el rótulo declara frescura de una fecha futura sobre un cuadro a medio cargar.
 *
 * @param {string} rangoFecha en notación A1, cerrado ("$B$83:$B$96")
 * @param {string} rangoImporte la columna que sólo se llena cuando hay dato ("$J$83:$J$96")
 * @returns {string} expresión sin `=`
 */
export function formulaUltimaFechaConImporte(rangoFecha, rangoImporte) {
  return `MAXIFS(${rangoFecha};${rangoImporte};">0";${rangoFecha};"<="&TODAY())`
}

/**
 * NÚCLEO PURO: hasta qué PERÍODO llega una fuente mensual, expresado como el último día que cubre.
 *
 * Una DDJJ no tiene fecha de dato: tiene período. El F931 de junio se presenta en julio y habla de
 * junio — la frescura honesta es "cubre hasta el 30/06", no la fecha en que alguien lo bajó del PDF.
 *
 * La conversión NO usa DATEVALUE. `DATEVALUE("2026-06-01")` depende del locale del archivo y este
 * libro es es-AR: un día que Sheets lea el ISO como dd/mm devolvería un mes por otro sin dar error.
 * `DATE(VALUE(LEFT(…;4));VALUE(MID(…;6;2));1)` no depende del locale de nadie.
 *
 * FALLA MOSTRANDO CERO, NO UNA FECHA CUALQUIERA. Las celdas vacías del rango abierto y cualquier
 * período con otro formato caen a 0 por IFERROR, y `EOMONTH(0;0)` sería 31/01/1900 — una fecha
 * plausible y falsa, que es lo peor que puede pasar acá. Por eso el cero se ataja ANTES del EOMONTH y
 * el rótulo termina diciendo "sin datos" en vez de inventar un siglo.
 *
 * @param {string} rango la columna de períodos "AAAA-MM" ("_F931_RAW!$A$4:$A")
 * @returns {string} expresión sin `=`
 */
export function formulaUltimoPeriodo(rango) {
  const m = `SUMPRODUCT(MAX(IFERROR(DATE(VALUE(LEFT(${rango};4));VALUE(MID(${rango};6;2));1);0)))`
  return `IF(${m}=0;0;EOMONTH(${m};0))`
}

/**
 * NÚCLEO PURO: la más NUEVA de varias fuentes.
 *
 * Es la frescura de una pestaña que se mueve por más de UNA PUERTA — CAJA cambia con el extracto del
 * banco, con una compra que se marca pagada en efectivo o por transferencia, y con una cobranza. Su
 * rótulo tiene que moverse con cualquiera de las tres, porque cualquiera de las tres cambia el número
 * que está arriba.
 *
 * @param {string[]} expresiones cada una sin `=`
 * @returns {string} expresión sin `=`
 */
export function formulaFrescuraDe(expresiones = []) {
  const xs = expresiones.filter(Boolean)
  // Sin fuentes no hay frescura que declarar: devolver "0" haría que el rótulo dijera "sin datos
  // cargados" para siempre, que es una afirmación sobre el dato y acá el que falta es el código.
  if (!xs.length) throw new Error('formulaFrescuraDe: sin fuentes no hay frescura que declarar')
  return xs.length === 1 ? xs[0] : `MAX(${xs.join(';')})`
}

/**
 * NÚCLEO PURO: el rótulo vivo — el texto fijo de la pestaña más la fecha del último dato, calculada.
 *
 * Devuelve la fórmula ENTERA lista para escribir en la celda. Tres estados, y los tres se leen sin
 * saber nada:
 *
 *   · sin ningún dato cargado  →  "⚠ sin datos cargados" (no una fecha de 1899, que es lo que da un
 *                                 MAX vacío formateado; un cero disfrazado de fecha es un dato falso)
 *   · al día                   →  "… · al 03/08/2026 · en pesos"
 *   · atrasado                 →  "… · al 24/07/2026 · ⚠ hace 10 días · en pesos"   ← el mismo aviso
 *                                 que el dueño ya reconoce de la columna "Antigüedad" de CAJA
 *
 * @param {string} texto el rótulo fijo, sin la fecha ni el separador final
 * @param {string} expr la expresión que devuelve la fecha (sin `=`)
 * @param {{sinDato?:string, avisoDias?:number, cola?:string}} [opts] `cola` es lo que va DESPUÉS de
 *        la fecha ("en pesos"): en la gramática del repo el subtítulo termina en la unidad.
 * @returns {string} fórmula con `=`
 */
export function rotuloAlDia(texto, expr, { sinDato = '⚠ sin datos cargados', avisoDias = DIAS_AVISO, cola = '' } = {}) {
  const aviso = `IF(TODAY()-${expr}>${avisoDias};" · ⚠ hace "&TEXT(TODAY()-${expr};"0")&" días";"")`
  const conFecha = `"al "&TEXT(${expr};"dd/mm/yyyy")&${aviso}`
  const fin = cola ? `&" · "&${literal(cola)}` : ''
  return `=${literal(`${texto} · `)}&IF(${expr}=0;${literal(sinDato)};${conFecha})${fin}`
}

/**
 * NÚCLEO PURO: el rótulo de una pestaña que se alimenta de FUENTES CON FRESCURAS DISTINTAS.
 *
 * ═══ POR QUÉ NO ALCANZA UN `MAX` ═══
 *
 * "Impuestos y Financieros" cruza ARCA y el extracto del banco —que llegan a ayer— con el F931 y las
 * DDJJ de IIBB, que salen de PDF del data room y se quedan en el último período presentado. Un
 * `MAX` sobre las cuatro devuelve la fecha de la más nueva y la pone como si fuera la frescura del
 * cuadro entero: el rótulo diría "al 03/08" arriba de un número de cargas sociales que no se mueve
 * desde junio. Es exactamente la mentira que estos rótulos vinieron a sacar, con el agravante de que
 * la esconde detrás de una fecha viva.
 *
 *     UNA FUENTE VIVA NO LE PRESTA SU FRESCURA A UNA CONGELADA.
 *
 * Y AL REVÉS TAMPOCO: un `MIN` haría que la más atrasada arrastre a todas, y el dueño dejaría de ver
 * que el IVA de ARCA sí está al día. La única salida honesta es NO RESUMIR: cada fuente declara la
 * suya, y la que está atrasada lo dice al lado de su propia fecha.
 *
 * ═══ EL UMBRAL ES POR FUENTE, NO UNO SOLO PARA TODAS ═══
 *
 * Una fuente MENSUAL siempre está "atrasada" contra un umbral de días pensado para el extracto: el
 * F931 de junio se presenta a mediados de julio y a fin de mes ya lleva 34 días. Con un umbral único
 * de 7 días el ⚠ estaría prendido siempre, y un aviso que nunca se apaga deja de leerse — el mismo
 * fracaso del trinquete de frescura que ya hubo que arreglar una vez. Cada fuente trae el suyo:
 * diario para el banco y ARCA, del orden del mes + la demora de presentación para una DDJJ.
 *
 * @param {string} texto el rótulo fijo, sin fechas
 * @param {{nombre:string, expr:string, avisoDias?:number}[]} fuentes en el orden en que se leen
 * @param {{avisoDias?:number, cola?:string}} [opts]
 * @returns {string} fórmula con `=`
 */
export function rotuloPorFuente(texto, fuentes = [], { avisoDias = DIAS_AVISO, cola = '', compacto = false } = {}) {
  const xs = (fuentes || []).filter((f) => f && f.nombre && f.expr)
  // Igual que `formulaFrescuraDe`: sin fuentes el que falta es el código, no el dato. Un rótulo que
  // dijera "sin datos" por un arreglo vacío sería una afirmación falsa sobre la empresa.
  if (!xs.length) throw new Error('rotuloPorFuente: sin fuentes no hay frescura que declarar')
  const fin = cola ? `&" · "&${literal(cola)}` : ''
  // ═══ COMPACTO: CADA EXPRESIÓN UNA SOLA VEZ, DENTRO DE UN LET (06/08) ═══
  //
  // El dueño, mirando "Impuestos y Financieros": *"no la fórmula de 4.500 caracteres"*. Y tenía razón
  // —la celda A2 medía eso— pero el arreglo obvio (una sola fecha, la mínima o la máxima) está
  // PROHIBIDO acá y con motivo: esta pestaña cruza fuentes vivas (ARCA, el extracto) con congeladas
  // (las DDJJ de PDF), y una sola fecha le presta la frescura de la viva a la congelada.
  //
  // El largo no venía de declarar cuatro fuentes: venía de que cada expresión aparecía CUATRO veces
  // (el =0, el TEXT, y dos en el aviso de atraso). La de IIBB sola pesa 250 caracteres, así que se
  // escribía 1.000. Con LET se evalúa una vez y se nombra. Mismo texto, mismo aviso, mismas cuatro
  // fuentes declaradas por separado — 80% menos celda.
  //
  // LOS NOMBRES NO PUEDEN PARECER UNA REFERENCIA A1 (`f1` sería la celda F1 y Sheets devuelve #NAME?),
  // así que llevan una letra al final: `fa`, `fb`… Es la trampa que ya costó una pestaña entera.
  if (!compacto) {
    const trozo = ({ nombre, expr, avisoDias: dias = avisoDias }) => {
      const atraso = `TODAY()-${expr}`
      const aviso = `IF(${atraso}>${dias};" ⚠ hace "&TEXT(${atraso};"0")&" días";"")`
      return `IF(${expr}=0;${literal(`${nombre} sin datos`)};${literal(`${nombre} al `)}&TEXT(${expr};"dd/mm")&${aviso})`
    }
    return `=${literal(`${texto} · `)}&${xs.map(trozo).join('&" · "&')}${fin}`
  }
  const nombreDe = (i) => `fx${String.fromCharCode(97 + i)}`
  const declaraciones = xs.map((f, i) => `${nombreDe(i)};${f.expr}`).join(';')
  const trozo = ({ nombre, avisoDias: dias = avisoDias }, i) => {
    const v = nombreDe(i)
    const aviso = `IF(TODAY()-${v}>${dias};" ⚠ hace "&TEXT(TODAY()-${v};"0")&" días";"")`
    return `IF(${v}=0;${literal(`${nombre} sin datos`)};${literal(`${nombre} al `)}&TEXT(${v};"dd/mm")&${aviso})`
  }
  return `=LET(${declaraciones};${literal(`${texto} · `)}&${xs.map(trozo).join('&" · "&')}${fin})`
}

/**
 * NÚCLEO PURO: la antigüedad de una celda que tiene una fecha, con aviso pasados unos días.
 *
 * Es el patrón que la columna "Antigüedad" de CAJA ya usaba y que el dueño señaló como el bueno — se
 * extrae acá para que exista UNA sola versión: una regla que vive copiada en dos generadores se
 * arregla en uno y sigue rota en el otro.
 *
 * @param {string} celda la celda con la fecha ("F19")
 * @param {{avisoDias?:number, sinFecha?:string}} [opts]
 * @returns {string} fórmula con `=`
 */
export function formulaAntiguedad(celda, { avisoDias = DIAS_AVISO, sinFecha = '⚠ sin cargar' } = {}) {
  const dias = `TEXT(TODAY()-${celda};"0")&" días"`
  return `=IF(${celda}="";${literal(sinFecha)};IF(TODAY()-${celda}>${avisoDias};"⚠ "&${dias};${dias}))`
}
