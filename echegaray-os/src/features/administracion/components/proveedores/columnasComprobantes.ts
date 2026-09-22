// LAS COLUMNAS DE LA LISTA DE COMPRAS DEL PROVEEDOR, EN UN MÓDULO SIN 'use client'.
//
// Las usan el encabezado (Server Component) y la fila (cliente). Cuando vivían en la fila, el
// servidor recibía la constante como una referencia de cliente —un proxy, no el string— y el
// encabezado se dibujaba con un className basura y sin grid: las columnas apiladas en todos los
// anchos (QA, 14/09/2026). Un valor que cruzan los dos lados vive acá; un archivo 'use client' sólo
// exporta componentes.

/** FECHA · CONCEPTO Y Nº · OBRA · IMPORTE · ESTADO · COMPROBANTE. */
export const COLS_COMPROBANTES
  = 'grid-cols-[76px_minmax(180px,1.4fr)_minmax(130px,1fr)_110px_84px_170px]'

/**
 * El ancho debajo del cual la lista scrollea ADENTRO de su caja: la suma de las columnas fijas y
 * los pisos (750), los cinco gaps de 14px (70) y la sangría de 13px. Ninguna columna se suelta a
 * 390px: sin el número o sin el papel la fila deja de decir de qué compra es o si tiene respaldo.
 */
export const ANCHO_MINIMO_COMPRAS = 840

/**
 * D08 · LA MISMA LISTA CUANDO GANA «ENTREGA». Se usa sólo si este proveedor tiene alguna compra
 * pagada con efectivo a rendir Y quien mira ve economía: agregarla siempre pondría una séptima
 * columna vacía en el 95 % de las fichas, y el mockup es explícito en que la ficha no cambia de
 * forma. `ER-0000` mide 92px en mono a 11,5px.
 */
export const COLS_COMPROBANTES_CON_ENTREGA
  = 'grid-cols-[76px_minmax(180px,1.4fr)_minmax(130px,1fr)_110px_84px_170px_92px]'

/** El de arriba, más la columna (92) y su gap (14). */
export const ANCHO_MINIMO_COMPRAS_CON_ENTREGA = ANCHO_MINIMO_COMPRAS + 92 + 14
