// LA TABLA DINÁMICA DE DEUDA VIVA — Y EL FILTRO QUE LA DEJABA VACÍA SIN DECIR NADA.
//
// ═══ EL DEFECTO, MEDIDO EN EL ARCHIVO REAL (04/08) ═══
//
// La dinámica mostraba sus encabezados y su "Suma total", y entre medio NADA. Ni un error, ni un
// `#REF!`, ni un aviso: una tabla perfectamente formada de cero filas. Se probaron dos filtros y los
// dos dieron lo mismo:
//
//   · `columnOffsetIndex: 35` (¿comercial?) con `condition NUMBER_EQ 1`      → 0 filas
//   · `columnOffsetIndex: 37` (saldo)       con `condition NUMBER_GREATER 0` → 0 filas
//
// La sospecha era el dato: que la columna del saldo fuera texto, o que el `1` de comercial fuera la
// cadena "1". Las dos eran falsas — leída con UNFORMATTED_VALUE, la fila 796 da `AJ: 1` (número) y
// `AL: 5124411.5` (número). El dato estaba bien.
//
// ═══ LA CAUSA ═══
//
// **Una `filterCriteria.condition` sobre una columna de grid de un pivot descarta TODAS las filas.**
// El mismo pivot, con el mismo source y el mismo valor, cambiando sólo el filtro a `visibleValues`,
// devuelve las 13 facturas y $15.716.930,35 — el peso exacto del titular. Verificado escribiendo los
// dos pivots lado a lado en la misma pestaña y leyendo el resultado.
//
// Por eso acá NO SE USA `condition` NUNCA. Y por eso los valores de `visibleValues` van como TEXTO
// (`'1'`) aunque la columna sea numérica: es la representación lo que el pivot compara.
//
// ═══ LA SEGUNDA TRAMPA: `showTotals` NO DA SUBTOTALES ═══
//
// Con dos niveles de fila (proveedor → comprobante), `showTotals: true` en el nivel externo NO emite
// la fila "Alumetal Total" que sí aparece armando el pivot a mano en la UI: emite únicamente el GRAN
// total del pie. Probado con y sin `valueLayout`. Por eso el subtotal por proveedor es su propio
// pivot de un nivel (`pivotPorProveedor`) en vez de un renglón intermedio que la API no produce —
// dos tablas simples se auditan mejor que una compleja que no hace lo que promete.

/** Columnas de Compras por su offset dentro del source (que arranca en la columna A). */
export const COL = Object.freeze({ proveedor: 4, comprobante: 7, estado: 23, comercial: 35, saldo: 37 })

/** El estado que significa "se lo debemos". Es un estado, nunca una fecha. */
export const PENDIENTE = 'Pendiente'

/**
 * LOS FILTROS DEL PIVOT — el mismo universo que el titular de Proveedores.
 *
 * Estado = "Pendiente" Y ¿Proveedor comercial? = 1. Los dos por `visibleValues`: ver la cabecera.
 *
 * @returns {Array<object>} filterSpecs listos para la API
 */
export function filtrosDeudaViva() {
  return [
    { columnOffsetIndex: COL.estado, filterCriteria: { visibleValues: [PENDIENTE] } },
    { columnOffsetIndex: COL.comercial, filterCriteria: { visibleValues: ['1'] } },
  ]
}

/**
 * ¿Este pivot usa una condición donde debería usar valores visibles?
 *
 * Existe para que el defecto tenga un test: si alguien vuelve a poner un `NUMBER_GREATER` en un
 * filtro de este pivot, la suite se pone roja antes de que la dinámica aparezca vacía en el Sheet.
 *
 * @param {object} pivot
 * @returns {string[]} las columnas filtradas por condición (vacío = está bien)
 */
export function filtrosPorCondicion(pivot = {}) {
  return (pivot?.filterSpecs ?? [])
    .filter((f) => f?.filterCriteria?.condition)
    .map((f) => String(f.columnOffsetIndex))
}

/**
 * ═══ LA TERCERA TRAMPA: HABÍA DOS `fuenteCompras` Y LA DE ACÁ SEGUÍA ROTA (05/09/2026) ═══
 *
 * Este módulo tenía su propia copia, que devolvía `endRowIndex: filas` con `filas` = el `rowCount`
 * de Compras. Ese es exactamente el defecto que se corrigió el 18/08 en la otra copia: cuando
 * alguien carga una compra, Google agranda la grilla y el pivot se queda apuntando a la fila
 * anterior — la factura nueva cae fuera del origen sin un solo error. Acá siguió verde diez días,
 * defendida por un test que afirmaba `endRowIndex === 932`.
 *
 * Dos definiciones del mismo concepto: la corrección le llegó a una sola. Ahora hay UNA, y vive
 * donde está escrita la lección con su medición.
 */
export { fuenteCompras } from './proveedores-pivot-seccion1.mjs'

/** Detalle: proveedor → comprobante → saldo. Es el que se controla contra el titular al peso. */
export function pivotDetalle(fuente) {
  return {
    source: fuente,
    rows: [
      { sourceColumnOffset: COL.proveedor, showTotals: true, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } },
      { sourceColumnOffset: COL.comprobante, showTotals: false, sortOrder: 'ASCENDING' },
    ],
    values: [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Deuda' }],
    filterSpecs: filtrosDeudaViva(),
  }
}

/** Subtotal por proveedor: lo que `showTotals` no sabe emitir en el pivot de dos niveles. */
export function pivotPorProveedor(fuente) {
  return {
    source: fuente,
    rows: [{ sourceColumnOffset: COL.proveedor, showTotals: true, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } }],
    values: [{ sourceColumnOffset: COL.saldo, summarizeFunction: 'SUM', name: 'Deuda' }],
    filterSpecs: filtrosDeudaViva(),
  }
}
