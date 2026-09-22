// LOS VALORES DEL DISEÑO «Efectivo a rendir» (docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html).
//
// Leídos de los `style=""` inline del .dc.html, donde el atributo ES el valor. La paleta es la de
// `v2/patron.tsx` (el diseño usa exactamente esos colores); lo propio de esta sección son los tamaños.

import type { CSSProperties } from 'react'
import { V } from '@/shared/components/v2/patron'
import type { Tono } from '../logica/entregas'

export { V }

export const MONO = "'IBM Plex Mono', ui-monospace, monospace"
/** Superficie apagada: el panel de «Al confirmar», el fondo detrás de un panel. */
export const SUPERFICIE = '#FAFAF8'
/** Fondo de una fila observada. `D07` (ticket sin proveedor). */
export const FONDO_OBSERVADO = '#FDF6EE'
/** El recuadro verde de «la entrega queda en cero y se cierra». `D06`. */
export const CAJA_POS: CSSProperties = { background: '#F1F9F4', border: '1px solid #D6EBDF' }

/** Rótulo mono 10,5 en versales: tarjetas, columnas, campos. */
export const eyebrow: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase',
}

/** La cifra de una tarjeta de D01: 26/600 mono. */
export const cifra: CSSProperties = { fontSize: '26px', fontWeight: 600, letterSpacing: '-.02em', fontFamily: MONO }
/** La cifra de la cuenta de D03: 18/600 mono. */
export const cifraFicha: CSSProperties = { fontSize: '18px', fontWeight: 600, fontFamily: MONO }

/** El botón oscuro del diseño (no el amarillo): «Entregar efectivo», «Registrar y cerrar». */
export const botonOscuro: CSSProperties = {
  height: 34, padding: '0 16px', background: V.grafito, color: '#FFFFFF', borderRadius: 6, border: 0,
  display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
}
export const botonClaro: CSSProperties = {
  height: 34, padding: '0 14px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, background: '#FFFFFF',
  display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '13px', color: V.tintaSuave, cursor: 'pointer', whiteSpace: 'nowrap',
}
/** Los del pie de un panel: 38px. */
export const botonOscuroGrande: CSSProperties = { ...botonOscuro, height: 38, padding: '0 18px', fontSize: '13.5px' }
export const botonClaroGrande: CSSProperties = { ...botonClaro, height: 38 }
export const botonPeligro: CSSProperties = {
  height: 38, padding: '0 14px', border: 0, background: 'transparent', color: V.neg, fontSize: '13px', cursor: 'pointer',
}

/** Chip de recorte de lista: `Abiertas · Todas · Por obra`. */
export function chip(activo: boolean): CSSProperties {
  return {
    height: 26, padding: '0 10px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', fontSize: '12.5px',
    border: `1px solid ${activo ? V.grafito : V.lineaFuerte}`, color: activo ? V.tinta : V.apagado, fontWeight: activo ? 500 : 400,
  }
}

/** Campo de formulario de panel: 34px. */
export const campo: CSSProperties = {
  height: 34, padding: '0 11px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, fontSize: '13.5px',
  color: V.tinta, background: '#FFFFFF', width: '100%', outline: 'none',
}
export const campoMonto: CSSProperties = { ...campo, fontSize: '14px', fontFamily: MONO }
export const areaTexto: CSSProperties = {
  ...campo, height: 'auto', minHeight: 58, padding: '9px 11px', lineHeight: 1.5, color: V.tintaSuave, resize: 'vertical',
}

/** El recuadro «Al confirmar». */
export const cajaConfirmar: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: SUPERFICIE,
  border: `1px solid ${V.linea}`, borderRadius: 10,
}

export const COLOR_TONO: Record<Tono, string> = {
  pos: V.pos, warn: V.warn, neg: V.neg, neutro: V.tintaSuave, apagado: V.tenue,
}

/** El punto de 7px de un estado. El neutro es gris (`D01`, «Rindiendo»). */
export function punto(tono: Tono): CSSProperties {
  return { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: tono === 'neutro' ? V.tenue : COLOR_TONO[tono] }
}

/**
 * EL ANCHO TOTAL DEL PANEL AL COSTADO (`D02`): 520px, con el filo y el padding adentro
 * (`border-box`, preflight de Tailwind). Es el mismo número que la cabecera reserva como hueco
 * (`espacioPanel`): si acá cambia y allá no, el botón oscuro se monta encima del panel.
 */
export const ANCHO_PANEL = 520
/** El panel del comprobante observado es más ancho: la foto y la respuesta conviven. `D05`. */
export const ANCHO_PANEL_OBSERVADO = 560

/** El panel al costado: 520px, filo izquierdo. `D02`. */
export const panel: CSSProperties = {
  width: ANCHO_PANEL, flexShrink: 0, background: '#FFFFFF', borderLeft: `1px solid ${V.lineaFuerte}`,
  padding: '26px 28px 30px', display: 'flex', flexDirection: 'column', gap: 22,
}
