// DÓNDE EMPIEZA EL REGISTRO DE "Tarjeta de Credito" — DECLARADO UNA SOLA VEZ.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// Gemelo de `cheques-emitidos-geometria.mjs`, y por el mismo motivo. El alto de la banda estaba
// escrito a mano en DOS lugares que tenían que coincidir y nada los ataba:
//
//   · `scripts/tarjeta-pestana.mjs`  BANDA = 31            (lo que el generador escribe)
//   · `lib/cash-flow-lineas.mjs`     INSTRUMENTOS.tarjeta.filaCab = 31
//
// De ese 31 cuelgan: el rango que el cash flow suma como "Cuotas de tarjeta sin factura cargada",
// la fila donde `cheques-cobertura-sheet.mjs` estampa "Estado en el OS", y el rango que
// `cash-flow-rehacer.mjs` recorre. El día que la banda cambia de alto —hoy, que pasó a contestar
// cinco preguntas en vez de cuatro— hay que acertarle a los dos, y el que se olvida NO GRITA: los
// rótulos de la banda no son números, así que un rango corrido devuelve cero y parece un cero real.
//
// Acá vive uno solo y los dos lo importan. `tarjeta-geometria.test.mjs` compara lo importado contra
// esto.
//
// ═══ EL TOPE DE 400 ES UN CONTRATO CON CAJA, NO UN NÚMERO REDONDO ═══
//
// CAJA suma el consumo de la tarjeta con
//     SUMPRODUCT((UPPER('Tarjeta de Credito'!$J$3:$J$400)<>"SI")*IF(ISNUMBER($E$3:$E$400);…))
// sobre el rango de columna ENTERO, desde la fila 3 — o sea que la banda cae adentro. Por eso la
// banda NO PUEDE escribir un importe en la columna E ni un "SI" en la J: se sumaría como una compra
// que no existe. Y CAJA está congelada (nadie la regenera), así que un registro que pase de la fila
// 400 desaparece de ese control sin que nada avise.

/** Alto exacto de la banda superior (filas 1..BANDA). La escribe `scripts/tarjeta-pestana.mjs`. */
export const BANDA = 31

/** Fila del encabezado del registro ("Fecha de Compra", "Monto"…). */
export const FILA_HDR = BANDA + 1

/** Primera fila de DATOS del registro. Todo rango que lea compras de tarjeta arranca acá. */
export const FILA_DATO0 = FILA_HDR + 1

/** Última fila que las fórmulas de otras pestañas alcanzan. Ver la nota de arriba: es contrato. */
export const FILA_FIN = 400

/** Rango ABIERTO de una columna del registro ("$E$54:$E"). Para fórmulas de la propia pestaña.
 *  Abierto a propósito: con el rango cerrado, la cuota que se carga en la fila siguiente al tope
 *  queda afuera del control sin que nada avise. */
export const rangoAbierto = (col) => `$${col}$${FILA_DATO0}:$${col}`

/** Rango CERRADO de una columna del registro ("$E$54:$E$400"). */
export const rangoCerrado = (col) => `$${col}$${FILA_DATO0}:$${col}$${FILA_FIN}`
