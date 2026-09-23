// QUÉ CAMBIA EN EL TELÉFONO, DECIDIDO EN UN SOLO LUGAR (dueño, 23/09/2026: toda pantalla de
// escritorio se usa a 390px). Las pantallas «porte literal» del canon miden en píxeles en línea y no
// con clases responsive, así que el ancho de la ventana tiene que ser un DATO —`useAnchoVentana`—
// y la regla que lo convierte en una medida vive acá, sin JSX, para poder probarla con `node --test`.

/** Por debajo de esto la pantalla es un teléfono: no entra una columna fija de 340px al lado de otra. */
export const ANCHO_TELEFONO = 640

export const esAngosto = (anchoVentana: number): boolean => anchoVentana < ANCHO_TELEFONO

/** Ancho de la columna de actividades del cronograma de obra (07). 340 es el del mockup; en el
 *  teléfono se achica para que el lienzo conserve por lo menos la mitad del ancho y se pueda
 *  arrastrar. El nombre de la actividad sigue truncando con puntos suspensivos. */
export const ANCHO_TABLA_CRONOGRAMA = 340
export const ANCHO_TABLA_CRONOGRAMA_TELEFONO = 170
export const anchoTablaCronograma = (anchoVentana: number): number =>
  esAngosto(anchoVentana) ? ANCHO_TABLA_CRONOGRAMA_TELEFONO : ANCHO_TABLA_CRONOGRAMA

/** El simulador de dotación (08): 428px fijos al lado del impacto en escritorio; en el teléfono
 *  cada columna ocupa el ancho entero y el impacto va DEBAJO del simulador. */
export const anchoSimuladorDotacion = (anchoVentana: number): string =>
  esAngosto(anchoVentana) ? '100%' : '428px'
export const anchoMinimoImpactoDotacion = (anchoVentana: number): string =>
  esAngosto(anchoVentana) ? '0' : '420px'

/** El avance masivo (lote) es una grilla de seis columnas con 406px fijos: en el teléfono scrollea
 *  POR DENTRO de la tarjeta con este mínimo, y la página nunca se corre de costado. */
export const ANCHO_MINIMO_TABLA_MASIVA = 760
