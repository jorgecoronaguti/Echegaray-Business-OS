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
// campos de fila; no hay forma de intercalarlos. El bloque tenía el importe en la D, entre
// comprobante y obra, y ahora queda en la G. Es una limitación de la API, no una decisión.
//
// **Los rótulos son los de Compras.** Un campo de fila hereda el encabezado de su columna origen
// ("Fecha prevista de pago (día)"), y la API no permite renombrarlo. Sólo el valor acepta `name`.
//
// ═══ LAS DOS TRAMPAS YA PAGADAS (ver deuda-viva-pivot.mjs) ═══
//
// 1. Una `filterCriteria.condition` sobre una columna de grid DESCARTA TODAS LAS FILAS sin avisar:
//    la dinámica aparece perfecta y vacía. Acá se filtra sólo por `visibleValues`, y los valores
//    van como TEXTO aunque la columna sea numérica: es la representación lo que el pivot compara.
// 2. `showTotals` en un nivel intermedio NO emite subtotales. Se apaga en todos los niveles: el
//    único total es el gran total del pie, que es el que se controla contra el titular.

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
 * LOS CAMPOS DE FILA, EN EL ORDEN DE LA PESTAÑA.
 *
 * Se respeta el orden que el dueño tiene (proveedor · próximo pago · comprobante · obra · tipo de
 * pago · categoría) aunque el importe no pueda quedar en el medio. Ninguno lleva `showTotals`:
 * ver la trampa 2 de la cabecera.
 *
 * El primer nivel ordena por el valor DESCENDENTE — a quién le debemos más, arriba.
 */
export function camposDeFila({ vista = VISTA.POR_PROVEEDOR } = {}) {
  // EL PROVEEDOR VA PRIMERO — pedido explícito del dueño (04/08), y el comprobante no se muestra.
  //
  // Lo que eso cuesta, dicho: el primer nivel es el que AGRUPA, y una dinámica escribe su rótulo una
  // sola vez por grupo. Con el proveedor al frente, las facturas 2ª de Alumetal y 2ª/3ª/4ª de
  // Corralón Progreso quedan con la columna A en blanco. No es un dato faltante y no hay forma de
  // evitarlo en una dinámica nativa: la API no tiene "repetir rótulos" (Excel sí, Sheets no).
  //
  // Por eso existe VISTA.POR_PROVEEDOR: una línea por proveedor, sin una sola celda vacía, a costa
  // de perder el detalle factura por factura. Se elige, no se sufre.
  if (vista === VISTA.POR_PROVEEDOR) {
    return [{ sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } }]
  }
  // EL PROVEEDOR ES EL NIVEL QUE AGRUPA, con `showTotals` para que emita su subtotal. Debajo, una
  // línea por factura con todo lo que hace falta para decidir un pago: número, cuándo, obra, con qué
  // se paga y categoría. Esto es una dinámica nativa: la recalcula Google, no un generador.
  return [
    { sourceColumnOffset: COL.proveedor, showTotals: true, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } },
    { sourceColumnOffset: COL.comprobante, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.proximoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.obra, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.tipoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.categoria, showTotals: false, sortOrder: 'ASCENDING' },
  ]
}

/** Las dos formas del cuadro. El detalle muestra cada factura; la otra, una línea por proveedor. */
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
 * LOS VALORES — y por qué la fecha NO es uno de ellos.
 *
 * El dueño pidió CERO agujeros. Un valor de pivot es siempre una agregación numérica, así que
 * "próximo pago" sólo podría entrar como MIN de la fecha prevista. Y ahí aparece el agujero: dos
 * proveedores (DUPEC y RSV) tienen la palabra "Pendiente" en la columna de la fecha en vez de una
 * fecha, MIN no encuentra ningún número, y la celda sale vacía. Medido, no supuesto.
 *
 * SUM y COUNTA no pueden quedar vacíos nunca: un grupo existe porque tiene al menos una fila. Por
 * eso el cuadro es proveedor · deuda · facturas, y la fecha vuelve el día que esas dos facturas
 * tengan fecha en Compras. No se inventa una fecha para tapar un hueco.
 */
export function valoresDelPivot({ vista = VISTA.POR_PROVEEDOR } = {}) {
  // En el DETALLE, un COUNTA pondría un "1" en cada renglón de factura: ruido en todas las filas
  // para un dato que sólo significa algo en un total. Va sólo en la vista por proveedor.
  if (vista === VISTA.DETALLE) return [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Importe' }]
  return [
    { sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Importe' },
    // COUNTA sobre el PROVEEDOR, no sobre el número de comprobante: hay una factura sin número
    // (La Isla Metal SRL) y COUNTA sólo cuenta lo no vacío — mostraba "0 facturas" para un
    // proveedor al que le debemos $100.000. El proveedor está en todas las filas del grupo por
    // definición: es lo único que garantiza que el conteo sea la cantidad de filas.
    { sourceColumnOffset: COL.proveedor, summarizeFunction: 'COUNTA', name: 'Facturas' },
  ]
}

/** La dinámica entera, lista para `updateCells`. */
export function pivotSeccion1(fuente, { vista = VISTA.POR_PROVEEDOR } = {}) {
  return {
    source: fuente,
    rows: camposDeFila({ vista }),
    values: valoresDelPivot({ vista }),
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
  // La deuda es el PRIMER valor, no el último: con dos valores (deuda y facturas) tomar `ancho - 1`
  // formatea la cantidad de facturas como pesos y deja la deuda pelada — y peor, hace que el
  // control de arriba sume la columna de los conteos y dé cualquier cosa.
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
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' }, horizontalAlignment: 'RIGHT',
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
 * EL FORMATO DE LA CANTIDAD DE FACTURAS — un entero, y hay que decirlo.
 *
 * Sin esto, la columna se queda con el formato que TENÍA de la corrida anterior. Pasó de verdad:
 * quedó con formato de fecha y "2 facturas" se mostró como `01/01/1900`. Una celda no vuelve sola a
 * "automático" porque el contenido cambió de sentido; el formato es del archivo, no del dato.
 */
export function formatoDeLaCantidad({ sheetId, filaAncla, alto, ancho }) {
  return formatoDeColumna({
    sheetId, filaAncla, alto, columna: ancho - 1,
    numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'RIGHT',
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
  pedidos.push(formatoDeColumna({
    sheetId, filaAncla, alto, columna: campos.length,
    numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' }, horizontalAlignment: 'RIGHT',
  }))
  if (ancho > campos.length + 1) {
    pedidos.push(formatoDeColumna({
      sheetId, filaAncla, alto, columna: ancho - 1,
      numberFormat: { type: 'NUMBER', pattern: '0' }, horizontalAlignment: 'RIGHT',
    }))
  }
  return pedidos
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
 * @param {{filaEncabezado:number, filaLimite:number, proveedores:number, facturas:number}} o
 */
export function bandasDeFormato({ filaEncabezado, filaLimite, proveedores, facturas }) {
  const iA = filaEncabezado - 1        // el rótulo del cuadro A
  const altoA = 1 + proveedores        // rótulo + una línea por proveedor
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
  const iCab = filas.findIndex((_, i) => i > iTitulo && i < iLimite
    && (filas[i] ?? []).some((c) => /PROVEEDOR/.test(txt(c)))
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
