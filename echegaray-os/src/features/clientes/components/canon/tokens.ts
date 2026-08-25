// LOS VALORES MEDIDOS EN LOS MOCKUPS 28 · 31 · 32 DE `echegaray-design-v2`.
//
// ═══ POR QUÉ NO SE REUSA `features/obras/components/canon/tokens.ts` ═══
//
// Ese archivo transcribe los mockups 01–06 del zip VIEJO y sus neutros semánticos NO son los de
// esta tanda: el fondo de la pastilla negativa es `#FEF6F5` allá y `#FEF3F2` en `28:42`; el borde,
// `#F3DDDA` contra `#FBD9D4`; el fondo warn, `#FDF6EE` contra `#FEF7EE` (`32:26`). Son dos y tres
// puntos de diferencia por regla — exactamente el mecanismo por el que las cuatro entregas
// anteriores terminaron «parecidas y distintas». Cuando el diseño converja, se fusionan midiendo,
// no acordándose.
//
// Cada color lleva el archivo y la línea de donde salió. Cambiar uno sin abrir el `.dc.html` es
// volver a empezar.

import type { CSSProperties } from 'react'

export const C = {
  /** `body{background:#F7F7F5}` (28:14). */
  lienzo: '#F7F7F5',
  superficie: '#FFFFFF',
  /** Fondo de la fila de total y de las celdas de fin de semana (32:283, 32:330). */
  tenueFondo: '#FAFAF8',
  /** Borde de tarjeta y de encabezado de tabla (28:180). */
  borde: '#E7E6E2',
  /** Divisor entre filas de tabla (28:189). */
  bordeFila: '#EFEEEA',
  /** Divisor dentro de una tarjeta, entre dos interruptores (32:451). */
  bordeLista: '#F5F4F0',
  /** Divisor vertical entre celdas del trío MONTO/VENCIÓ/ATRASO (28:474). */
  bordeCelda: '#F1F0EC',
  /** Borde de control en hover (28:52). */
  bordeFuerte: '#D7D5CF',
  /** Borde del control de fecha del panel, más oscuro que el de tabla (32:414). */
  bordeCampo: '#D7D5CF',

  tinta: '#1F1F1E',
  tintaMedia: '#3A3A38',
  tintaSuave: '#6B6B67',
  tenue: '#91918B',
  /** Gris del ícono apagado: un permiso que NO tiene (31:150). */
  apagado: '#D7D5CF',
  /** El guion de una celda sin dato (28:264). */
  fantasma: '#C9C7C1',
  /** El número de un día que no es de este mes (32:331). */
  fantasmaFuerte: '#C4C2BC',

  marca: '#FDC900',
  marcaHover: '#EEBE00',
  /** Fondo del chip elegido y del conmutador activo (32:445, 32:96). */
  marcaSuave: '#FEF9E6',
  /** Borde del chip elegido (32:445). */
  marcaBorde: '#F5E4A8',
  /** Fondo de la celda con cambio sin publicar (32:200) y del día de hoy (32:317). */
  marcaTenue: '#FFFDF5',
  grafito: '#30302F',
  grafitoHover: '#1F1F1E',

  pos: '#067647',
  posFondo: '#F1F9F4',
  posBorde: '#D6EBDF',

  /** «A vencer» y todo lo que está en camino (28:203). */
  curso: '#175CD3',
  cursoFondo: '#EFF5FF',

  /** «En disputa», «promesa», «sin publicar» (28:253). */
  warn: '#B54708',
  warnFondo: '#FEF7EE',
  warnBorde: '#F0DCC0',

  /** «Vencido» (28:41). */
  neg: '#B42318',
  negFondo: '#FEF3F2',
  negBorde: '#FBD9D4',
  /** La banda 31–60 de la antigüedad: el rojo más oscuro (28:127). */
  negFuerte: '#912018',
  /** Fondo de la banda 1–30 (28:123). */
  negSuave: '#FDE2DE',
  /** Fondo de la banda 31–60 (28:127). */
  negMedio: '#F7BFB8',
  /** El canal de una barra de comportamiento (28:620). */
  canal: '#EFEEEA',
} as const

/** `fontFamily:'IBM Plex Mono',monospace` del zip, servida por `layout.tsx`. */
export const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace"

/** La primaria amarilla de la cabecera (28:60) y del pie del panel (32:490). */
export const PRIMARIA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', background: C.marca, color: C.tinta,
  fontSize: '12.5px', fontWeight: 600, borderRadius: '6px', padding: '7px 12px', cursor: 'pointer',
  border: 'none', fontFamily: 'inherit', lineHeight: 1.4, whiteSpace: 'nowrap',
}

/** La secundaria blanca con borde: «Agregar pago» (32:53), «Cancelar» (32:494). */
export const SECUNDARIA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', background: C.superficie,
  border: `1px solid ${C.borde}`, color: C.tinta, fontSize: '12.5px', fontWeight: 500,
  borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit',
  lineHeight: 1.4, whiteSpace: 'nowrap',
}

/** La acción oscura del plan de cobranza (28:404): grafito, 11,5px/500, `padding:6px 11px`. */
export const ACCION_PLAN: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', background: C.grafito, color: C.superficie,
  fontSize: '11.5px', fontWeight: 500, borderRadius: '6px', padding: '6px 11px', cursor: 'pointer',
  border: 'none', fontFamily: 'inherit', lineHeight: 1.4, whiteSpace: 'nowrap',
}

/** El cuadrado con borde que lleva un solo ícono. 31px en la cabecera (28:52), 30px en una fila
 *  (32:139), 29px al lado de una acción del plan (28:408). */
export function botonIcono(lado: 29 | 30 | 31 = 31): CSSProperties {
  return {
    width: `${lado}px`, height: `${lado}px`, borderRadius: '6px', border: `1px solid ${C.borde}`,
    background: C.superficie, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: C.tintaSuave, cursor: 'pointer', padding: 0, flexShrink: 0,
  }
}

/** La tarjeta del panel lateral (28:466, 32:400, 31:229). */
export const TARJETA: CSSProperties = {
  background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px', overflow: 'hidden',
}

/** El rótulo de columna de toda tabla del zip: 9,5px, `letterSpacing:.05em` (28:181). */
export const ROTULO_COL: CSSProperties = {
  fontSize: '9.5px', color: C.tenue, letterSpacing: '.05em', paddingBottom: '7px',
}

/** El rótulo de campo dentro de un panel: 11px (32:411) — 10,5px cuando corona una métrica
 *  (28:84). Se distinguen porque el segundo va sobre un número grande. */
export const ROTULO_CAMPO: CSSProperties = {
  fontSize: '11px', color: C.tenue, letterSpacing: '.05em',
}

/** El encabezado de un bloque suelto (sin tarjeta): ícono tenue + título 12,5px/600 (28:113). */
export const TITULO_BLOQUE: CSSProperties = {
  fontSize: '12.5px', fontWeight: 600, color: C.tinta,
}
