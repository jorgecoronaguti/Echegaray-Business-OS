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
export function camposDeFila() {
  return [
    { sourceColumnOffset: COL.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } },
    { sourceColumnOffset: COL.proximoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.comprobante, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.obra, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.tipoPago, showTotals: false, sortOrder: 'ASCENDING' },
    { sourceColumnOffset: COL.categoria, showTotals: false, sortOrder: 'ASCENDING' },
  ]
}

/** Los filtros. NUNCA por `condition`: ver la trampa 1. */
export function filtros() {
  return [
    { columnOffsetIndex: COL.estado, filterCriteria: { visibleValues: [PENDIENTE] } },
    { columnOffsetIndex: COL.comercial, filterCriteria: { visibleValues: ['1'] } },
  ]
}

/**
 * El rango de Compras que alimenta la dinámica, acotado por abajo a la grilla real: un source
 * ilimitado obliga a recorrer la hoja entera en cada recálculo sin ganar una sola fila.
 *
 * `startRowIndex: 2` es la fila 3, donde están los rótulos: el pivot la usa como encabezado.
 * Arrancar en la 4 le haría tomar la primera factura como nombre de columna.
 */
export function fuenteCompras({ sheetId, filas }) {
  if (!Number.isInteger(sheetId)) throw new Error('fuenteCompras: falta el sheetId de Compras')
  if (!(filas > 3)) throw new Error(`fuenteCompras: la grilla de Compras no puede tener ${filas} filas`)
  return { sheetId, startRowIndex: 2, endRowIndex: filas, startColumnIndex: 0, endColumnIndex: 38 }
}

/** La dinámica entera, lista para `updateCells`. */
export function pivotSeccion1(fuente) {
  return {
    source: fuente,
    rows: camposDeFila(),
    values: [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Importe' }],
    filterSpecs: filtros(),
    valueLayout: 'HORIZONTAL',
  }
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
export function formatoDelImporte({ sheetId, filaAncla, alto, ancho }) {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: filaAncla, // la fila DESPUÉS del rótulo
        endRowIndex: filaAncla + alto,
        startColumnIndex: ancho - 1,
        endColumnIndex: ancho,
      },
      cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' }, horizontalAlignment: 'RIGHT' } },
      fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    },
  }
}

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
