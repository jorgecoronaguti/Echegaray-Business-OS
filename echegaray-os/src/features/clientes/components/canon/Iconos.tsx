// LOS ÍCONOS DE LOS MOCKUPS 28 · 31 · 32, COPIADOS TRAZO POR TRAZO.
//
// El `d` no se redibuja ni se cambia por «el equivalente» de otra familia: el triángulo de alerta
// de esta tanda arranca en `M12 3l9 16H3z` y el de los mockups viejos en `M12 4l9 16H3z` — un
// píxel de altura y otra proporción. El que se parece nunca es el mismo.
//
// El tamaño y el grosor son props porque el zip los cambia por lugar: 11px en una tendencia, 12px
// en una pastilla, 13px dentro de un botón, 14–16px en una fila o una cabecera; `strokeWidth` 1,9
// en los contornos, 2 en los estados y 2,2–3 en los tildes.

import type { CSSProperties, ReactNode } from 'react'

export function Ico({ d, s = 15, w = 1.9, style }: {
  d: ReactNode
  s?: number
  w?: number
  style?: CSSProperties
}) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ display: 'block', flexShrink: 0, ...style }}>
      {d}
    </svg>
  )
}

/** Los trazos, con el mockup y la línea de donde salió cada uno. */
export const P = {
  /** Triángulo de atención (28:42, 28:249). */
  alerta: <><path d="M12 3l9 16H3z" /><path d="M12 9v4.5M12 16.5h.01" /></>,
  /** Sobre: mail, aviso, recordatorio (28:56). */
  mail: <><path d="M4 5h16v14H4z" /><path d="M4 9l8 5 8-5" /></>,
  /** Globo: «ver como lo ve el cliente» en 28 (28:51). En 32 ese mismo botón lleva el ojo. */
  globo: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" /></>,
  /** Ojo: ve la obra (31:96), y «ver como lo ve el cliente» en 32 (32:46). */
  ojo: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></>,
  /** Flecha hacia abajo a una base: descargar, exportar (28:59). */
  bajar: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />,
  /** Tilde suelto (28:62). */
  ok: <path d="M5 13l4 4L19 7" />,
  /** Tilde dentro de un círculo: cobrado, aprobado (28:314). */
  okCirculo: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.6 2.6L16 9.5" /></>,
  /** Reloj: «a vencer» (28:203). */
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5l3 2" /></>,
  /** Círculo vacío: previsto, todavía sin emitir (32:238). */
  circulo: <circle cx="12" cy="12" r="9" />,
  /** Barras crecientes: antigüedad (28:116). */
  barras: <><path d="M4 20V9M10 20V4M16 20v-7" /><path d="M3 20h18" /></>,
  /** Barras del comportamiento de pago (28:614). */
  barras2: <><path d="M4 20V9M10 20v-6M16 20V5" /><path d="M3 20h18" /></>,
  /** Hoja con doblez: certificados y facturas (28:174). */
  documento: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  /** Calendario (28:338). */
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  /** Calendario con tilde: promesa de pago (28:251). */
  calendarioOk: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" /></>,
  /** Calendario tachado: sin fecha, remedición pendiente (28:288). */
  calendarioX: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M10 15l4 4M14 15l-4 4" /></>,
  /** Bocadillo: observación del cliente, disputa (28:281). */
  chat: <path d="M20 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h12a2 2 0 012 2z" />,
  /** Teléfono: llamada de gestión (28:243). */
  telefono: <path d="M5 3h4l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z" />,
  /** Escudo: retenido, fondo de reparo, reglas del portal (28:302). */
  escudo: <path d="M12 3l8 4v6c0 4.2-3.2 7.4-8 8-4.8-.6-8-3.8-8-8V7z" />,
  /** Renglones: el plan del día (28:369) y la vista Listado (32:82). */
  lista: <path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" />,
  /** Cruz de cerrar (28:471). */
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  /** Flecha hacia arriba: mejora, escalar (28:99, 28:600). */
  arriba: <path d="M12 19V5M6 11l6-6 6 6" />,
  /** Más (32:52, 31:60). */
  mas: <path d="M12 5v14M5 12h14" />,
  /** Flecha a una barra: publicar al cliente (32:56). */
  publicar: <path d="M4 12h11M11 7l5 5-5 5M20 5v14" />,
  /** Flecha circular: descartar cambios, historial (32:49). */
  volver: <path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" />,
  /** Flecha circular con reloj: registro de ingresos, cambios del esquema (31:50, 32:507). */
  historial: <><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" /><path d="M12 8v4.5l3 2" /></>,
  /** Lápiz: editar en la fila (32:139). */
  lapiz: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>,
  /** Candado: el dato no se edita acá, o la nota nunca sale (32:435). */
  candado: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>,
  /** Círculo con «i» (32:424). */
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></>,
  /** Chevrones del selector de fecha y del calendario (32:417, 32:290, 32:296). */
  chevronAbajo: <path d="M6 9l6 6 6-6" />,
  chevronIzq: <path d="M15 6l-6 6 6 6" />,
  chevronDer: <path d="M9 6l6 6-6 6" />,
  /** Tacho: quitar del esquema (32:497). */
  tacho: <path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13" />,
  /** Pausa dentro de un círculo: suspender el portal (31:53). */
  pausa: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5v5M14.5 9.5v5" /></>,
  /** Tarjeta: ve montos y facturas (31:99). */
  montos: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.4" /></>,
  /** Bandeja con tilde: aprueba certificados (31:102). */
  aprueba: <><path d="M9 11l3 3 7-7" /><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h8" /></>,
  /** Seis puntos: «arrastre un pago para cambiarle la fecha» (32:300). */
  arrastrar: <path d="M9 5h1M14 5h1M9 12h1M14 12h1M9 19h1M14 19h1" />,
} as const
