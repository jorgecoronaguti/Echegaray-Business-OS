// LAS COLUMNAS DE LAS DOS FUENTES DE CAJA QUE NO SON COMPRAS NI COBRANZAS: el extracto y los cheques.
//
// Vivían en `caja-posterior-al-corte.mjs` junto a los mapas de Compras y Cobranzas. Desde el
// 14/09/2026 esos dos se arman con las columnas resueltas por rótulo (la inserción de «Obra» corre sus
// letras) y éstos NO: la réplica `_BANCO_RAW` la escribe su propio generador con un layout fijo, y
// «Cheques Emitidos» no recibe la columna nueva. Separarlos deja a la vista qué letras siguen fijas a
// propósito, en vez de mezclarlas con las que ya no pueden serlo.

/** Las columnas de Cheques Emitidos. I es la fecha en que se debita, K el SI/NO. Rango ABIERTO. */
export const CHQ = { hoja: 'Cheques Emitidos', importe: 'F', fechaPago: 'I', debitado: 'K', desde: 2 }

/** La réplica del extracto y sus columnas para detectar depósitos de efectivo (mismo criterio que la
 *  alerta de trazabilidad del efectivo en CAJA): A=fecha, B=concepto, C=importe, E=entra/sale. */
export const DEP = { hoja: '_BANCO_RAW', fecha: 'A', concepto: 'B', importe: 'C', flujo: 'E', desde: 4 }

/** La réplica de Efectivo a rendir (22/09/2026, scripts/efectivo-raw-pestana.mjs): A=fecha,
 *  B=entrega (ER-nnnn), C=persona, E=movimiento («Entrega» | «Devolución»), F=importe con su signo
 *  para la caja (la entrega negativa), G=instante REAL de registro en la base (25/09/2026: a
 *  diferencia de Compras/Cobranzas/Jornales — que no guardan hora en ninguna fuente, medido en
 *  caja-ancla-por-instante.mjs —, `efectivo_movimiento_caja` sí trae `registrado_en` con hora. El
 *  mismo día del conteo deja de ser un empate: se ordena de verdad contra el sello. La lee CAJA por
 *  fórmula y el libro (libro-extractores-rendir). */
export const RENDIR = { hoja: '_EFECTIVO_RAW', fecha: 'A', entrega: 'B', persona: 'C', movimiento: 'E', importe: 'F', instante: 'G', desde: 4 }
