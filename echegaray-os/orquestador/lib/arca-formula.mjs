// LO QUE ARCA FACTURÓ, COMO FÓRMULA Y NO COMO NÚMERO PEGADO.
//
// POR QUÉ EXISTE (21/07). "Proveedores y Materiales" tenía 79 números pegados y TODOS eran lo mismo:
// importes del libro de IVA. El comentario del código decía "no se puede calcular desde el Sheet", y
// era verdad mientras los comprobantes vivieran sólo en Postgres. Dejó de serlo cuando se creó
// _ARCA_RAW: los 459 comprobantes están adentro del archivo y todo esto se escribe con fórmulas.
//
// La regla: si el insumo no está en el Sheet se trae el INSUMO, no se pega el RESULTADO. Lo pegado
// envejece en silencio — se carga una factura en ARCA y el cuadro sigue mostrando el número del día
// que corrió el script.
//
// Vive en lib/ y no en el script porque lo usan (y lo van a usar) varias pestañas: la misma fórmula
// tiene que significar lo mismo en todas. Una definición, una fuente.

/** La pestaña réplica. La escribe scripts/arca-raw-pestana.mjs. */
export const R = '_ARCA_RAW'

/** El importe con su signo: la nota de crédito viene con −1 en la columna F de la réplica. */
export const IMPORTE = `IF(ISNUMBER(${R}!$F$4:$F);${R}!$F$4:$F;0)*IF(ISNUMBER(${R}!$M$4:$M);${R}!$M$4:$M;0)`

/** La clave del comprobante: la réplica guarda punto de venta y número por separado y sin ceros. */
export const CLAVE_COMP = `TEXT(${R}!$G$4:$G;"0000")&"-"&TEXT(${R}!$H$4:$H;"00000000")`

/** Todo lo que ARCA le facturó a la empresa bajo un CUIT (el de la celda, con guiones). */
export const arcaPorCuit = (celda) =>
  `=IF(${celda}="";"";SUMPRODUCT((${R}!$I$4:$I=SUBSTITUTE(${celda};"-";""))*(${R}!$B$4:$B="Compras")*${IMPORTE}))`

/**
 * Un comprobante puntual, identificado por CUIT + número + SIGNO.
 *
 * EL SIGNO NO ES OPCIONAL. Sin él esta fórmula devolvió $0 para la nota de crédito 0010-00000001 de
 * PEREZ GARCIA, y no era un error de fórmula: esa nota tiene EL MISMO punto de venta y número que la
 * factura que anula. CUIT + número no identifica un comprobante — un proveedor puede emitir una
 * factura y una nota de crédito con el mismo número, y de hecho pasó. Sumaba +21.781 y −21.781, y
 * el resultado era un importe real desaparecido sin ningún error a la vista.
 *
 * @param {string} cuit  celda o literal entre comillas, con o sin guiones
 * @param {string} comp  celda con el comprobante en formato 0000-00000000
 * @param {string} signo '1' para facturas, '-1' para notas de crédito
 */
export const arcaPorComprobante = (cuit, comp, signo) =>
  `=SUMPRODUCT((${R}!$I$4:$I=SUBSTITUTE(${cuit};"-";""))*(${CLAVE_COMP}=${comp})*(${R}!$F$4:$F=${signo})*${IMPORTE})`

/** El total de un libro entero, con los signos aplicados. */
export const totalLibro = (libro) => `=SUMPRODUCT((${R}!$B$4:$B="${libro}")*${IMPORTE})`
