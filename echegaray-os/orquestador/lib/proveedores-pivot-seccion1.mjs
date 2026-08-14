// LA SECCIÓN 1 DE PROVEEDORES COMO TABLA DINÁMICA NATIVA.
//
// ═══ POR QUÉ UNA DINÁMICA Y NO UNA FÓRMULA ═══
//
// El bloque de fórmulas anda, pero es del OS: si el generador no corre, no se actualiza. Una
// dinámica nativa la recalcula Google sola cada vez que cambia Compras — sin timer, sin script,
// sin que nadie tenga que acordarse. Ése era el pedido: "no se actualiza sola, y me deja huecos
// cuando se va uno que fue pagado".
//
// ═══ LO QUE LA DINÁMICA OBLIGA A CEDER, DICHO ANTES ═══
//
// **El importe queda a la derecha de todo.** En un pivot los valores van SIEMPRE después de los
// campos de fila; no hay forma de intercalarlos. Es una limitación de la API, no una decisión, y es
// la razón por la que el cuadro que abre la sección tiene UN solo valor: cada valor de más empuja
// una columna las que sí deciden (el vencimiento y la nota "Qué hacer").
//
// **Los rótulos son los de Compras.** Un campo de fila hereda el encabezado de su columna origen
// ("Fecha prevista de pago (día)"), y la API no permite renombrarlo. Sólo el valor acepta `name`.
// Eso es lo que hace que la columna A del cuadro que abre la sección diga "Proveedor" —el rótulo de
// Compras!E— y que `proveedores-plan-vivo.mjs`, que lo exige, vuelva a poder correr.
//
// **Una dinámica no calcula nada que no esté en su origen.** El vencimiento más próximo de un
// proveedor y su nota no pueden ser columnas del pivot: van a su derecha como fórmulas ancladas al
// NOMBRE que el pivot escribe. Ver `proveedores-cuadro-a.mjs`.
//
// ═══ LAS DOS TRAMPAS YA PAGADAS (ver deuda-viva-pivot.mjs) ═══
//
// 1. Una `filterCriteria.condition` sobre una columna de grid DESCARTA TODAS LAS FILAS sin avisar:
//    la dinámica aparece perfecta y vacía. Acá se filtra sólo por `visibleValues`, y los valores
//    van como TEXTO aunque la columna sea numérica: es la representación lo que el pivot compara.
// 2. `showTotals` en un nivel intermedio NO emite subtotales. Se apaga en todos los niveles: el
//    único total es el gran total del pie, que es el que se controla contra el titular.

import { MONEDA_CUERPO } from './formato-statement.mjs'

/** Las columnas de Compras por su offset dentro del source (que arranca en A). */
// `obra: 9` es "Cliente / Asignación" (J), que es donde vive LA ESTRELLA / MESSINA / San Francisco.
// NO es "Unidad de Negocio" (I, offset 8): esa columna dice "Civil" o "Estructura" — el rubro, no la
// obra. Escribir la dinámica con el offset 8 la dejó mostrando "Civil" trece veces seguidas.
export const COL = Object.freeze({
  categoria: 1, proveedor: 4, comprobante: 7, obra: 9, tipoPago: 15,
  proximoPago: 16, estado: 23, comercial: 35, saldo: 37,
})

/** El universo: lo que se debe. Estado "Pendiente" Y proveedor comercial. */
export const PENDIENTE = 'Pendiente'

/**
 * LOS CAMPOS DE FILA — Y POR QUÉ EL PRIMERO VUELVE A SER EL PROVEEDOR (14/08, segunda vuelta).
 *
 * ═══ EL EJE SE CAMBIÓ POR LA FECHA Y EL DUEÑO LO RECHAZÓ EL MISMO DÍA ═══
 *
 * A la mañana pidió *"saber exactamente a quiénes y cómo debo pagar un determinado día"* y el eje del
 * cuadro se movió del proveedor a la fecha de pago. A la tarde, textual:
 *
 *   *"roto proveedores, esta verga asi no sirve para nada, LA BASE SIEMPRE ES EL NOMBRE DEL
 *    PROVEEDOR, ademas de q tomaba mal columnas de compras … rehacer"*
 *
 * El error de razonamiento fue tratar dos pedidos como excluyentes. No lo son: el corte por día es
 * una VISTA de la deuda, y la deuda es de un proveedor. Cambiar el eje mató tres cosas de una:
 *
 *   1. el ranking "a quién le debo más" desapareció de la pestaña;
 *   2. las doce notas del dueño perdieron su ancla —vivían al lado de un NOMBRE, en la columna D—
 *      y se borraron sin que nada avisara;
 *   3. `proveedores-plan-vivo.mjs`, que exige "Proveedor" en la columna A, dejó de poder correr.
 *
 * ═══ CÓMO CONVIVEN LOS DOS PEDIDOS ═══
 *
 *   cuadro A · A QUIÉN SE LE DEBE  — una línea POR PROVEEDOR, ordenada por lo que se le debe.
 *                                    Es el que abre la sección: el eje, con su vencimiento más
 *                                    próximo y su nota "Qué hacer" al lado (ver proveedores-cuadro-a).
 *   cuadro B · CADA OPERACIÓN      — el detalle, agrupado por DÍA DE PAGO: qué sale cada día, a
 *                                    quién, por qué comprobante y con qué medio. Ahí vive el corte
 *                                    por día que el dueño pidió, sin desalojar al proveedor del eje.
 *
 * `showTotals: false` en TODOS los niveles: la API no emite el subtotal de un nivel externo (trampa
 * 2, medida contra el archivo real). Pedirlo no da error — no hace nada.
 */
export function camposDeFila({ vista = VISTA.POR_PROVEEDOR } = {}) {
  // UNA LÍNEA POR PROVEEDOR, ORDENADA POR LO QUE SE LE DEBE. El `valueBucket` es lo que hace el
  // ranking: sin él Sheets ordena alfabéticamente y "a quién le debo más" hay que buscarlo a ojo.
  if (vista === VISTA.POR_PROVEEDOR) {
    return [{ sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } }]
  }
  // ═══ EL DETALLE ABRE POR EL DÍA, Y ES DONDE ESO CORRESPONDE ═══
  //
  // "Categoría" no está: "B"/"N" no contesta a quién, cuánto ni cómo se paga, y medida contra Compras
  // va pegada al medio de pago (efectivo→N, resto→B). Repite lo que la columna de al lado ya dice.
  //
  // El orden respeta el ancho de cada columna, que es de la pestaña entera y no de este cuadro: la
  // obra cae en la D (300px), el tipo de pago en la E (90px, medida para "Tarjeta Crédito") y el
  // importe en la F (210px). Ver ANCHOS_PROVEEDORES.
  return [
    { sourceColumnOffset: COL.proximoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.comprobante, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.obra, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.tipoPago, showTotals: false, sortOrder: 'ASCENDING' },
  ]
}

/** La columna del PROVEEDOR dentro del cuadro de detalle. */
export function colProveedorDetalle() {
  return camposDeFila({ vista: VISTA.DETALLE }).findIndex((r) => r.sourceColumnOffset === COL.proveedor)
}

/**
 * Las formas del cuadro. `POR_PROVEEDOR` es la que ABRE la sección —el eje— y `DETALLE` la que la
 * cierra, agrupada por día de pago.
 *
 * NO HAY VISTA "POR DÍA" y es a propósito: existió doce horas, desalojó al proveedor del eje y el
 * dueño la rechazó. El total por día lo dan el aging del encabezado (vencido · esta semana · 8-30 ·
 * 31-60 · +60) y el agrupamiento del cuadro de detalle. Un cuadro más para el mismo dato es lo que
 * la regla de minimalismo de la pestaña prohíbe.
 */
export const VISTA = Object.freeze({ DETALLE: 'detalle', POR_PROVEEDOR: 'por-proveedor' })

/**
 * ¿CUÁNTAS CELDAS VAN A QUEDAR SIN RÓTULO, Y DE QUIÉN?
 *
 * El dueño reportó "faltan proveedores" cuando lo que había eran rótulos agrupados. Que el número
 * salga impreso ANTES de escribir es la diferencia entre una limitación declarada y una sorpresa.
 *
 * @param {Array<Array<any>>} filas  las filas de Compras que entran a la dinámica
 * @returns {Array<{proveedor:string, filas:number, sinRotulo:number}>} sólo los que repiten
 */
export function proveedoresQueAgrupan(filas = []) {
  const cuenta = new Map()
  for (const f of filas) {
    const p = String(f?.[COL.proveedor] ?? '').trim()
    if (p) cuenta.set(p, (cuenta.get(p) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .filter(([, n]) => n > 1)
    .map(([proveedor, n]) => ({ proveedor, filas: n, sinRotulo: n - 1 }))
    .sort((a, b) => b.sinRotulo - a.sinRotulo)
}

/**
 * LOS DÍAS DE PAGO DISTINTOS QUE VA A AGRUPAR EL CUADRO DE DETALLE — y cuáles NO son un día.
 *
 * El pivot agrupa por el VALOR CRUDO de la columna "Fecha prevista de pago (día)". Todo lo que no
 * sea un número de serie arma su propio grupo igual: hay filas de Compras con la palabra "Pendiente"
 * ahí, y esas van a salir rotuladas "Pendiente" en la columna de la fecha. No se ocultan —esconder
 * una deuda porque tiene mal la fecha es cómo se pierde un pago— pero el script tiene que poder
 * decirlo antes de escribir.
 *
 * Contar bien importa por una razón concreta: `bandasDeFormato` reserva el alto del cuadro A con
 * este número, y una fila de menos deja la última línea con el formato que la celda tenía antes.
 *
 * @param {Array<Array<any>>} filas  las filas de Compras que entran a la dinámica
 * @returns {{dias:number, sinFecha:Array<{valor:string, filas:number, saldo:number}>}}
 */
export function diasDePago(filas = []) {
  const grupos = new Map()
  for (const f of filas) {
    const bruto = (f ?? [])[COL.proximoPago]
    const clave = typeof bruto === 'number' ? `n:${bruto}` : `t:${String(bruto ?? '').trim()}`
    const g = grupos.get(clave) ?? { valor: typeof bruto === 'number' ? '' : String(bruto ?? '').trim(), esFecha: typeof bruto === 'number', filas: 0, saldo: 0 }
    g.filas += 1
    g.saldo += Number((f ?? [])[COL.saldo]) || 0
    grupos.set(clave, g)
  }
  const todos = [...grupos.values()]
  return {
    dias: todos.length,
    sinFecha: todos.filter((g) => !g.esFecha)
      .map(({ valor, filas: n, saldo }) => ({ valor: valor === '' ? '(vacío)' : valor, filas: n, saldo })),
  }
}

/**
 * LAS DEUDAS QUE ENTRARÍAN CON EL RÓTULO EN BLANCO.
 *
 * Los filtros del pivot son estado y comercial: NO exigen nombre de proveedor. Una compra pendiente
 * cuyo proveedor esté vacío en Compras entra igual —la plata no se pierde, y eso está bien— pero
 * arma un grupo sin nombre: un agujero en la columna A, que es justo lo que el cuadro no puede
 * tener. Hoy no hay ninguna; el día que aparezca, el script lo grita antes de escribir.
 *
 * OJO con lo que NO es esto: una factura sin NÚMERO DE COMPROBANTE (hoy, La Isla Metal SRL con
 * $100.000) tiene que entrar y entra. Lo que rompe el cuadro es la falta de NOMBRE, no de número.
 *
 * @param {Array<Array<any>>} filas  las filas de Compras que entran a la dinámica
 * @returns {Array<{comprobante:string, saldo:number}>}
 */
export function deudaSinNombre(filas = []) {
  return filas
    .filter((f) => String(f?.[COL.proveedor] ?? '').trim() === '')
    .map((f) => ({ comprobante: String(f?.[COL.comprobante] ?? '').trim() || '(sin número)', saldo: Number(f?.[COL.saldo]) || 0 }))
}

/** Los filtros. NUNCA por `condition`: ver la trampa 1. */
export function filtros() {
  return [
    { columnOffsetIndex: COL.estado, filterCriteria: { visibleValues: [PENDIENTE] } },
    { columnOffsetIndex: COL.comercial, filterCriteria: { visibleValues: ['1'] } },
  ]
}

/**
 * EL ORIGEN DE LA DINÁMICA — Y POR QUÉ LLEGA HASTA EL FINAL DE LA GRILLA.
 *
 * `filas` tiene que ser el `rowCount` de la PESTAÑA Compras, no la última fila con datos. Si se
 * corta en la última factura cargada, la compra que se cargue mañana cae FUERA del origen y la
 * dinámica no la ve nunca: deja de ser viva sin dar un solo error. Es el defecto que el cuadro
 * viejo tenía de otra forma (referencias a filas fijas) y que este cuadro existe para no repetir.
 *
 * `startRowIndex: 2` es la fila 3, donde están los rótulos: el pivot la usa como encabezado.
 * Arrancar en la 4 le haría tomar la primera factura como nombre de columna.
 */
export function fuenteCompras({ sheetId, filas }) {
  if (!Number.isInteger(sheetId)) throw new Error('fuenteCompras: falta el sheetId de Compras')
  if (!(filas > 3)) throw new Error(`fuenteCompras: la grilla de Compras no puede tener ${filas} filas`)
  return { sheetId, startRowIndex: 2, endRowIndex: filas, startColumnIndex: 0, endColumnIndex: 38 }
}

/**
 * LOS VALORES — UNO SOLO, Y POR QUÉ SE FUE "FACTURAS".
 *
 * Un valor de pivot es siempre una agregación numérica y va SIEMPRE a la derecha de los campos de
 * fila: cada valor que se agrega empuja una columna más las que vienen después. En el cuadro que
 * abre la sección eso importa, porque a su derecha van las dos columnas que sí deciden —el
 * vencimiento más próximo y la nota "Qué hacer"— y la pestaña sólo tiene siete columnas antes de la
 * H, que es del dueño.
 *
 * El criterio de corte es el del área: ¿qué decisión cambia si este número cambia? "Facturas" (el
 * conteo por proveedor) no cambia ninguna —el cuadro de detalle de abajo las lista una por una— así
 * que se va. El vencimiento sí: decide a quién se le paga primero.
 *
 * El SUM no puede quedar vacío nunca: un grupo existe porque tiene al menos una fila.
 */
export function valoresDelPivot({ vista = VISTA.POR_PROVEEDOR, nombres = ['Se le debe'] } = {}) {
  // En el DETALLE el rótulo del importe es otro: ahí una línea es una factura, no un proveedor.
  if (vista === VISTA.DETALLE) return [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Importe' }]
  return [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: nombres[0] }]
}

/**
 * La dinámica entera, lista para `updateCells`. Es la ÚNICA forma de armar un pivot de esta sección:
 * el script no vuelve a declararlo, porque los formatos calculan la posición de cada columna desde
 * `camposDeFila` y dos declaraciones que se separan dejan el formato una columna corrido.
 */
export function pivotSeccion1(fuente, { vista = VISTA.POR_PROVEEDOR, nombres } = {}) {
  return {
    source: fuente,
    rows: camposDeFila({ vista }),
    values: valoresDelPivot(nombres ? { vista, nombres } : { vista }),
    filterSpecs: filtros(),
    valueLayout: 'HORIZONTAL',
  }
}

/**
 * ¿QUEDÓ ALGUNA CELDA VACÍA EN EL BLOQUE ESCRITO?
 *
 * El dueño reportó agujeros tres veces. Que el script los cuente RELEYENDO el archivo —y falle si
 * hay uno— es la diferencia entre "creo que quedó bien" y evidencia del efecto.
 *
 * @param {Array<Array<any>>} filas  el bloque leído del archivo (encabezado incluido)
 * @param {number} ancho             las columnas que ocupa la dinámica
 * @returns {string[]} las direcciones relativas vacías, p.ej. ["fila 3 · columna A"]
 */
export function celdasVacias(filas = [], ancho = 0, filaAncla = 1) {
  const huecos = []
  filas.forEach((f, i) => {
    const llenas = (f ?? []).slice(0, ancho).filter((c) => String(c ?? '').trim() !== '').length
    if (llenas === 0) return // fila entera vacía = abajo del bloque, no es un agujero
    for (let c = 0; c < ancho; c++) {
      if (String((f ?? [])[c] ?? '').trim() === '') huecos.push(`${String.fromCharCode(65 + c)}${filaAncla + i}`)
    }
  })
  return huecos
}

/**
 * ¿Este pivot tiene algún filtro por condición? Existe para que la trampa 1 tenga un test: si
 * alguien vuelve a poner un `NUMBER_GREATER`, la suite se pone roja ANTES de que la dinámica
 * aparezca vacía en el archivo.
 *
 * @returns {string[]} las columnas filtradas por condición (vacío = está bien)
 */
export function filtrosPorCondicion(pivot = {}) {
  return (pivot?.filterSpecs ?? [])
    .filter((f) => f?.filterCriteria?.condition)
    .map((f) => String(f.columnOffsetIndex))
}

/**
 * ¿VUELVEN LAS CELDAS VACÍAS?
 *
 * El primer nivel del pivot sólo escribe su rótulo una vez por grupo. Que ninguna fila quede sin
 * nombre depende de que ese primer campo sea ÚNICO. Si dos facturas comparten comprobante —o si dos
 * lo tienen vacío— vuelven a agruparse y reaparecen los blancos que el dueño reportó.
 *
 * No es hipotético: hoy hay una factura sin número (La Isla Metal SRL). Con una sola no se agrupa
 * nada; con dos, sí. Por eso se avisa ANTES de escribir en vez de descubrirlo mirando la pantalla.
 *
 * @param {Array<Array<any>>} filas  las filas de Compras que entran a la dinámica
 * @returns {Array<{clave:string, veces:number}>} los comprobantes repetidos (vacío = está bien)
 */
export function clavesRepetidas(filas = []) {
  const cuenta = new Map()
  for (const f of filas) {
    const k = String(f?.[COL.comprobante] ?? '').trim()
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .filter(([, n]) => n > 1)
    .map(([clave, veces]) => ({ clave: clave === '' ? '(sin número)' : clave, veces }))
}

/** ¿Algún nivel pide subtotales que la API no emite? Test de la trampa 2. */
export function nivelesConSubtotal(pivot = {}) {
  return (pivot?.rows ?? []).filter((r) => r?.showTotals === true).map((r) => String(r.sourceColumnOffset))
}

/**
 * EL FORMATO DE LA COLUMNA DEL IMPORTE.
 *
 * Una dinámica no hereda el formato de la columna origen: el saldo sale como `2014940,07` pelado.
 * En una pestaña de plata eso no es un detalle estético — es un número que no se puede leer de un
 * vistazo ni comparar contra el de al lado.
 *
 * @param {{sheetId:number, filaAncla:number, alto:number, ancho:number}} o  filas en base 1
 */
export function columnaDeLaDeuda({ vista = VISTA.POR_PROVEEDOR } = {}) {
  // La deuda es el PRIMER valor, no el último. Hoy los dos cuadros tienen un valor solo, pero el día
  // que alguien agregue otro, `ancho - 1` formatearía al nuevo como pesos y dejaría la deuda pelada —
  // y peor, haría que el control de arriba sume la columna equivocada.
  return camposDeFila({ vista }).length
}

/** La letra de la columna de la deuda, para el control. Calculada, nunca tipeada. */
export function letraDeLaDeuda({ vista = VISTA.POR_PROVEEDOR } = {}) {
  return String.fromCharCode(65 + columnaDeLaDeuda({ vista }))
}

export function formatoDelImporte({ sheetId, filaAncla, alto, vista = VISTA.POR_PROVEEDOR }) {
  const columna = columnaDeLaDeuda({ vista })
  return formatoDeColumna({
    sheetId, filaAncla, alto, columna,
    numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT',
  })
}

/**
 * EL FORMATO DE LA COLUMNA DE LA FECHA.
 *
 * Misma historia que el importe, y peor de leer: la fecha cayó en una columna que antes tenía el
 * comprobante —formato de texto— y salió como `46238`, el número de serie crudo. Un número de cinco
 * cifras donde va una fecha no se lee mal: no se lee.
 *
 * La posición se CALCULA de `camposDeFila()`, no se tipea: si mañana cambia el orden, el formato
 * sigue al campo en vez de quedarse apuntando a la columna de al lado.
 */
export function formatoDeLaFecha({ sheetId, filaAncla, alto, vista = VISTA.DETALLE }) {
  const columna = camposDeFila({ vista }).findIndex((r) => r.sourceColumnOffset === COL.proximoPago)
  // En la vista por proveedor no hay columna de fecha: no hay nada que formatear, y pedirlo con
  // índice -1 formatearía la columna anterior. Devuelve null y el script lo saltea.
  if (columna < 0) return null
  return formatoDeColumna({
    sheetId, filaAncla, alto, columna,
    numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'RIGHT',
  })
}

/**
 * EL FORMATO DE TODAS LAS COLUMNAS DEL BLOQUE, DE UNA.
 *
 * Una dinámica no trae formato: usa el que la celda ya tenía. Después de tres reescrituras seguidas,
 * la columna del comprobante conservaba el formato de fecha de la vuelta anterior y "826666" se veía
 * como `01/05/4163`. Cada columna se declara explícitamente en cada corrida — el formato es del
 * archivo, no del dato, y nunca vuelve solo a "automático".
 */
export function formatoDeTodo({ sheetId, filaAncla, alto, vista = VISTA.POR_PROVEEDOR }) {
  const campos = camposDeFila({ vista })
  const iFecha = campos.findIndex((r) => r.sourceColumnOffset === COL.proximoPago)
  const ancho = campos.length + valoresDelPivot({ vista }).length
  const pedidos = []
  for (let c = 0; c < campos.length; c++) {
    pedidos.push(formatoDeColumna({
      sheetId, filaAncla, alto, columna: c,
      numberFormat: c === iFecha ? { type: 'DATE', pattern: 'dd/mm/yyyy' } : { type: 'TEXT', pattern: '@' },
      horizontalAlignment: c === iFecha ? 'RIGHT' : 'LEFT',
    }))
  }
  // EL "$" NO VA EN EL CUERPO. Estas dos dinámicas no emiten fila de total (el `showTotals: false`
  // del nivel externo también apaga el gran total del pie, medido contra el archivo), así que el
  // único "$" de la sección es el del titular de arriba — que es exactamente donde tiene que estar.
  // El cero sale en raya y el negativo entre paréntesis: ver `lib/formato-statement.mjs`.
  //
  // Un solo `push` y no un bucle sobre los valores: los dos cuadros tienen UN valor y es plata. El
  // día que aparezca un segundo valor que no sea plata, esto tiene que fallar en el test —no
  // formatear el nuevo como pesos en silencio—, y por eso la guarda de abajo grita en vez de adivinar.
  pedidos.push(formatoDeColumna({
    sheetId, filaAncla, alto, columna: campos.length,
    numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT',
  }))
  if (ancho > campos.length + 1) {
    throw new Error(`formatoDeTodo: la vista "${vista}" tiene ${ancho - campos.length} valores y sólo`
      + ' sé formatear uno (plata). Declaralo acá antes de agregarlo al pivot.')
  }
  return pedidos
}

/**
 * LOS RÓTULOS QUE VA A ESCRIBIR LA DINÁMICA, ANTES DE QUE LOS ESCRIBA.
 *
 * Un campo de fila hereda el encabezado de su columna en Compras y la API no deja renombrarlo; sólo
 * los `values` aceptan `name`. Saberlos de antemano es lo que permite darle a la fila de rótulos el
 * alto que necesita para que "Fecha prevista de pago (día)" no salga cortado — sin tocar Compras,
 * que es fuente y no se edita.
 *
 * @param {{vista?:string, cabecera?:any[], nombresDeValores?:string[]}} o  la fila 3 de Compras
 * @returns {string[]} un rótulo por columna, en el orden en que la dinámica los emite
 */
export function rotulosDelCuadro({ vista = VISTA.POR_PROVEEDOR, cabecera = [], nombresDeValores = [] } = {}) {
  const campos = camposDeFila({ vista }).map((r) => String(cabecera[r.sourceColumnOffset] ?? '').trim())
  const valores = valoresDelPivot({ vista }).map((v, i) => String(nombresDeValores[i] ?? v.name ?? '').trim())
  return [...campos, ...valores]
}

/** El pedido de formato de UNA columna del bloque, desde la fila siguiente al rótulo. */
function formatoDeColumna({ sheetId, filaAncla, alto, columna, numberFormat, horizontalAlignment }) {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: filaAncla, // la fila DESPUÉS del rótulo
        endRowIndex: filaAncla + alto,
        startColumnIndex: columna,
        endColumnIndex: columna + 1,
      },
      cell: { userEnteredFormat: { numberFormat, horizontalAlignment } },
      fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    },
  }
}

/**
 * EL FOOTPRINT DE LOS DOS CUADROS — Y POR QUÉ EL FORMATO NO SE MIDE POR LA CORRIDA.
 *
 * El alto de una dinámica es una ESTIMACIÓN hecha antes de escribir: el script cuenta proveedores
 * distintos con `trim()`, el pivot agrupa por el valor crudo, y el pie agrega su propia fila. Cuando
 * la dinámica emite UNA fila más que la estimada, esa fila cae fuera del `repeatCell` y se queda con
 * el formato que la celda ya tenía. Pasó el 04/08/2026: el cuadro A creció de 9 a 10 proveedores y
 * la última fila salió `67797,51 | 31/12/1899` — el importe pelado y el contador con el formato de
 * FECHA que el cuadro B había dejado en la columna C. Ni un error: el formato es del archivo.
 *
 * Por eso el rango se calcula del FOOTPRINT —lo que el generador se adjudica entre sus rótulos y la
 * sección 2— y no del alto de la corrida. Las dos bandas TESELAN el bloque: A desde su rótulo hasta
 * el rótulo de B, B desde ahí hasta el final del colchón. Una fila de más formateada y vacía no se
 * ve; una de menos rompe en silencio. Filas en base 1 a la entrada; `desde` en base 0.
 *
 * `gruposA` es la cantidad de LÍNEAS que va a emitir el cuadro que abre la sección: hoy, PROVEEDORES
 * distintos con deuda. El nombre es genérico a propósito — cuando el eje se movió a la fecha y volvió,
 * lo único que cambió fue quién lo calcula. Un parámetro que dice "proveedores" y transporta días es
 * cómo el formato termina apuntado a la fila de al lado (pasó: `67797,51 | 31/12/1899`).
 *
 * @param {{filaEncabezado:number, filaLimite:number, gruposA:number, facturas:number}} o
 */
export function bandasDeFormato({ filaEncabezado, filaLimite, gruposA, facturas }) {
  const iA = filaEncabezado - 1        // el rótulo del cuadro A
  const altoA = 1 + gruposA            // rótulo + una línea por día de pago
  const iSub = iA + altoA + 1          // una fila de aire y después el subtítulo del cuadro B
  const iB = iSub + 1                  // el rótulo del cuadro B
  const altoB = 1 + facturas + 1       // rótulo + una línea por factura + la suma total
  const finIdx = filaLimite - 1        // la fila del título de la sección 2: ahí no se entra
  return {
    iA, altoA, iSub, iB, altoB, finIdx,
    necesita: altoA + 1 + 1 + altoB,
    disponibles: filaLimite - filaEncabezado,
    bandaA: { desde: iA, alto: iB - iA },
    // Si el bloque todavía no entra, la banda de B sale en 0: el script inserta filas y recalcula.
    bandaB: { desde: iB, alto: Math.max(finIdx - iB, 0) },
    // ═══ EL CUERPO EMPIEZA DEBAJO DEL RÓTULO (05/08) ═══
    //
    // La banda es el FOOTPRINT del cuadro —rótulo incluido— y se usaba tal cual para formatear el
    // cuerpo: la celda que dice "Se le debe" quedaba declarada moneda y la que dice "Facturas",
    // contador. El auditor los reportaba como `texto_en_numero` (B17, C17, G32) en cada corrida, y
    // el generador los volvía a producir. El rótulo tiene su propio formato: ver lib/proveedores-rotulos.mjs.
    rotuloA: iA + 1,                                              // base 1, para el formato del rótulo
    rotuloB: iB + 1,
    cuerpoA: { desde: iA + 1, alto: Math.max(iB - iA - 1, 0) },   // base 0, la fila siguiente al rótulo
    cuerpoB: { desde: iB + 1, alto: Math.max(finIdx - iB - 1, 0) },
  }
}

/**
 * CUÁNTAS FILAS ESCRIBIÓ DE VERDAD EL CUADRO, releyendo el archivo. La banda de formato tolera que
 * la dinámica emita de más, pero la POSICIÓN del cuadro B sigue saliendo de la estimación: si la
 * deriva crece, el subtítulo cae dentro del cuadro A y Google se niega a renderizar.
 *
 * @param {Array<Array<any>>} filas  el bloque leído desde el rótulo del cuadro
 * @returns {number} filas hasta la primera en blanco (rótulo incluido)
 */
export function altoEmitido(filas = []) {
  const vacia = (f) => (f ?? []).every((c) => String(c ?? '').trim() === '')
  const i = filas.findIndex(vacia)
  return i < 0 ? filas.length : i
}

/**
 * DÓNDE EMPIEZA Y DÓNDE TERMINA LA SECCIÓN 1 — anclado al texto, nunca a un número de fila.
 *
 * No se usa `geometriaSeccion1` de `proveedores-bloque-vivo.mjs` porque aquélla exige que la fila de
 * rótulos diga "Proveedor" EN LA COLUMNA A. Con la dinámica, la A pasó a ser el comprobante y la
 * detección dejaba de encontrar su propio resultado: el script no podía correr dos veces seguidas.
 *
 * Acá el rótulo se busca EN CUALQUIER COLUMNA de la fila, así sirve para las dos formas —el bloque
 * de fórmulas viejo y la dinámica— y sobrevive a que mañana cambie el orden de los campos.
 *
 * @param {Array<Array<any>>} filas  la pestaña leída con FORMATTED_VALUE (una dinámica no tiene fórmulas)
 * @returns {{filaEncabezado:number, filaLimite:number, encabezados:string[]}} filas en base 1
 */
export function geometriaDeLaSeccion(filas = []) {
  const txt = (v) => String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const colA = (i) => txt((filas[i] ?? [])[0])
  const iTitulo = filas.findIndex((_, i) => /^1\s*[·.\-]/.test(colA(i)) && /QUE SE DEBE/.test(colA(i)))
  if (iTitulo < 0) throw new Error('no encontré el título "1 · QUÉ SE DEBE Y CUÁNDO": la pestaña cambió de forma, no hay plan')
  const iLimite = filas.findIndex((_, i) => i > iTitulo && /^2\s*[·.\-]/.test(colA(i)))
  if (iLimite < 0) throw new Error('no encontré el título de la sección 2: sin límite no puedo reservar filas sin pisar lo de abajo')
  // La PRIMERA fila de rótulos después del título, con AL MENOS DOS columnas.
  //
  // Exigía cuatro. El cuadro de totales por proveedor tiene tres (proveedor · se le debe · facturas),
  // así que la geometría se lo salteaba y enganchaba el rótulo del cuadro de detalle: cada corrida
  // creía que la sección arrancaba más abajo, no limpiaba lo de arriba y DUPLICABA el cuadro.
  //
  // DESDE EL 14/08 EL CUADRO A NO DICE "PROVEEDOR": su primer campo es la fecha de pago. Buscando
  // sólo esa palabra, la fila que aparece primero es la del cuadro B —que sí la tiene, en la B— y
  // el aviso de abajo saldría prendido en cada corrida diciendo una posición equivocada. Se
  // reconoce también por el rótulo de la fecha, que es el que abre el cuadro A.
  const ES_ROTULO = /PROVEEDOR|FECHA PREVISTA DE PAGO/
  const iCab = filas.findIndex((_, i) => i > iTitulo && i < iLimite
    && (filas[i] ?? []).some((c) => ES_ROTULO.test(txt(c)))
    && (filas[i] ?? []).filter((c) => String(c ?? '').trim()).length >= 2)

  // ═══ EL ANCLA SALE DEL TÍTULO, NUNCA DE LA SALIDA ANTERIOR ═══
  //
  // Buscar la fila de rótulos es buscar la SALIDA DE LA CORRIDA ANTERIOR. Mientras esa salida esté
  // sana funciona; el día que el cuadro da #REF! —una sola celda, no dos— la búsqueda no lo
  // reconoce, se engancha en el rótulo del cuadro de ABAJO y escribe un segundo cuadro sin borrar
  // el primero. Los dos se pisan y los dos mueren. Pasó de verdad: quedaron TRES dinámicas donde
  // tenía que haber dos, y la de arriba en #REF!.
  //
  // El título de la sección y el de la siguiente son los únicos anclajes que no dependen de que
  // ayer haya salido todo bien. El contrato de la pestaña es: título · aire · aviso · rótulos.
  // La búsqueda se conserva sólo para AVISAR cuando lo que hay no está donde debería.
  const iAncla = iTitulo + AVISO + 1
  if (iAncla >= iLimite) throw new Error('el ancla de la sección 1 cae dentro de la sección 2: no escribo')
  return {
    filaEncabezado: iAncla + 1,
    filaLimite: iLimite + 1,
    porTitulo: iCab !== iAncla,
    encabezados: (filas[iAncla] ?? []).map((c) => String(c ?? '').trim()),
  }
}

/**
 * Filas entre el título de la sección 1 y su fila de rótulos: una en blanco y la del control.
 * Es el contrato de la pestaña: título · aire · aviso · rótulos.
 */
export const AVISO = 2

/**
 * REAPUNTA EL CONTROL A LA COLUMNA DONDE QUEDÓ EL IMPORTE.
 *
 * El control de arriba del bloque compara el detalle contra el titular sumando la columna del
 * importe. Con el bloque de fórmulas eso era `SUM($D$18:$D$37)`. Con la dinámica el importe se fue
 * a la G y la D pasó a ser la obra —texto, que suma 0—, así que el control gritaba que faltaba el
 * total entero. No estaba roto: estaba mirando la columna equivocada, que es peor, porque un
 * control que mira mal no avisa de menos, avisa cualquier cosa.
 *
 * Se toca ÚNICAMENTE el `SUM($X$n:$X$m)` del bloque propio. Todo lo demás de la fórmula —los
 * SUMIFS contra Compras, el texto del mensaje— queda intacto: no se reescribe lo que no cambió.
 *
 * @param {string} formula   la fórmula actual del control
 * @param {string} columna   la letra donde quedó el importe ("G")
 * @param {{filaEncabezado:number, filaLimite:number}} geo
 * @returns {string} la fórmula reapuntada (idéntica si ya apuntaba bien)
 */
export function reapuntarControl(formula, columna, { filaEncabezado, filaLimite } = {}) {
  const f = String(formula ?? '')
  if (!f) return f
  const desde = filaEncabezado + 1
  const hasta = filaLimite - 1
  // El SUM del bloque propio es el único con dos referencias absolutas a la MISMA columna.
  //
  // El reemplazo va como FUNCIÓN, no como plantilla: en un string de reemplazo `$18` no es
  // "peso dieciocho", es el grupo de captura 1 seguido de un 8. Con plantilla salía `SUM($GG8:$G377)`
  // — una fórmula que Sheets acepta sin chistar y que suma cualquier otra cosa.
  return f.replace(/SUM\(\$([A-Z]{1,3})\$(\d+):\$\1\$(\d+)\)/g,
    () => `SUM($${columna}$${desde}:$${columna}$${hasta})`.replace(/\$\$/g, '$'))
}

/** El ancho que ocupa la dinámica: un campo de fila por columna, más la del valor. */
export function anchoDelPivot(pivot = {}) {
  return (pivot?.rows?.length ?? 0) + (pivot?.values?.length ?? 0)
}

/**
 * ¿ENTRA LA DINÁMICA SIN PISAR LO DE ABAJO?
 *
 * Una dinámica que no entra NO borra la sección 2: Google se niega a renderizarla y deja el error
 * "La tabla dinámica sobrescribiría datos" en la celda ancla. Falla cerrado, que es lo correcto —
 * pero deja la sección 1 invisible, así que se avisa ANTES de escribir en vez de descubrirlo mirando.
 *
 * Alto = 1 fila de encabezado + una por factura + 1 de gran total.
 *
 * @param {{facturas:number, filaAncla:number, filaLimite:number}} o  filas en base 1
 */
export function cabeEnElHueco({ facturas, filaAncla, filaLimite }) {
  const alto = 1 + facturas + 1
  const disponible = filaLimite - filaAncla
  return {
    alto,
    disponible,
    cabe: alto <= disponible,
    holgura: disponible - alto,
    motivo: alto <= disponible ? null
      : `la dinámica necesita ${alto} filas y hay ${disponible} libres antes de la fila ${filaLimite}`,
  }
}
