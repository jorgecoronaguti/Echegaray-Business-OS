// LOS DEFECTOS QUE NO VE NINGÚN CONTROL QUE SUMA.
//
// POR QUÉ EXISTE (21/07). El dueño, tercera vez sobre la misma pestaña: "sigue sin estar bien el
// formato de proveedores y materiales, te demando revisión completa, lectura completa".
//
// Tenía razón otra vez, y el problema de fondo es mío: yo verificaba que los TOTALES cerraran. Los
// totales cerraban. Lo que estaba roto era lo que se VE, y de eso no había ni un control:
//
//   · 22 filas mostraban "30/12/99" como próximo pago — es el serial 0 con formato de fecha, o sea
//     "no hay fecha" disfrazado de un día de 1899.
//   · "ninguno llega al 1% del total" en una celda con formato moneda.
//   · 29 filas en blanco en el medio, que son el colchón que se reserva para que un QUERY derrame.
//   · CUIT como 30681641730 en vez de 30-68164173-0.
//
// Ninguno de esos cambia un total en un peso. Todos hacen que la pestaña se lea mal, que es
// exactamente lo que el dueño viene señalando tres veces.
//
// ═══ LA REGLA QUE SE DERIVA ═══
//
// Un control que suma no ve un defecto de pantalla. Hace falta mirar la celda: su VALOR junto con su
// FORMATO. Este archivo es eso — núcleo puro, para poder correrlo sobre cualquier pestaña del
// archivo y no sólo sobre la que el dueño acaba de rechazar.

import { glifosInvisibles } from './glifos.mjs'

/** El serial 0 de una fecha en Sheets: 30/12/1899. Un MINIFS sin coincidencias devuelve 0. */
export const FECHA_CERO = /^30\/12\/(1899|99)$/

/**
 * NÚCLEO PURO: ¿esta celda es una FECHA dibujada como el número crudo?
 *
 * POR QUÉ (13/08). "Calendario de Cobros" publicó cuatro de sus cinco encabezados de mes como
 * `46260`, `46321`, `46352` y `46382`. La causa es una combinación, no un valor: el contenido es un
 * SERIAL de fecha y el formato de la celda es `TEXT`. Sheets no lo dibuja como fecha —el formato no
 * es de fecha— ni como texto —el contenido no lo es—, así que dibuja el número pelado.
 *
 * Pasa siempre que se escribe con `USER_ENTERED` un texto que Sheets sabe parsear ("ago-26" es el 26
 * de agosto en es_AR) sobre una celda que alguien pintó de `TEXT`. Ninguna de las dos decisiones da
 * error por separado, y juntas producen un encabezado ilegible sin una sola celda en rojo.
 *
 * EL RANGO 40.000–60.000 son los seriales de 2009 a 2064: es donde caen las fechas de este archivo.
 * Un `TEXT` con cinco dígitos fuera de ese rango puede ser un número de comprobante y no se marca.
 *
 * @param {string} valor lo que se VE en la celda
 * @param {string|null} nf el tipo de formato de número de la celda
 */
export function esSerialCrudo(valor, nf) {
  if (nf !== 'TEXT') return false
  const s = String(valor ?? '').trim()
  if (!/^\d{5}$/.test(s)) return false
  const n = Number(s)
  return n >= 40000 && n <= 60000
}

/** Los tipos de formato que dicen "esta celda es un número". */
const NUMERICO = new Set(['CURRENCY', 'NUMBER', 'PERCENT'])

/**
 * NÚCLEO PURO: el valor de una celda SIN los literales que dibuja su propio formato de número.
 *
 * ═══ POR QUÉ (15/08) ═══
 *
 * Arreglar el formato de la columna «Vencido» de OBRAS —las seis celdas que publicaban
 * `17449303,3143` en crudo— movió el defecto de lugar en vez de sacarlo: las celdas pasaron a ser
 * números con el patrón de alerta `"▲ "#,##0`, y este detector empezó a reportar las cinco que
 * tienen importe (`F10`, `F15`, `F18`, `F27`, `F29`) como "texto en una celda con formato CURRENCY".
 * Medido con `UNFORMATTED_VALUE`: adentro hay `17449303.3143`, un número. Lo que ve el detector es el
 * DIBUJO —"▲ 17.449.303"— y ningún número empieza con un triángulo.
 *
 * LA REGLA, Y POR QUÉ NO ES UNA LISTA DE SÍMBOLOS: los tramos entre comillas de un patrón de número
 * son texto que pone el FORMATO, no contenido de la celda. `"▲ "#,##0` promete un triángulo adelante
 * igual que `"$"#,##0` promete un peso y `0" facturas"` promete la palabra atrás. Sacarlos del
 * dibujo antes de juzgarlo es leer la celda por lo que su propia declaración dice que es — el mismo
 * criterio que `lib/obras-especies.mjs`: el formato es una proyección del dato, no una lista aparte
 * que alguien tiene que acordarse de actualizar. El día que entre un patrón nuevo, esto ya lo sabe.
 *
 * SÓLO EN LOS BORDES. Un patrón de número dibuja sus literales adelante o atrás del número, así que
 * ahí es donde se sacan. Una nota de verdad metida en una celda de alerta —"▲ ninguna compra la
 * nombra", que es lo que publica OBRAS cuando no puede emparejar— pierde el triángulo y sigue siendo
 * prosa: se reporta igual, que es lo que tiene que pasar.
 *
 * @param {string} valor lo que se VE en la celda
 * @param {string} [patron] `numberFormat.pattern` de esa misma celda
 */
export function sinLiteralesDelPatron(valor, patron) {
  let s = String(valor ?? '').trim()
  if (!patron || !s) return s
  const literales = [...String(patron).matchAll(/"([^"]*)"/g)].map((m) => m[1].trim()).filter(Boolean)
  if (!literales.length) return s
  let saco = true
  while (saco && s) {
    saco = false
    for (const l of literales) {
      if (s.startsWith(l)) { s = s.slice(l.length).trim(); saco = true }
      if (s.endsWith(l) && s !== l) { s = s.slice(0, -l.length).trim(); saco = true }
    }
  }
  return s
}


/** ¿El texto es un número que Sheets ya formateó? Sirve para saber si el valor es texto de verdad. */
const esTextoDeVerdad = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return false
  // EL GUION ES EL CERO. Los formatos de número dibujan el cero como un guion para que una columna
  // de importes no se llene de "$0" — y cada variante lo hace distinto: el estándar del OS usa "—"
  // (largo) y el formato contable de Cobranzas usa "-" (corto), a veces con espacios. Reconocer sólo
  // uno reportaba 684 ceros correctos como texto mal puesto, y ese ruido tapaba los 50 defectos
  // reales que sí tiene esa pestaña.
  if (/^\s*[—–-]\s*$/.test(s)) return false
  // EL TILDE ES EL CERO DE UN CONTROL. "⇒ Diferencia — tiene que ser $0" dibuja su cero como
  // "✓ $0" (tercera sección del patrón de moneda): el cero ES la respuesta y tiene que verse como
  // aprobación, no como guion de celda vacía. El valor de la celda sigue siendo un número — el
  // detector veía el dibujo y lo reportaba como texto (Cargas B83, auditor del 06/08).
  if (/^✓\s*\$?\s*0$/.test(s)) return false
  // EL SIGNO VA ANTES DEL PESO. La primera versión sólo aceptaba "$-1.234" y marcaba "-$2.949.816"
  // como texto: 2.486 falsos positivos en catorce pestañas, o sea un control inservible. Un
  // detector que grita por todo es peor que no tenerlo, porque enseña a ignorarlo.
  if (/^[-+]?\s*[$]?\s*[-+]?[\d.,\s]+\s*%?$/.test(s)) return false
  // Los dólares se escriben "U$S 581,39" en Argentina, y el símbolo va con letras adelante. Sin
  // esto, cada importe en moneda extranjera se reportaba como texto mal puesto.
  if (/^[-+]?\s*(?:U\$S|US\$|USD)\s*[-+]?[\d.,\s]+$/i.test(s)) return false
  // NOTACIÓN CONTABLE: el paréntesis es el signo menos. "($ 96.800,00)" es un importe negativo, no
  // un texto — así lo dibuja el formato contable que usa Cobranzas en dos columnas enteras. Sin
  // esto el detector reportaba 688 celdas correctas como defectos: el 93% del ruido de esa pestaña,
  // y suficiente para que nadie mire la lista donde SÍ hay 49 defectos reales.
  if (/^\(\s*(?:U\$S|US\$|USD|\$)?\s*[\d.,\s]+\)$/i.test(s)) return false
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return false
  // UN NÚMERO CON SUFIJO DECLARADO SIGUE SIENDO UN NÚMERO. El formato `0" facturas"` produce
  // "46 facturas" y el formato `0" d"` produce "7 d": los dos son la forma correcta de mostrar un
  // contador para que no se lea como plata. Marcarlos era ruido, y un detector ruidoso enseña a
  // ignorarlo — que es peor que no tenerlo.
  if (/^-?[\d.,]+\s+[a-zá-ú.]+$/i.test(s)) return false
  return true
}

/**
 * ¿El DIBUJO de esta celda es texto, una vez sacado lo que puso su propio formato de número?
 *
 * Es la forma en que TODO este archivo pregunta "esto es texto": la celda entera, no el string suelto.
 * `esTextoDeVerdad` sigue existiendo para el string pelado, pero preguntarle a él directamente vuelve
 * a dejar afuera el patrón —que es la mitad de la evidencia— y así es como cinco importes de OBRAS
 * pasaron a reportarse como notas mal puestas.
 */
const esTextoEnCelda = (celda) => {
  const v = String(celda?.valor ?? '').trim()
  // SACAR LITERALES SÓLO PUEDE DESCUBRIR UN NÚMERO, NUNCA TAPARLO. Si el dibujo ya se reconoce como
  // número sin mirar el patrón, se termina acá. Sin esta puerta, el patrón contable de Cobranzas
  // —`"$ "#,##0.00;[RED]"($ "#,##0.00\);\-`— convertía "($ 80.000,00)" en "80.000,00)": el paréntesis
  // que abre está entre comillas y el que cierra va escapado con `\`, así que la mitad se sacaba y la
  // otra quedaba, y cuatro importes negativos legítimos pasaban a reportarse como texto. Medido: 4
  // falsos positivos nuevos en Cobranzas con la versión sin esta línea.
  if (!esTextoDeVerdad(v)) return false
  const resto = sinLiteralesDelPatron(v, celda?.formato?.numberFormat?.pattern)
  // Y LO QUE QUEDA TIENE QUE TENER DÍGITOS: un patrón de número dibuja un NÚMERO. Sin esta condición,
  // las 243 celdas de Compras que dicen `$ -` —texto pegado desde un export contable, verificado con
  // `UNFORMATTED_VALUE`: adentro está la cadena "$ -", no un cero— quedaban en "-" al sacarle el "$"
  // del patrón, caían en la regla del guion (que es el cero DIBUJADO) y dejaban de reportarse. El
  // cero de ese patrón es "—" y sólo "—": ninguna de sus tres secciones puede producir "$ -".
  if (!/\d/.test(resto)) return true
  return esTextoDeVerdad(resto)
}

/**
 * NÚCLEO PURO: revisa una pestaña y devuelve los defectos de PANTALLA.
 *
 * @param {{filas:Array<Array<{valor:string, formato:object}>>, anchos:number[]}} f salida de readSheetFormats
 * @param {{desdeFila?:number, huecoMax?:number}} [opts]
 * @returns {Array<{tipo:string, fila:number, col:string, valor:string, que:string}>}
 */
/**
 * El separador que llevan todos los títulos de sección del archivo: "3 · NOTAS DE CRÉDITO".
 * Es la frontera DECLARADA entre dos bloques apilados sobre las mismas columnas.
 */
const TITULO_SECCION = /^\s*\d+\s*·\s*\S/

/**
 * NÚCLEO PURO: ¿este texto en una celda numérica es el ENCABEZADO de la columna?
 *
 * La diferencia con una nota mal puesta no está en la celda: está en dónde cae. Un encabezado va
 * ARRIBA de los números de su columna; una nota metida en una tabla los tiene arriba y abajo.
 *
 * Se mira la propia columna: si no hay ningún número por encima, esto es el rótulo. En cuanto hay
 * un importe más arriba, el texto está en el medio de los datos y ahí sí molesta.
 *
 * ═══ Y LA MIRADA NO CRUZA UN TÍTULO DE SECCIÓN (15/08) ═══
 *
 * "Tarjeta de Credito" apila cuatro cuadros sobre las mismas dos columnas, cada uno con su propia
 * fila "Concepto | Monto". Mirando la columna entera, los importes del cuadro de arriba convertían
 * el encabezado del cuadro de abajo en un defecto: `B12`, `B19` y `B26` —los tres la palabra
 * "Monto"— eran los TRES únicos avisos de esa pestaña, y los tres estaban bien puestos. Un detector
 * que sólo dice cosas falsas sobre una pestaña es peor que uno que no la mira: enseña a saltearla.
 *
 * La frontera es la misma que ya usa `fechaCerca` para lo suyo, y por la misma razón: en un layout
 * de bloques apilados, un título numerado no es decoración — declara que arriba empieza otra tabla.
 *
 * ═══ PERO EL TÍTULO NO ABSUELVE A UNA FILA DE DATOS ═══
 *
 * La primera versión frenaba en el título y devolvía "es un rótulo", y con eso tapó `OBRAS!F10`
 * ("▲ 17.449.303", un importe convertido en texto) sólo por ser la PRIMERA fila debajo de su título.
 * El encabezado de un cuadro es una fila de puros rótulos; en cuanto AL LADO hay un importe, una
 * fecha o un porcentaje, eso es una fila de datos y el texto está metido entre ellos.
 *
 * "AL LADO" ES EL TRAMO CONTIGUO DE CELDAS LLENAS, no la fila entera. La fila 4 de "Cobranzas"
 * tiene su encabezado en A:AA y —sesenta columnas más a la derecha, separada por un hueco— la
 * primera cifra del bloque de control en BD4. Mirando la fila completa, un número de OTRA tabla
 * convertía los 27 rótulos legítimos en defectos. Una columna vacía separa dos tablas puestas en la
 * misma fila, igual que un título separa dos tablas apiladas.
 *
 * @param {Array<Array<object>>} filas la grilla completa
 * @param {number} i índice de la fila (0-based)
 * @param {number} j índice de la columna
 */
export function esRotuloDeColumna(filas = [], i = 0, j = 0) {
  // "ES UN NÚMERO" SE DECIDE POR EL VALOR QUE SE VE, no por un campo `numero`: el lector de formatos
  // (readSheetFormats) devuelve sólo `valor` y `formato`. La primera versión preguntaba por `numero`,
  // que ahí siempre viene vacío, así que TODO parecía encabezado y el detector dejó de marcar hasta
  // las notas legítimas. Un control que se apaga entero es peor que uno ruidoso.
  for (let k = i - 1; k >= 0; k--) {
    // EL TÍTULO ABSUELVE SÓLO A SU PROPIO ENCABEZADO, y sólo si de verdad lo es. Si no, no frena
    // nada: se sigue mirando hacia arriba con el criterio de siempre.
    // EL TÍTULO ABSUELVE, NO CONDENA. Si la fila es de rótulos y cuelga del título, es el encabezado
    // del cuadro nuevo y se termina acá. Si no lo es, el título no dice nada: se sigue mirando la
    // columna con el criterio de siempre. Absolver de más apaga el control; condenar de más lo llena
    // de ruido, y en este archivo las dos formas de romperlo ya se pagaron.
    if (esTituloPelado(filas[k]) && i - k <= ZONA_ENCABEZADO && esFilaDeRotulos(filas[i], j)) return true
    const c = filas[k]?.[j]
    if (String(c?.valor ?? '').trim() && !esTextoEnCelda(c)) return false
  }
  return true
}

/**
 * Cuántas filas puede haber entre el título de una sección y la fila de rótulos de su cuadro.
 *
 * Es la gramática de layout del archivo, no un número cómodo: entre el título y el encabezado hay
 * como mucho UNA línea —el párrafo que explica el cuadro—. Medido: "Tarjeta de Credito" pone el
 * encabezado pegado al título (distancia 1) y "Proveedores" intercala su explicación (distancia 2).
 *
 * ACOTARLO ES LO QUE EVITA QUE LA EXCEPCIÓN SE COMA EL CONTROL. Sin este tope, un título absolvía
 * todo lo que tuviera debajo hasta el siguiente: `Proveedores!C200` —un comprobante en una celda de
 * moneda, dieciséis filas más abajo— dejaba de reportarse por tener su fila vacía al lado.
 */
const ZONA_ENCABEZADO = 2

/**
 * NÚCLEO PURO: ¿esta fila es un título de sección Y NADA MÁS?
 *
 * La distinción no es cosmética. Un título SOLO abre un cuadro nuevo: lo que viene abajo es su fila
 * de rótulos. Un título CON CIFRAS en la misma fila es la banda de encabezado de un cuadro que ya
 * trae su total —"2 · CUENTA CORRIENTE ... $281.227.326 · 105"— y ahí la fila de abajo no arranca de
 * cero: hereda una columna que YA tiene plata, que es justamente la evidencia con la que el detector
 * distingue un rótulo de una nota perdida.
 *
 * Sin esta condición, el título con total absolvía la fila de rótulos de la sección 2 de
 * "Proveedores" y apagaba el test que vigila que esa fila no se quede con el formato de moneda del
 * cuerpo. Una excepción que apaga un control existente no es una mejora: es una regresión con buena
 * letra.
 */
export function esTituloPelado(fila = []) {
  if (!TITULO_SECCION.test(String(fila?.[0]?.valor ?? ''))) return false
  return !(fila || []).some((c, k) => k > 0 && String(c?.valor ?? '').trim() !== '')
}

/**
 * NÚCLEO PURO: ¿el tramo contiguo de celdas llenas que contiene a `j` es una fila de RÓTULOS?
 *
 * Es lo que distingue el encabezado de un cuadro de su primera fila de datos. Dos condiciones:
 *
 *   · todo el tramo es texto — un importe al lado y ya es una fila de datos;
 *   · el tramo tiene MÁS DE UNA celda. Un encabezado rotula varias columnas a la vez ("Concepto |
 *     Monto"); una celda sola rodeada de vacío no rotula nada. Sin esta segunda condición se tapaba
 *     `Proveedores!C200` —un N° de comprobante en una celda de moneda, hermano de los cuatro que
 *     tiene encima— sólo porque era la única celda escrita de su fila.
 */
export function esFilaDeRotulos(fila = [], j = 0) {
  const f = fila || []
  const en = (k) => String(f?.[k]?.valor ?? '').trim()
  const esNumero = (k) => en(k) !== '' && !esTextoEnCelda(f?.[k])
  let llenas = 0
  for (let k = j; k >= 0 && en(k) !== ''; k--) { if (esNumero(k)) return false; llenas++ }
  for (let k = j + 1; k < f.length && en(k) !== ''; k++) { if (esNumero(k)) return false; llenas++ }
  return llenas > 1
}

export function detectar(f, { desdeFila = 1, huecoMax = 3 } = {}) {
  const out = []
  if (!f?.filas) return out
  const anchos = f.anchos || []
  const altos = f.altos || []
  const L = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

  // ¿Hay una celda con formato de FECHA cerca, en la misma columna?
  //
  // POR QUÉ "CERCA" Y NO "EN TODA LA COLUMNA": mirar la columna entera daba falsos positivos en las
  // pestañas que apilan varias tablas distintas sobre las mismas columnas —que son casi todas—. En
  // Proveedores y Materiales marcó "$54.358" de Ferretería y consumibles como si fuera una fecha,
  // porque veinte filas más abajo la misma columna E pertenece a otra tabla donde sí hay fechas.
  // La vecindad es lo que define una tabla en un layout de bloques apilados.
  //
  // Y UNA FILA DE ENCABEZADO DE MESES NO CUENTA. Casi todos los cuadros de este archivo tienen
  // arriba una fila con "ene feb mar…" que son fechas de verdad, con formato de fecha. Contándola,
  // TODAS las columnas de importes de ese cuadro pasaban a "tener fechas cerca" y cualquier importe
  // en el rango de seriales se marcaba: pasó con $54.043 en Recurrentes y $48.613 en Estructura, que
  // son gastos reales. Una fila con tres o más fechas es un encabezado de períodos, no datos.
  //
  // ═══ PERO UNA FILA DE DATOS CON VARIAS FECHAS NO ES UN ENCABEZADO (15/08) ═══
  //
  // "Tres o más fechas" solo, sin mirar el resto de la fila, apagó la señal entera en la columna
  // «Pagado el» de "Jornales por Quincena". Cada fila del registro tiene CUATRO columnas de fecha
  // —«Quincena», «Hasta», «Se paga el» y «Pagado el»— además de nueve de números y una de texto: por
  // el conteo pelado, las 12 filas del registro se declaraban "encabezado de períodos" y ninguna
  // aportaba su fecha. Con eso, los siete seriales que la columna N publica como `$46.160 · $46.176 ·
  // $46.189 · $46.204 · $46.220 · $46.237 · $46.143` —arriba de su propio encabezado, residuo de un
  // layout ocho filas más corto— no tenían contra qué compararse y NINGÚN control los veía.
  //
  // LA DIFERENCIA NO ES CUÁNTAS FECHAS HAY: ES SI LA FILA ES SÓLO FECHAS. Un encabezado de períodos
  // ("ene feb mar…") está hecho de fechas y a lo sumo un rótulo al costado; una fila de datos las
  // mezcla con importes, cantidades y estados. Que las fechas sean MAYORÍA de las celdas llenas
  // separa las dos sin contar filas ni suponer un layout.
  //
  // Y LA VECINDAD NO CRUZA UN TÍTULO DE SECCIÓN (05/08). La ventana de 15 filas se pensó para no
  // mirar la columna entera, pero sigue siendo una distancia: en "Proveedores" el pie de la sección 2
  // —"Comprado 2026", moneda en la columna C— y la fila de fechas de la sección 3 quedan a ocho filas,
  // así que $50.000 de un proveedor real se reportaba como "una fecha a la que se le escapó el
  // formato". Son dos TABLAS DISTINTAS que comparten la columna, no una columna inconsistente.
  // Un título de sección ("3 · NOTAS DE CRÉDITO") es la frontera declarada entre bloques apilados —
  // el mismo criterio con el que `finDeDinamica` decide dónde termina una tabla dinámica.
  const VENTANA = 15
  // ═══ LA FRONTERA ES `esTituloPelado`, LA MISMA QUE USA `esRotuloDeColumna` (15/08) ═══
  //
  // Estaba escrito el propósito —"la MISMA frontera"— con dos predicados distintos abajo: allá
  // `esTituloPelado` y acá el regex crudo. Y las dos copias ya se separaron: la fila 127 de "Jornales"
  // tiene el título «5 · OBRA — EL REGISTRO…» en la A y, en la MISMA fila, un serial huérfano en la N.
  // Por el regex eso es una frontera y cortaba la mirada justo arriba del residuo; por `esTituloPelado`
  // no lo es, y por la razón que ese predicado ya declara: un título con contenido al lado no abre un
  // cuadro nuevo, es la banda de uno que ya trae datos.
  const esTitulo = f.filas.map((fila) => esTituloPelado(fila))
  const conFecha = f.filas.map((fila) => {
    const cols = (fila || []).map((c, j) => ((c?.formato?.numberFormat?.type === 'DATE' || c?.formato?.numberFormat?.type === 'DATE_TIME') ? j : -1)).filter((j) => j >= 0)
    const llenas = (fila || []).filter((c) => String(c?.valor ?? '').trim() !== '').length
    const esEncabezadoDePeriodos = cols.length >= 3 && cols.length * 2 > llenas
    return new Set(esEncabezadoDePeriodos ? [] : cols)
  })
  const fechaCerca = (fila, col) => {
    for (let k = fila - 1; k >= Math.max(0, fila - VENTANA); k--) {
      if (esTitulo[k]) break
      if (conFecha[k].has(col)) return true
    }
    for (let k = fila; k <= Math.min(conFecha.length - 1, fila + VENTANA); k++) {
      if (k > fila && esTitulo[k]) break
      if (conFecha[k].has(col)) return true
    }
    return false
  }

  let vacias = 0, inicioHueco = 0
  f.filas.forEach((fila, i) => {
    const nFila = i + 1
    const tieneAlgo = (fila || []).some((c) => String(c?.valor ?? '').trim())

    // ── HUECOS: filas en blanco seguidas ────────────────────────────────────────────────────────
    // Son el colchón que se reserva para que un QUERY derrame. Reservar está bien; que se vean
    // veintinueve filas vacías en el medio de la pestaña, no.
    if (!tieneAlgo && nFila >= desdeFila) {
      if (!vacias) inicioHueco = nFila
      vacias++
    } else {
      if (vacias > huecoMax) {
        out.push({ tipo: 'hueco', fila: inicioHueco, col: '—', valor: `${vacias} filas`, que: `${vacias} filas en blanco seguidas (${inicioHueco} a ${inicioHueco + vacias - 1}): es colchón de derrame a la vista` })
      }
      vacias = 0
    }
    if (!tieneAlgo) return

    ;(fila || []).forEach((c, j) => {
      const v = String(c?.valor ?? '').trim()
      if (!v) return
      const nf = c?.formato?.numberFormat?.type
      const col = L(j)

      // ── LA FECHA CERO ───────────────────────────────────────────────────────────────────────
      // Un MINIFS o un MIN sin coincidencias devuelve 0, y 0 con formato de fecha es 30/12/1899.
      // Se lee como una fecha real y no lo es: significa "no hay ninguna".
      if (FECHA_CERO.test(v)) {
        out.push({ tipo: 'fecha_cero', fila: nFila, col, valor: v, que: 'es el serial 0 con formato de fecha: significa "no hay fecha", no un día de 1899' })
        return
      }

      // ── TEXTO EN UNA CELDA CON FORMATO DE NÚMERO ────────────────────────────────────────────
      // Una nota metida en una columna de importes. Se ve como si fuera un dato de la tabla.
      //
      // SALVO EN UNA FILA DE ENCABEZADO, y esta excepción es la diferencia entre un control que se
      // usa y uno que se ignora. "IMPORTES" arriba de una columna de moneda es lo correcto, no un
      // defecto: medido, 1.107 de los 1.182 avisos del archivo eran rótulos de columna. Un detector
      // que grita mil veces por cosas bien hechas entrena a no mirar la lista — ya pasó con los 688
      // falsos positivos del guion del cero contable.
      //
      // Una fila de encabezado se reconoce sin adivinar: TODAS sus celdas con contenido son texto.
      // En cuanto aparece un número, es una fila de datos y ahí sí el texto molesta.
      if (NUMERICO.has(nf) && esTextoEnCelda(c) && !esRotuloDeColumna(f.filas, i, j)) {
        out.push({ tipo: 'texto_en_numero', fila: nFila, col, valor: v.slice(0, 40), que: `texto en una celda con formato ${nf}` })
      }

      // ── UN PORCENTAJE FUERA DE ESCALA ───────────────────────────────────────────────────────
      // "2083%" es un ratio al que le pusieron formato de porcentaje sin dividirlo.
      if (nf === 'PERCENT') {
        const n = Number(String(v).replace(/[^\d,-]/g, '').replace(',', '.'))
        if (Number.isFinite(n) && Math.abs(n) > 1000) {
          out.push({ tipo: 'porcentaje_fuera_de_escala', fila: nFila, col, valor: v, que: 'un porcentaje de más de 1000% casi siempre es un ratio sin dividir' })
        }
      }

      // ── UN IMPORTE QUE EN REALIDAD ES UN SERIAL DE FECHA ────────────────────────────────────
      // Entre 40000 y 60000 sin decimales y con formato moneda cae en el rango de seriales de 2009
      // a 2064. Pero un importe REAL de ese tamaño existe y es común, así que sólo por el rango la
      // señal es puro ruido: marcaba veintitrés importes legítimos del cash flow.
      //
      // LO QUE LO VUELVE CONCLUYENTE: que la MISMA COLUMNA tenga además celdas con formato de fecha.
      // Una columna que mezcla fechas e importes en el rango de seriales es una columna de fechas a
      // la que se le escapó el formato — que es exactamente lo que pasó con "$46.198".
      if (nf === 'CURRENCY' && fechaCerca(i, j)) {
        const n = Number(String(v).replace(/[^\d,-]/g, '').replace(',', '.'))
        if (Number.isInteger(n) && n >= 40000 && n <= 60000) {
          out.push({ tipo: 'fecha_como_moneda', fila: nFila, col, valor: v, que: 'un entero en el rango de seriales de fecha, en una columna que en otras filas SÍ tiene formato de fecha' })
        }
      }

      // ── UN TEXTO QUE NO ENTRA EN SU CELDA ───────────────────────────────────────────────────
      //
      // POR QUÉ (21/07). El dueño, tres veces sobre la misma pestaña: "no se entiende una mierda".
      // Los totales estaban bien y no había defectos de formato: lo que pasaba es que los rótulos y
      // los orígenes eran más largos que su columna y se cortaban a mitad de palabra. Eso no lo ve
      // ningún control que suma NI el detector de formatos — hay que MEDIR el texto contra el ancho
      // de la columna, que es lo único que decide si algo se puede leer.
      //
      // Se marca sólo cuando el texto REALMENTE se corta: si la celda de al lado está vacía, Sheets
      // lo derrama y se lee perfecto. Un rótulo largo sobre columnas vacías no es un defecto.
      // EL ANCHO QUE DE VERDAD TIENE UNA CELDA no es el de su columna: es el que hay hasta la
      // próxima celda con contenido. Así funciona el derrame de Sheets y así funciona una celda
      // combinada. Midiendo sólo la columna propia, cada rótulo de bloque y cada párrafo de
      // introducción salía reportado — y son justamente los que mejor se leen, porque tienen media
      // pestaña vacía a la derecha.
      let anchoCol = anchos[j] ?? 0
      let vecinaOcupada = false
      for (let k = j + 1; k < Math.max(fila.length, anchos.length); k++) {
        if (String(fila?.[k]?.valor ?? '').trim() !== '') { vecinaOcupada = true; break }
        anchoCol += anchos[k] ?? 0
      }
      if (anchoCol && !NUMERICO.has(nf)) {
        const tam = c?.formato?.textFormat?.fontSize ?? 10
        const px = v.length * tam * 0.57
        const wrap = c?.formato?.wrapStrategy
        if (px > anchoCol) {
          if (wrap === 'WRAP') {
            const lineas = Math.ceil(px / anchoCol)
            const alto = altos[i] ?? 21
            const altoNecesario = lineas * (tam + 5)
            if (alto < altoNecesario) {
              // altoNecesario lo consume reparar-pantalla: es el alto exacto que borra este defecto,
              // el mismo umbral que se acaba de comparar, así que ponerlo lo deja al borde justo.
              out.push({ tipo: 'texto_apretado', fila: nFila, col, valor: v.slice(0, 40), altoNecesario, que: `necesita ${lineas} líneas y la fila mide ${alto}px: se ve la primera y el resto queda cortado abajo` })
            }
          } else if (vecinaOcupada || wrap === 'CLIP') {
            out.push({ tipo: 'texto_cortado', fila: nFila, col, valor: v.slice(0, 40), que: `${v.length} caracteres en una columna de ${anchoCol}px: entran ${Math.floor(anchoCol / (tam * 0.57))}` })
          }
        }
      }

      // ── UNA FECHA DIBUJADA COMO EL SERIAL PELADO ────────────────────────────────────────────
      // Ver `esSerialCrudo`: contenido de fecha con formato de texto. Es el defecto que dejó cuatro
      // encabezados de mes como "46260" en el Calendario de Cobros.
      if (esSerialCrudo(v, nf)) {
        out.push({ tipo: 'serial_crudo', fila: nFila, col, valor: v, que: 'un serial de fecha en una celda con formato TEXT: se dibuja el número, no el mes' })
      }

      // ── UN GLIFO QUE NO SE VA A VER ─────────────────────────────────────────────────────────
      // El ⚠ estaba EN la celda y no en la pantalla: el PDF no dibuja los caracteres emoji. Es el
      // peor lugar donde puede pasar, porque el glifo que se pierde es siempre el de la alerta.
      const ciegos = glifosInvisibles(v)
      if (ciegos.length) {
        out.push({ tipo: 'glifo_invisible', fila: nFila, col, valor: v.slice(0, 40), que: `${ciegos.join(' ')} no se dibuja al exportar: usá ALERTA de lib/glifos.mjs` })
      }

      // ── UN CUIT SIN FORMATEAR ───────────────────────────────────────────────────────────────
      if (/^\d{11}$/.test(v)) {
        out.push({ tipo: 'cuit_sin_formato', fila: nFila, col, valor: v, que: 'once dígitos seguidos: si es un CUIT va como 30-71063067-0' })
      }
    })
  })

  return out
}

/** NÚCLEO PURO: el resumen por tipo, para el log y para decidir qué arreglar primero. */
export function resumen(defectos = []) {
  const acc = new Map()
  for (const d of defectos) {
    const a = acc.get(d.tipo) ?? { tipo: d.tipo, n: 0, ejemplo: d }
    a.n++
    acc.set(d.tipo, a)
  }
  return [...acc.values()].sort((a, b) => b.n - a.n)
}
