// LAS FILAS REALES DE COBRANZAS Y OBRAS AL 24/08/2026 — el fixture del estado de cuenta.
//
// ═══ POR QUÉ SON LAS FILAS REALES Y NO FILAS DE JUGUETE ═══
//
// Un fixture inventado prueba que el código hace lo que el código hace. Estas filas son las que hoy
// mueven la caja de la empresa, copiadas con `UNFORMATTED_VALUE` de la pestaña `Cobranzas` y con
// valores formateados de `OBRAS`, y traen los cinco casos que un estado de cuenta rompe:
//
//   · una cobranza EN DÓLARES dentro de la columna de pesos (fila 62, AA = USD)
//   · el tipo de cambio de la factura escrito en el concepto de OTRA fila del mismo comprobante (63)
//   · una fila anulada que no es un cobro de cero (54, estado CANCELAR)
//   · un cliente con DOS rótulos distintos en la columna G (San Francisco / IMOTOR-JAVI SANCHEZ)
//   · la fila 99, cargada el 24/08, con la fecha declarada ESTIMADA en su propio concepto
//
// Las filas conservan su NÚMERO DE FILA real: los huecos son arrays vacíos. Así, cuando un test
// afirma "OBRAS fila 22", ése es el renglón que hay que abrir en el Sheet para desmentirlo.
//
// Las columnas que el documento no lee (A, B, F, L, R–Z) van vacías a propósito — entre ellas la W,
// que guarda notas internas que nunca salen impresas hacia el cliente.

/** `n` filas vacías, para que los índices del fixture coincidan con los del Sheet. */
const vacias = (n) => Array.from({ length: n }, () => [])

/** Las 13 filas de Quattropani — Melisa García SAS. Filas 61–64 y 84–92 de `Cobranzas`. */
export const FILAS_QUATTROPANI = Object.freeze([
  /* 61 */ ['', '', 46230, "FA", 219, '', "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "U$S 11.500 + IVA — 36,5 % del anticipo 50 % + Materiales", 54279685.38, 11398733.9298, "", 65678419.3098, "Transferencia", "Cobrado", '', 46231, '', '', '', '', '', '', '', '', '', ""],
  /* 62 */ ['', '', 46230, "FA", 220, '', "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 15.400 en dólares", 15400, "", "", 15400, "Efectivo", "Cobrado", '', 46234, '', '', '', '', '', '', '', '', '', "USD"],
  /* 63 */ ['', '', 46230, "FA", 220, '', "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 4.600 = $ 7.130.000 a TC 1.550", 7130000, "", "", 7130000, "Efectivo", "Cobrado", '', 46234, '', '', '', '', '', '', '', '', '', ""],
  /* 64 */ ['', '', 46231, "FA", 220, '', "Quattropani - Melisa García SAS", "", "IVA de Factura 220", 0, 6510000, 0, 6510000, "Transferencia", "Cobrado", '', 46253, '', '', '', '', '', '', '', '', '', ""],
  /* 84 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9", "Salón Comercial - Certificación 1/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46266, '', '', '', '', '', '', '', '', '', ""],
  /* 85 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 2/9", "Salón Comercial - Certificación 2/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46281, '', '', '', '', '', '', '', '', '', ""],
  /* 86 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 3/9", "Salón Comercial - Certificación 3/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46296, '', '', '', '', '', '', '', '', '', ""],
  /* 87 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 4/9", "Salón Comercial - Certificación 4/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46311, '', '', '', '', '', '', '', '', '', ""],
  /* 88 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 5/9", "Salón Comercial - Certificación 5/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46326, '', '', '', '', '', '', '', '', '', ""],
  /* 89 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 6/9", "Salón Comercial - Certificación 6/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46341, '', '', '', '', '', '', '', '', '', ""],
  /* 90 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 7/9", "Salón Comercial - Certificación 7/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46356, '', '', '', '', '', '', '', '', '', ""],
  /* 91 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 8/9", "Salón Comercial - Certificación 8/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46371, '', '', '', '', '', '', '', '', '', ""],
  /* 92 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 9/9", "Salón Comercial - Certificación 9/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46386, '', '', '', '', '', '', '', '', '', ""],
])

/** Las 25 filas de San Francisco, bajo sus DOS rótulos. Filas 7–99 de `Cobranzas`. */
export const FILAS_SAN_FRANCISCO = Object.freeze([
  /* 7 */ ['', '', 46006, "FA", "01-00000201", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "Certificado 2", "", 15000000, 3150000, "", 18150000, "Transferencia", "Cobrado", '', 46037, '', '', '', '', '', '', '', '', '', ""],
  /* 20 */ ['', '', 46199, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 10000000, "", "", 10000000, "Efectivo", "Cobrado", '', 46185, '', '', '', '', '', '', '', '', '', ""],
  /* 24 */ ['', '', 46147, "FA", "01-00000211", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "Certificado 3", "", 20000000, 4200000, "", 24200000, "Transferencia", "Cobrado", '', 46150, '', '', '', '', '', '', '', '', '', ""],
  /* 25 */ ['', '', 46150, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 20000000, "", "", 20000000, "Efectivo", "Cobrado", '', 46150, '', '', '', '', '', '', '', '', '', ""],
  /* 28 */ ['', '', 46227, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 5000000, "", "", 5000000, "Efectivo", "Cobrado", '', 46199, '', '', '', '', '', '', '', '', '', ""],
  /* 29 */ ['', '', 46227, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 5000000, "", "", 5000000, "Efectivo", "Cobrado", '', 46211, '', '', '', '', '', '', '', '', '', ""],
  /* 30 */ ['', '', 46228, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 6215646, "", "", 6215646, "Efectivo", "Cobrado", '', 46219, '', '', '', '', '', '', '', '', '', ""],
  /* 50 */ ['', '', 46220, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "Pago efectivo — julio 2026", 16200000, "", "", 16200000, "Efectivo", "Cobrado", '', 46220, '', '', '', '', '', '', '', '', '', ""],
  /* 54 */ ['', '', 46219, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "Cobro efectivo - pago total julio - NO CONSIDERAR", 0, "", "", 0, "Efectivo", "CANCELAR", '', 46220, '', '', '', '', '', '', '', '', '', ""],
  /* 66 */ ['', '', 46239, "", "", '', "San Francisco", "Anticipo inicio obra Pisos Industriales - Total Obra: $47.590.272", "Pisos Industriales", 6241190, "", "", 6241190, "Efectivo", "Cobrado", '', 46255, '', '', '', '', '', '', '', '', '', ""],
  /* 67 */ ['', '', 46244, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 40.000.000 Cotización n° — 1ª de 2 cuotas quincenales", "Instalaciones Eléctricas", 10000000, "", "", 10000000, "Efectivo", "Pendiente", '', 46262, '', '', '', '', '', '', '', '', '', ""],
  /* 68 */ ['', '', 46244, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 7.728.254 Cotización n° — 1ª de 2 cuotas quincenales", "Entrepiso y Escaleras", 1932063.5, "", "", 1932063.5, "Efectivo", "Pendiente", '', 46262, '', '', '', '', '', '', '', '', '', ""],
  /* 71 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 1/4", "Pisos Industriales - Certificación 1/4", 5950000, "", "", 5950000, "Efectivo", "Pendiente", '', 46295, '', '', '', '', '', '', '', '', '', ""],
  /* 72 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 2/4", "Pisos Industriales - Certificación 2/4", 5950000, "", "", 5950000, "Efectivo", "Pendiente", '', 46310, '', '', '', '', '', '', '', '', '', ""],
  /* 73 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 3/4", "Pisos Industriales - Certificación 3/4", 5950000, "", "", 5950000, "Efectivo", "Pendiente", '', 46325, '', '', '', '', '', '', '', '', '', ""],
  /* 74 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 4/4", "Pisos Industriales - Certificación 4/4", 5945136, "", "", 5945136, "Efectivo", "Pendiente", '', 46340, '', '', '', '', '', '', '', '', '', ""],
  /* 75 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 1/4", "Instalaciones Eléctricas - Certificación 1/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46295, '', '', '', '', '', '', '', '', '', ""],
  /* 76 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 2/4", "Instalaciones Eléctricas - Certificación 2/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46310, '', '', '', '', '', '', '', '', '', ""],
  /* 77 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 3/4", "Instalaciones Eléctricas - Certificación 3/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46325, '', '', '', '', '', '', '', '', '', ""],
  /* 78 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 4/4", "Instalaciones Eléctricas - Certificación 4/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46340, '', '', '', '', '', '', '', '', '', ""],
  /* 79 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 7.728.254 — certificación quincenal 1/1", "Entrepiso y Escaleras - Certificación 1/1", 3864127, "", "", 3864127, "Efectivo", "Pendiente", '', 46295, '', '', '', '', '', '', '', '', '', ""],
  /* 95 */ ['', '', 46253, "", "", '', "San Francisco", "Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra", "Mampostería y cancha de padel", 8758810, "", "", 8758810, "Efectivo", "Cobrado", '', 46255, '', '', '', '', '', '', '', '', '', ""],
  /* 96 */ ['', '', 46234, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 40.000.000 — 2ª de 2 cuotas quincenales · cancela el anticipo", "Instalaciones Eléctricas", 10000000, "", "", 10000000, "Efectivo", "Pendiente", '', 46280, '', '', '', '', '', '', '', '', '', ""],
  /* 97 */ ['', '', 46234, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 7.728.254 — 2ª de 2 cuotas quincenales · cancela el anticipo", "Entrepiso y Escaleras", 1932063.5, "", "", 1932063.5, "Efectivo", "Pendiente", '', 46280, '', '', '', '', '', '', '', '', '', ""],
  /* 99 */ ['', '', 46239, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 47.590.272 — Pisos Industriales · saldo del anticipo · cancela el anticipo", "Saldo anticipo 50% Pisos Industriales — cancela el anticipo · fecha estimada 15/09, confirmar", 17553946, "", "", 17553946, "Efectivo", "Pendiente", '', 46280, '', '', '', '', '', '', '', '', '', "ARS"],
])

/** Las dos carteras juntas, en sus filas reales — como las lee el generador de la pestaña entera. */
export const FILAS_COBRANZAS = Object.freeze([
  ...vacias(6),
  /* 7 */ ['', '', 46006, "FA", "01-00000201", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "Certificado 2", "", 15000000, 3150000, "", 18150000, "Transferencia", "Cobrado", '', 46037, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(12),
  /* 20 */ ['', '', 46199, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 10000000, "", "", 10000000, "Efectivo", "Cobrado", '', 46185, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(3),
  /* 24 */ ['', '', 46147, "FA", "01-00000211", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "Certificado 3", "", 20000000, 4200000, "", 24200000, "Transferencia", "Cobrado", '', 46150, '', '', '', '', '', '', '', '', '', ""],
  /* 25 */ ['', '', 46150, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 20000000, "", "", 20000000, "Efectivo", "Cobrado", '', 46150, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(2),
  /* 28 */ ['', '', 46227, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 5000000, "", "", 5000000, "Efectivo", "Cobrado", '', 46199, '', '', '', '', '', '', '', '', '', ""],
  /* 29 */ ['', '', 46227, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 5000000, "", "", 5000000, "Efectivo", "Cobrado", '', 46211, '', '', '', '', '', '', '', '', '', ""],
  /* 30 */ ['', '', 46228, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "", 6215646, "", "", 6215646, "Efectivo", "Cobrado", '', 46219, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(19),
  /* 50 */ ['', '', 46220, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "Pago efectivo — julio 2026", 16200000, "", "", 16200000, "Efectivo", "Cobrado", '', 46220, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(3),
  /* 54 */ ['', '', 46219, "", "", '', "IMOTOR/San Francisco/JAVI SANCHEZ", "", "Cobro efectivo - pago total julio - NO CONSIDERAR", 0, "", "", 0, "Efectivo", "CANCELAR", '', 46220, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(6),
  /* 61 */ ['', '', 46230, "FA", 219, '', "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "U$S 11.500 + IVA — 36,5 % del anticipo 50 % + Materiales", 54279685.38, 11398733.9298, "", 65678419.3098, "Transferencia", "Cobrado", '', 46231, '', '', '', '', '', '', '', '', '', ""],
  /* 62 */ ['', '', 46230, "FA", 220, '', "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 15.400 en dólares", 15400, "", "", 15400, "Efectivo", "Cobrado", '', 46234, '', '', '', '', '', '', '', '', '', "USD"],
  /* 63 */ ['', '', 46230, "FA", 220, '', "Quattropani - Melisa García SAS", "Anticipo 50% inicio obra ", "U$S 20.000 — 63,5 % del anticipo 50 % · parte U$S 4.600 = $ 7.130.000 a TC 1.550", 7130000, "", "", 7130000, "Efectivo", "Cobrado", '', 46234, '', '', '', '', '', '', '', '', '', ""],
  /* 64 */ ['', '', 46231, "FA", 220, '', "Quattropani - Melisa García SAS", "", "IVA de Factura 220", 0, 6510000, 0, 6510000, "Transferencia", "Cobrado", '', 46253, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(1),
  /* 66 */ ['', '', 46239, "", "", '', "San Francisco", "Anticipo inicio obra Pisos Industriales - Total Obra: $47.590.272", "Pisos Industriales", 6241190, "", "", 6241190, "Efectivo", "Cobrado", '', 46255, '', '', '', '', '', '', '', '', '', ""],
  /* 67 */ ['', '', 46244, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 40.000.000 Cotización n° — 1ª de 2 cuotas quincenales", "Instalaciones Eléctricas", 10000000, "", "", 10000000, "Efectivo", "Pendiente", '', 46262, '', '', '', '', '', '', '', '', '', ""],
  /* 68 */ ['', '', 46244, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 7.728.254 Cotización n° — 1ª de 2 cuotas quincenales", "Entrepiso y Escaleras", 1932063.5, "", "", 1932063.5, "Efectivo", "Pendiente", '', 46262, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(2),
  /* 71 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 1/4", "Pisos Industriales - Certificación 1/4", 5950000, "", "", 5950000, "Efectivo", "Pendiente", '', 46295, '', '', '', '', '', '', '', '', '', ""],
  /* 72 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 2/4", "Pisos Industriales - Certificación 2/4", 5950000, "", "", 5950000, "Efectivo", "Pendiente", '', 46310, '', '', '', '', '', '', '', '', '', ""],
  /* 73 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 3/4", "Pisos Industriales - Certificación 3/4", 5950000, "", "", 5950000, "Efectivo", "Pendiente", '', 46325, '', '', '', '', '', '', '', '', '', ""],
  /* 74 */ ['', '', 46239, "", "", '', "San Francisco", "Resto 50% s/ total 47.590.272 — certificación quincenal 4/4", "Pisos Industriales - Certificación 4/4", 5945136, "", "", 5945136, "Efectivo", "Pendiente", '', 46340, '', '', '', '', '', '', '', '', '', ""],
  /* 75 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 1/4", "Instalaciones Eléctricas - Certificación 1/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46295, '', '', '', '', '', '', '', '', '', ""],
  /* 76 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 2/4", "Instalaciones Eléctricas - Certificación 2/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46310, '', '', '', '', '', '', '', '', '', ""],
  /* 77 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 3/4", "Instalaciones Eléctricas - Certificación 3/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46325, '', '', '', '', '', '', '', '', '', ""],
  /* 78 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 40.000.000 — certificación quincenal 4/4", "Instalaciones Eléctricas - Certificación 4/4", 5000000, "", "", 5000000, "Efectivo", "Pendiente", '', 46340, '', '', '', '', '', '', '', '', '', ""],
  /* 79 */ ['', '', 46244, "", "", '', "San Francisco", "Resto 50% s/ total 7.728.254 — certificación quincenal 1/1", "Entrepiso y Escaleras - Certificación 1/1", 3864127, "", "", 3864127, "Efectivo", "Pendiente", '', 46295, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(4),
  /* 84 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9", "Salón Comercial - Certificación 1/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46266, '', '', '', '', '', '', '', '', '', ""],
  /* 85 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 2/9", "Salón Comercial - Certificación 2/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46281, '', '', '', '', '', '', '', '', '', ""],
  /* 86 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 3/9", "Salón Comercial - Certificación 3/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46296, '', '', '', '', '', '', '', '', '', ""],
  /* 87 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 4/9", "Salón Comercial - Certificación 4/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46311, '', '', '', '', '', '', '', '', '', ""],
  /* 88 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 5/9", "Salón Comercial - Certificación 5/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46326, '', '', '', '', '', '', '', '', '', ""],
  /* 89 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 6/9", "Salón Comercial - Certificación 6/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46341, '', '', '', '', '', '', '', '', '', ""],
  /* 90 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 7/9", "Salón Comercial - Certificación 7/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46356, '', '', '', '', '', '', '', '', '', ""],
  /* 91 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 8/9", "Salón Comercial - Certificación 8/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46371, '', '', '', '', '', '', '', '', '', ""],
  /* 92 */ ['', '', 46252, "", "", '', "Quattropani - Melisa García SAS", "Resto 50% s/ contrato 97.650.000 — certificación quincenal 9/9", "Salón Comercial - Certificación 9/9", 5425000, 1139250, "", 6564250, "Transferencia", "Pendiente", '', 46386, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(2),
  /* 95 */ ['', '', 46253, "", "", '', "San Francisco", "Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra", "Mampostería y cancha de padel", 8758810, "", "", 8758810, "Efectivo", "Cobrado", '', 46255, '', '', '', '', '', '', '', '', '', ""],
  /* 96 */ ['', '', 46234, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 40.000.000 — 2ª de 2 cuotas quincenales · cancela el anticipo", "Instalaciones Eléctricas", 10000000, "", "", 10000000, "Efectivo", "Pendiente", '', 46280, '', '', '', '', '', '', '', '', '', ""],
  /* 97 */ ['', '', 46234, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 7.728.254 — 2ª de 2 cuotas quincenales · cancela el anticipo", "Entrepiso y Escaleras", 1932063.5, "", "", 1932063.5, "Efectivo", "Pendiente", '', 46280, '', '', '', '', '', '', '', '', '', ""],
  ...vacias(1),
  /* 99 */ ['', '', 46239, "", "", '', "San Francisco", "Anticipo inicio obra 50% $ 47.590.272 — Pisos Industriales · saldo del anticipo · cancela el anticipo", "Saldo anticipo 50% Pisos Industriales — cancela el anticipo · fecha estimada 15/09, confirmar", 17553946, "", "", 17553946, "Efectivo", "Pendiente", '', 46280, '', '', '', '', '', '', '', '', '', "ARS"],
])

/**
 * `OBRAS` al 24/08/2026: las cabeceras y las filas de los dos clientes en los cuadros 2, 3 Y 4.
 *
 * EL CUADRO 4 ESTÁ ACÁ A PROPÓSITO. Numera sus filas igual que el 3 ("4.7 · Quattropani … — SALÓN
 * COMERCIAL · 18/08 → 30/12") pero publica COSTOS, no cobranzas. Sin esas filas en el fixture, un
 * lector que busque el patrón en toda la pestaña pasa los tests y en producción le suma al cliente
 * una obra de más, con importes que son compras.
 */
export const FILAS_OBRAS = Object.freeze([
  ...vacias(4),
  /* 5 */ ["Cartera","% venc.","Por vencer","▲ 1–30","▲ 31–60","▲ 61–90","▲ +90","","Total pendiente"],
  ...vacias(3),
  /* 9 */ ["Cliente","% cob.","Venta (neto)","Cobrado (total)","Resta (total)","Vencido","Materiales (neto)","Retenido"],
  ...vacias(1),
  /* 11 */ ["San Francisco","57,3%","186.492.982","119.765.646","89.077.336","—","73.015.183","—"],
  ...vacias(5),
  /* 17 */ ["Quattropani - Melisa García SAS","63,5%","133.476.150","102.559.884","59.078.250","—","32.558.960","—"],
  ...vacias(3),
  /* 21 */ ["Obra","% cert.","Certificado (neto)","Cobrado (total)","Por cobrar (total)","Vencido","Contratado","Falta certificar","Próx. cobro"],
  /* 22 */ ["3.1 · San Francisco — PISOS INDUSTRIALES · 05/08 → 30/09","50,0%","$23.795.136","$6.241.190","$41.349.082","—","$47.590.272","$23.795.136","15/09 · Efectivo"],
  /* 23 */ ["3.2 · San Francisco — INSTALACIÓN ELÉCTRICA · 10/08 → 16/10","150,0%","$60.000.000","—","$40.000.000","—","$40.000.000","($20.000.000)","28/08 · Efectivo"],
  /* 24 */ ["3.3 · San Francisco — ENTREPISO Y ESCALERA · 10/08 → 21/08 ▲","150,0%","$11.592.381","—","$7.728.254","—","$7.728.254","($3.864.127)","28/08 · Efectivo"],
  /* 25 */ ["3.4 · San Francisco — MAMPOSTERÍA · 07/08 → 19/08 ▲","100,0%","$8.758.810","$8.758.810","—","—","$8.758.810","—"],
  ...vacias(2),
  /* 28 */ ["3.7 · Quattropani - Melisa García SAS — SALÓN COMERCIAL · 18/08 → 30/12","100,0%","$97.650.000","$102.559.884","$59.078.250","—","$97.650.000","—","01/09 · Transferencia"],
  /* 29 */ ["⇒ TOTAL — 7 OBRAS", "100,0%", "$318.416.570", "$117.559.884", "$281.391.081", "▲ $17.085.495", "$304.227.336", "($68.991)"],
  ...vacias(2),
  /* 32 */ ["Obra", "% comprado", "Costo proyectado", "Comprado (real)", "Resta proyectado", "Imputado por"],
  /* 33 */ ["4.1 · San Francisco — PISOS INDUSTRIALES · 05/08 → 30/09", "25,9%", "$23.259.946", "$6.031.905", "$17.228.041", "Compras: \"Pisos Industriales\""],
  ...vacias(5),
  /* 39 */ ["4.7 · Quattropani - Melisa García SAS — SALÓN COMERCIAL · 18/08 → 30/12", "83,2%", "$39.151.133", "$32.558.960", "$6.592.173", "Compras: \"Salones Comerciales\""],
])

/** `Calendario de Cobros!A2` — la frase que declara a cuánto se valúa el dólar ese día. */
export const CALENDARIO_A2 = "2026 · percibido, por fecha de cobro · importes con IVA netos de retenciones · en itálica lo proyectado · ↳ endosado = cobrado que no pasó por la cuenta · USD valuado a $ 1.509,18600"

