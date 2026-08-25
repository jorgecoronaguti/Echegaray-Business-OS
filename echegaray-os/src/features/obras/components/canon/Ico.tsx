// LOS ÍCONOS DEL ZIP, COPIADOS PATH POR PATH.
//
// El mockup declara cada ícono como una cadena de `<path>` sobre un lienzo 24×24 con
// `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"` y lo inyecta con
// `dangerouslySetInnerHTML`. Acá viven los MISMOS trazos como JSX: el `d` no se redibuja ni se
// reemplaza por el ícono «equivalente» del design system, porque el que se parece nunca es el
// mismo — el reloj del DS tiene la aguja en otro ángulo y el triángulo, otra proporción.
//
// El tamaño y el grosor son props porque el zip los cambia según el lugar: 12,5px en la sub-línea
// del panel, 14px en una fila, 15px en una cabecera de tarjeta, y `strokeWidth` 2,4 en los checks.

import type { ReactNode } from 'react'

export function Ico({ d, s = 14, w = 2, className, style }: {
  d: ReactNode
  /** Lado en px. El zip usa 11 · 12 · 12,5 · 13 · 14 · 15 · 16 según el lugar. */
  s?: number
  /** `strokeWidth`. 2 por defecto; 2,2 y 2,4 en los checks del zip. */
  w?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className={className} style={{ display: 'block', flexShrink: 0, ...style }}>
      {d}
    </svg>
  )
}

/** Los trazos, con el mockup del que salió cada uno entre paréntesis. */
export const P = {
  /** Casita de obra (01 fila, 02 ficha, 04 sub-línea). */
  obra: <><path d="M3 21h18M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" /></>,
  /** Edificio del cliente (02 meta, 02 ficha). */
  cliente: <path d="M4 21V6l8-3v18M12 21h8V10l-8-3" />,
  /** Una persona (02 meta, 04 recursos, 03 fila). */
  persona: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="3.6" /></>,
  /** Dos personas: la cuadrilla (03, 04, 05). */
  cuadrilla: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M22 21v-2a4 4 0 00-3-3.8" /></>,
  /** Calendario (01 plazo, 02 métricas, 03 meta). */
  fecha: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  /** Reloj: HH y «en curso» (01 chip, 02 métrica, 04). */
  hh: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5l3 2" /></>,
  /** Signo pesos (02 métrica y ficha). */
  dinero: <path d="M12 3v18M8 7h6.5a2.5 2.5 0 010 5H9.5a2.5 2.5 0 000 5H16" />,
  /** Barras: avance físico (02 métrica, 04 historial). */
  avance: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  /** Triángulo de atención (01 ⚠, 02, 03 fila, 05, 06). */
  alerta: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" /></>,
  /** Círculo con «!»: bloqueo/impedimento (01 chip, 02, 03 panel, 04). */
  bloqueo: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 16v.01" /></>,
  /** Círculo con «i»: información (04 solapa avance, 06 pie sin selección). */
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.01" /></>,
  /** Tilde (01 HOY, 02 preparación, 05 registrar, 06 casilla). */
  ok: <path d="M5 13l4 4L19 7" />,
  /** Círculo vacío: paso pendiente (04). */
  pend: <circle cx="12" cy="12" r="8.5" />,
  /** Cajón: obra en «Previo» (01 chip). */
  previo: <path d="M4 7h16M7 7V4h10v3M6 7l1 13h10l1-13" />,
  /** Tres renglones: «Todo» (01 chip). */
  todo: <path d="M4 6h16M4 12h16M4 18h16" />,
  /** Grilla: ver como tabla (01 conmutador). */
  tabla: <path d="M3 5h18v14H3zM3 10h18M9 10v9" />,
  /** Tres renglones desparejos: ver línea de tiempo (01 conmutador). */
  tiempo: <path d="M4 7h9M8 12h11M4 17h7" />,
  /** Lupa (01, 03, 06). */
  buscar: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></>,
  /** Cruz: limpiar y cerrar (01, 03, 04). */
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  /** Chevron a la derecha (01 caret, 02 filas, 04). */
  derecha: <path d="M9 6l6 6-6 6" />,
  /** Chevron abajo (05 desplegable, 06 ver más). */
  abajo: <path d="M6 9l6 6 6-6" />,
  /** Flecha a la derecha con línea: «Ver historial», «Cronograma» (02, 03). */
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  /** Más (01 «Nueva obra», 03 «Nueva actividad», 04 «Vincular», 05 frente). */
  mas: <path d="M12 5v14M5 12h14" />,
  /** Lápiz: editar / registrar avance / cargar parte (02, 03, 04, 06). */
  editar: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></>,
  /** Clip (03, 04). */
  adjuntar: <path d="M21 12l-8.5 8.5a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7.5-7.5" />,
  /** Cámara (02, 03, 04, 05). */
  foto: <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13.5" r="3.2" /></>,
  /** Hoja de papel (02 ficha, 04 documentos). */
  doc: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>,
  /** Cilindro: la base maestra (02 ficha, 04 rendimiento). */
  base: <><path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" /><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7" /></>,
  /** Camión: equipos (03 panel, 04 recursos, 05). */
  equipo: <><path d="M3 17h2l1.5-5h9L17 17h4" /><circle cx="7.5" cy="19" r="2" /><circle cx="17.5" cy="19" r="2" /><path d="M10 12V7h4l2 5" /></>,
  /** Caja: materiales (04 recursos). */
  material: <><path d="M4 8l8-4 8 4z" /><path d="M4 8v8l8 4 8-4V8" /></>,
  /** Dos eslabones: dependencias (03 conmutador, 04). */
  dep: <path d="M9 7H5a2 2 0 00-2 2v6a2 2 0 002 2h4M15 7h4a2 2 0 012 2v6a2 2 0 01-2 2h-4M8 12h8" />,
  /** Flecha arriba (02 delta, 06 «queda en»). */
  sube: <path d="M12 19V5M6 11l6-6 6 6" />,
  /** Flecha abajo (02 delta). */
  baja: <path d="M12 5v14M6 13l6 6 6-6" />,
  /** Globo de diálogo: nota (03 panel, 05). */
  nota: <path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z" />,
  /** Bandeja con flecha arriba: importar / subir (03 barra, 04 documentos). */
  subir: <path d="M12 16V4M8 8l4-4 4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />,
  /** Chevron abajo con renglón: expandir todo (03). */
  expandir: <path d="M8 9l4 4 4-4M8 15h8" />,
  /** Chevron arriba con renglón: colapsar todo (03). */
  colapsar: <path d="M8 13l4-4 4 4M8 17h8" />,
  /** Estrella: seguir (03, 04). */
  seguir: <path d="M12 4l2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.8-5 2.8 1-5.6-4-3.9 5.5-.8z" />,
  /** Escalones: método por pasos (06). */
  paso: <path d="M4 18h4V6h4v8h4V9h4" />,
  /** Tres renglones desparejos: método por cantidad (06). */
  cantidad: <path d="M4 7h16M4 12h16M4 17h9" />,
  /** Carrito: compra imputada (02 último movimiento). */
  compra: <><path d="M4 5h2l2.2 10h9.4L20 8H7" /><circle cx="9.5" cy="19" r="1.6" /><circle cx="17.5" cy="19" r="1.6" /></>,
  /** Flecha circular: último movimiento (02). */
  reloj: <><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" /><path d="M12 8v4.5l3 2" /></>,
} as const

/** Los tres puntos de «más acciones» (01, 02, 03). Es `fill`, no `stroke`: va aparte del resto. */
export function IcoMas({ s = 15, r = 1.6 }: { s?: number; r?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ display: 'block' }}>
      <circle cx="5" cy="12" r={r} /><circle cx="12" cy="12" r={r} /><circle cx="19" cy="12" r={r} />
    </svg>
  )
}
