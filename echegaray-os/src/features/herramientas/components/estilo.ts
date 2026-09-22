// LOS VALORES DEL DISEÑO «Herramientas · el módulo entero» (docs/diseno/herramientas/herramientas-modulo.dc.html).
//
// Leídos de los `style=""` inline del .dc.html, donde el atributo ES el valor. Los colores son los
// tokens de `v2/patron.tsx` (el diseño usa exactamente esa paleta), así que no hay color nuevo.

import type { CSSProperties } from 'react'
import { V } from '@/shared/components/v2/patron'
import type { TonoEstado } from '../logica/parque'

export { V }

/** Azul de los iconos de acción (buscar, decisiones de información). `D01`. */
export const AZUL = '#175CD3'
/** Superficie apagada del panel y la foto vacía. */
export const SUPERFICIE = '#FAFAF8'

export const MONO = "'IBM Plex Mono', ui-monospace, monospace"

/** Rótulo de columna / de bloque: mono 10,5 en versales. `D01:74`. */
export const eyebrow: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase',
}

/** Título de página: 19/600. `D01:44`. */
export const tituloPagina: CSSProperties = { fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em', color: V.tinta }
export const bajadaPagina: CSSProperties = { fontSize: '13px', color: V.apagado }
/** Título de bloque: 14/600. `D01:96`. */
export const tituloBloque: CSSProperties = { fontSize: '14px', fontWeight: 600, color: V.tinta }
/** Contenedor de página: `padding:26px 30px 34px`. `D01:41`. */
export const pagina: CSSProperties = { padding: '26px 30px 34px', display: 'flex', flexDirection: 'column', gap: 26 }

export const botonPrimario: CSSProperties = {
  height: 32, padding: '0 14px', border: 0, borderRadius: 6, background: V.marca, color: V.grafito,
  fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
}
export const botonSecundario: CSSProperties = {
  height: 32, padding: '0 14px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, background: '#FFFFFF',
  color: V.tinta, fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
}
/** Los botones grandes del pie de un panel: 38px. `D05:70`. */
export const botonPrimarioGrande: CSSProperties = { ...botonPrimario, height: 38, padding: '0 18px', fontSize: '13.5px' }
export const botonSecundarioGrande: CSSProperties = { ...botonSecundario, height: 38, padding: '0 16px', fontSize: '13.5px' }
export const botonPeligro: CSSProperties = { ...botonPrimarioGrande, background: V.neg, color: '#FFFFFF' }

/** Campo de texto de panel: 38px, filo fuerte. `D05:62`. */
export const campo: CSSProperties = {
  height: 38, padding: '0 12px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13.5px',
  color: V.tinta, background: '#FFFFFF', width: '100%', outline: 'none',
}
/** Pastilla de destino rápido. `D05:32`. */
export const chip: CSSProperties = {
  height: 28, padding: '0 10px', border: `1px solid ${V.linea}`, borderRadius: 6, display: 'inline-flex',
  alignItems: 'center', gap: 6, fontSize: '12.5px', color: V.tintaSuave, background: '#FFFFFF', cursor: 'pointer',
}

export const COLOR_TONO: Record<TonoEstado, string> = {
  pos: V.pos, warn: V.warn, neutro: V.tintaSuave, apagado: V.tenue,
}

/** «vacío no es cero»: el texto de lo que falta va en itálica y tenue. `D02: sin categoría`. */
export const vacio: CSSProperties = { fontStyle: 'italic', color: V.tenue }
