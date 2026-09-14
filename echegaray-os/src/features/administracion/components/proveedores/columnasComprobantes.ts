// LAS COLUMNAS DE LA TABLA «COMPROBANTES», EN UN MÓDULO SIN 'use client'.
//
// Las usan el encabezado (Server Component) y la fila (cliente). Cuando vivían en la fila, el
// servidor recibía la constante como una referencia de cliente —un proxy, no el string— y el
// encabezado se dibujaba con un className basura y sin grid: las seis columnas apiladas en todos los
// anchos (QA, 14/09/2026). Un valor que cruzan los dos lados vive acá; un archivo 'use client' sólo
// exporta componentes.

export const COLS_COMPROBANTES
  = 'grid-cols-[76px_minmax(150px,1.2fr)_minmax(130px,1fr)_110px_84px_150px]'
