// LA FILA DE RÓTULOS DE «Compras» TAL COMO ESTÁ HOY EN EL SHEET — leída por API, no supuesta.
//
// ═══ POR QUÉ EXISTE (18/09/2026) ═══
//
// El 17/09 el dueño reclamó que el cargador «no está completando todas las columnas». La primera
// hipótesis fue que el contrato por rótulo (`contrato-columnas.mjs`) ya no resolvía contra la fila
// viva. Se verificó que sí resuelve —el «falla» que se vio era una lectura truncada en `A3:AN3` que
// dejaba afuera el rótulo 41, «Tramo de vencimiento (OS)»—, pero la verificación fue A MANO, contra
// el Sheet, y nada la repetía. Este archivo la congela: es `Compras!A3:BZ3` leído con
// `readSheetValues` el 18/09/2026, textual, 41 rótulos.
//
// El test que lo usa (`contrato-columnas.test.mjs`) hace que la PRÓXIMA inserción de columna del
// dueño rompa un test en vez de una carga: cuando la pestaña cambie, quien la cambie actualiza esta
// constante y el test le dice qué letra se movió. `COMPRAS_CON_OBRA` (`encabezados-referencia.mjs`)
// es el mismo layout CONSTRUIDO insertando «Obra» sobre el del 25/08; éste es el LEÍDO. Los dos
// tienen que coincidir, y eso también lo fija el test.

/** Compras!A3:BZ3, leído el 18/09/2026 (hora de San Juan). 41 rótulos, A→AO. */
export const COMPRAS_1809 = Object.freeze([
  'ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo',
  'N° Comprobante', 'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Obra', 'Concepto',
  'Importe', 'IVA', 'Total', 'Tipo pago', 'Fecha prevista de pago (día)', 'Fecha prevista de pago (mes)',
  'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1', 'Fecha prevista de pago 2', 'Monto Parcial 2',
  'Estado', 'Tipo de Costo', 'Estado pago', 'Estado Carga', 'Rubro de caja', 'Rubro de caja',
  'Fecha de caja', 'Familia de material', 'Sub-rubro de estructura', 'Orden de pago (OS)',
  'Orden de pago (OS)', 'Orden sin fecha (OS)', '¿Proveedor comercial? (OS)', '¿Comprobante repetido? (OS)',
  'Saldo pendiente (OS)', 'CUIT (OS)', 'Tramo de vencimiento (OS)',
])

/**
 * LO QUE CADA COLUMNA DEL CARGADOR TIENE QUE SER HOY, POR LETRA. Medido contra el Sheet vivo el
 * 18/09/2026: si el contrato resuelve otra letra para alguna de éstas, escribe en la columna de al lado.
 */
export const LETRAS_1809 = Object.freeze({
  categoria: 'B', fecha: 'C', proveedor: 'E', modalidad: 'F', tipo: 'G', numero: 'H', unidad: 'I',
  obra: 'J', detalle: 'K', obraFila: 'L', concepto: 'M', neto: 'N', iva: 'O', total: 'P', formaPago: 'Q',
  totalParcial: 'T', pagado: 'U', estado: 'Y', tipoCosto: 'Z', estadoCarga: 'AB', rubroCaja: 'AD',
  ordenSinFecha: 'AJ',
})
