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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL IVA DE UN PERÍODO — el insumo del cuadro 4 de "Impuestos y Financieros"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ (07/08). El cuadro de IVA tenía dos estados por mes: la DDJJ F.2051 presentada (dato
// oficial) o una PROYECCIÓN sobre el Libro. Entre los dos faltaba un tercero que ya existía en la
// base y no llegaba a ninguna celda: los COMPROBANTES REALES de ARCA del período — el mes vencido que
// todavía no se presentó, y el mes en curso a medida que se carga.
//
// Y va por FÓRMULA, no por número: si el débito de agosto se pega, envejece el día que el sync trae
// una factura más. Con la fórmula, la columna se actualiza sola cada vez que _ARCA_RAW se refresca,
// sin regenerar la pestaña. Es la misma regla que ya rige el resto del archivo.

/**
 * El IVA de un comprobante, CON SU SIGNO. Una nota de crédito resta acá igual que en el total: si el
 * IVA no restara, el crédito fiscal quedaría inflado y el OS declararía menos impuesto del que hay
 * que pagar — el error de $7,2M que lib/libro-iva.mjs documenta del lado de Postgres.
 */
export const IVA = `IF(ISNUMBER(${R}!$L$4:$L);${R}!$L$4:$L;0)*IF(ISNUMBER(${R}!$F$4:$F);${R}!$F$4:$F;0)`

/**
 * El IVA de un período y un libro, sumado sobre la réplica.
 * El período se compara como TEXTO: la réplica lo escribe con apóstrofo justamente para que no se
 * convierta en fecha, y comparar un texto contra un serial da CERO sin dar error (ver arca-raw-pestana).
 * @param {string} periodo 'YYYY-MM'
 * @param {'Ventas'|'Compras'} libro
 */
export const ivaDelPeriodo = (periodo, libro) =>
  `SUMPRODUCT((${R}!$A$4:$A="${periodo}")*(${R}!$B$4:$B="${libro}")*${IVA})`

/** DÉBITO fiscal del período según los comprobantes EMITIDOS que ARCA tiene. */
export const formulaDebitoArca = (periodo) => `=${ivaDelPeriodo(periodo, 'Ventas')}`

/**
 * CRÉDITO fiscal del período según los comprobantes RECIBIDOS que ARCA tiene.
 *
 * EL TÉRMINO COMPUTABLE ES EL IVA FACTURADO ÍNTEGRO, y es una decisión declarada, no un descuido: es
 * el MISMO criterio que ya usa `posicionIvaCompleta()` en lib/posicion-iva.mjs (crédito = `total_iva`
 * del libro R con signo). No se prorratea por alícuota ni se descuentan compras no computables porque
 * el OS no tiene con qué distinguirlas: "Mis Comprobantes" no dice si un gasto pertenece a la
 * actividad gravada. Un prorrateo inventado acá sería una segunda versión del mismo número, peor que
 * la primera y sin nadie que pueda firmarla.
 *
 * LO QUE ESTO NO ES: la DDJJ. No lleva percepciones sufridas, ni ajustes, ni prorrateo por actividad
 * exenta. Por eso pierde SIEMPRE contra la F.2051 presentada, y la celda declara su procedencia.
 */
export const formulaCreditoArca = (periodo) => `=${ivaDelPeriodo(periodo, 'Compras')}`

/**
 * EL MES EN CURSO: ni el hecho parcial solo, ni la proyección sola — el mayor de los dos.
 *
 * Un mes que todavía no terminó tiene en ARCA una PORCIÓN de sus comprobantes. Usarla como posición
 * del mes subestima el débito, infla la libre disponibilidad que se arrastra a los meses siguientes y
 * el cash flow termina reservando de menos para un impuesto que sí va a ocurrir.
 *
 * La salida no se inventa acá: es la que este mismo cuadro ya usa para el impuesto al cheque —
 * MAX(lo que el banco YA debitó; lo que el Libro proyecta), "nunca subestima". Se aplica a los DOS
 * términos por igual (débito y crédito), porque tratar un lado con el hecho y el otro con la
 * proyección inclina la resta por una razón que no existe. A medida que ARCA se carga, el hecho
 * supera a la proyección y la celda converge sola al número real, sin regenerar nada.
 */
export const nuncaMenosQue = (formulaHecho, formulaProyeccion) =>
  `=MAX(${String(formulaHecho).replace(/^=/, '')};${String(formulaProyeccion).replace(/^=/, '')})`

/**
 * Un comprobante EMITIDO por la empresa, identificado sólo por su número.
 *
 * SIN CUIT, Y ES DELIBERADO. La réplica guarda el CUIT del EMISOR, que en una venta es la propia
 * empresa: filtrar por el CUIT del cliente daba cero en las dieciséis filas. En ventas el número de
 * comprobante ya es único —lo emite la empresa, con su propia numeración—, así que alcanza.
 *
 * El signo entra en la suma en vez de filtrarse: una nota de crédito emitida también resta.
 */
export const arcaPorComprobanteVentas = (comp) =>
  `=SUMPRODUCT((${CLAVE_COMP}=${comp})*(${R}!$B$4:$B="Ventas")*${IMPORTE})`
