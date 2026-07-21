// EL ORDEN DE LA DEUDA, COMO COLUMNA CALCULADA EN COMPRAS.
//
// POR QUÉ EXISTE (21/07). El dueño abrió F8 de la tabla de deuda, vio "700000" en la barra de
// fórmulas y escribió: "1ERRORRRRRR - carga de numero sin referencia, rehacer". Es la SEGUNDA vez
// que marca esa misma celda.
//
// Técnicamente esa celda no tenía nada escrito: era un DERRAME del QUERY que vivía en A8. Pero eso
// no alcanza como respuesta, y él tiene razón: Google Sheets muestra el valor derramado en la barra
// de fórmulas exactamente igual que un número tipeado. Si al abrir la celda no se ve una fórmula, la
// regla no se está cumpliendo DE HECHO, aunque se cumpla en el modelo. Una regla que hay que creer
// no sirve — tiene que verse.
//
// ═══ CÓMO SE RESUELVE ═══
//
// El QUERY que derrama se reemplaza por un ÍNDICE DE ORDEN calculado en Compras, más una fórmula
// INDEX/MATCH en CADA celda de la tabla. Así cada celda —las 144— muestra su propia fórmula al
// abrirla, y la tabla sigue siendo igual de viva: se marca una factura como pagada en Compras y
// desaparece de la tabla sin esperar al agente.
//
// El orden no se puede hacer con RANK porque hay empates —varias facturas vencen el mismo día— y un
// empate en RANK produce dos veces el mismo número y saltea el siguiente: dos filas de la tabla
// mostrarían la misma factura y otra no aparecería nunca. El desempate va por posición en la
// planilla, con un COUNTIFS de rango creciente.

/** El estado que marca una factura como impaga. Una sola definición, la de cuentas-por-pagar. */
export const COL = { estado: '$X', fechaCaja: '$AD', total: '$O', orden: 'AF', ordenSinFecha: 'AG' }

/**
 * NÚCLEO PURO: la fórmula de la columna de orden, para la fila `f` de Compras.
 *
 * Devuelve 1, 2, 3… para las facturas impagas CON fecha de caja, ordenadas por esa fecha. Vacío
 * para todas las demás, así que el MATCH de la tabla no las encuentra y no ocupan una fila.
 *
 * @param {number} f fila de Compras (la primera de datos es la 4)
 * @param {string} estadoDeuda el rótulo exacto del estado impago
 */
export function formulaOrden(f, estadoDeuda) {
  const cond = `AND(${COL.estado}${f}="${estadoDeuda}";ISNUMBER(${COL.fechaCaja}${f});ISNUMBER(${COL.total}${f}))`
  // Cuántas vencen ANTES + cuántas vencen el MISMO día pero están más arriba en la planilla. El
  // segundo término es el desempate: sin él, dos facturas del mismo día comparten número de orden.
  const antes = `COUNTIFS(${COL.fechaCaja}$4:${COL.fechaCaja};"<"&${COL.fechaCaja}${f};${COL.estado}$4:${COL.estado};"${estadoDeuda}";${COL.total}$4:${COL.total};"<>")`
  const empate = `COUNTIFS(${COL.fechaCaja}$4:${COL.fechaCaja}${f};${COL.fechaCaja}${f};${COL.estado}$4:${COL.estado}${f};"${estadoDeuda}";${COL.total}$4:${COL.total}${f};"<>")`
  return `=IF(${cond};${antes}+${empate};"")`
}

/**
 * NÚCLEO PURO: igual que la anterior, para las impagas SIN fecha de caja.
 * Se ordenan por MONTO de mayor a menor: una factura sin fecha no compite por urgencia, compite por
 * tamaño. Es el criterio que pidió el dueño.
 */
export function formulaOrdenSinFecha(f, estadoDeuda) {
  const cond = `AND(${COL.estado}${f}="${estadoDeuda}";NOT(ISNUMBER(${COL.fechaCaja}${f}));ISNUMBER(${COL.total}${f}))`
  const mayores = `COUNTIFS(${COL.estado}$4:${COL.estado};"${estadoDeuda}";${COL.fechaCaja}$4:${COL.fechaCaja};"";${COL.total}$4:${COL.total};">"&${COL.total}${f})`
  const empate = `COUNTIFS(${COL.estado}$4:${COL.estado}${f};"${estadoDeuda}";${COL.fechaCaja}$4:${COL.fechaCaja}${f};"";${COL.total}$4:${COL.total}${f};${COL.total}${f})`
  return `=IF(${cond};${mayores}+${empate};"")`
}

/**
 * NÚCLEO PURO: la fórmula de UNA celda de la tabla de deuda.
 *
 * @param {string} colOrigen la columna de Compras que se trae ('$AD', '$E', '$O'…)
 * @param {number} filaTabla la fila del Sheet donde va la celda
 * @param {number} primera   la primera fila de la tabla (para saber qué puesto le toca)
 * @param {string} colOrden  'AF' o 'AG' según qué tabla
 */
export function celdaDeuda(colOrigen, filaTabla, primera, colOrden = COL.orden) {
  const puesto = `ROW()-${primera - 1}`
  return `=IFERROR(INDEX(Compras!${colOrigen}$4:${colOrigen};MATCH(${puesto};Compras!$${colOrden}$4:$${colOrden};0));"")`
}
