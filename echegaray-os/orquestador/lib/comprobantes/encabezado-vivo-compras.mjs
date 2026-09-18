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
// ═══ QUÉ GARANTIZA ESTA CONSTANTE, Y QUÉ NO (dicho con precisión) ═══
//
// `contrato-columnas.test.mjs` corre en la suite normal y prueba COHERENCIA INTERNA: que el contrato
// resuelva contra estos 41 rótulos, que cada clave del cargador caiga en la letra medida, y que este
// layout LEÍDO coincida con `COMPRAS_CON_OBRA` (`encabezados-referencia.mjs`), que es el mismo layout
// CONSTRUIDO insertando «Obra» sobre el del 25/08. Dos derivaciones independientes que tienen que dar
// lo mismo. Eso atrapa al código que se separa del contrato — no al Sheet que se separa del código:
// **ningún test de la suite lee la pestaña**, así que una columna que el dueño inserte mañana no
// pone nada en rojo hasta que alguien la mida.
//
// Quien la mide es `encabezado-vivo-compras.vivo.test.mjs`: lee `Compras!A3:BZ3` por API (sólo
// lectura) y la compara contra esta constante. No corre en la suite —requiere credenciales de Google
// y tocar la red— y se pide a mano con `ORQ_TEST_SHEET_VIVO=1`. Es el único que puede decir que esto
// sigue siendo cierto; correrlo antes de desplegar el bot es lo que convierte esta constante en una
// medición vigente y no en una foto vieja.

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
