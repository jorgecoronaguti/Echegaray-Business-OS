// LAS COLUMNAS DE `_IIBB_RAW` — la réplica de las DDJJ de Rentas que escribe el propio OS.
//
// Vivía en `impuestos-fuentes.mjs`, al lado de las lecturas de Cobranzas. Se separa (14/09/2026)
// porque este layout NO es de Cobranzas ni de Compras: lo escribe `escribirIIBBRaw` con el orden de
// `IIBB_COLS`, y la columna «Obra» no entra acá. Mezclado con las lecturas de Cobranzas, un mapa de
// letras fijas legítimo se confundía con los que sí tenían que salir del rótulo.

/** Dónde vive cada columna de _IIBB_RAW, para no buscarla por posición a ojo. Sigue a `IIBB_COLS`. */
export const IIBB_COL = Object.freeze({ periodo: 'A', base: 'B', alicuota: 'C', impuesto: 'D', retenciones: 'E', saldoAnt: 'F' })
