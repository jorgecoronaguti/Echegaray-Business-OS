import type { ReactNode } from 'react'

// LOS ICONOS DE LOS MOCKUPS, COPIADOS TRAZO POR TRAZO.
//
// Cada `d` de este archivo salió del objeto `P = { … }` de los `.dc.html` de
// `/home/jorge/echegaray-design/`. No son «equivalentes»: son los mismos paths, sobre el mismo
// `viewBox 0 0 24 24`, con el mismo `stroke-width:2` y los mismos remates redondeados.
//
// ═══ POR QUÉ NO SE REUSAN `shared/components/iconos` NI `features/jefe/components/Iconos` ═══
//
// Los del repo están dibujados con trazo 1,6 y otra geometría (la casa del OS tiene puerta; la de
// J01 no). A 21px en la barra de contextos la diferencia de peso es visible y es justo lo que el
// dueño llamó «aspecto distinto». Los del sistema siguen sirviendo al escritorio; éstos son el
// contrato del teléfono.
//
// El tamaño SIEMPRE viaja por prop porque el mockup lo cambia por lugar: 13px al lado de un texto,
// 15px en las notas, 20–24px en un acceso, 21px en la barra.

/** Los trazos, con el nombre que les puso el mockup. */
export const TRAZO = {
  cuadrilla: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M22 21v-2a4 4 0 00-3-3.8" /></>,
  gente: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="3.6" /></>,
  avance: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  bloqueo: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 16v.01" /></>,
  alerta: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" /></>,
  ok: <path d="M5 13l4 4L19 7" />,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5l3 2" /></>,
  casa: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  obra: <><path d="M3 21h18M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" /></>,
  tarea: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
  foto: <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13.5" r="3.2" /></>,
  masivo: <><path d="M4 7h16M4 12h16M4 17h9" /><path d="M17 17l2 2 3-3" /></>,
  lista: <path d="M4 7h16M4 12h16M4 17h9" />,
  pedido: <><path d="M4 5h2l2.2 10h9.4L20 8H7" /><circle cx="9.5" cy="19" r="1.6" /><circle cx="17.5" cy="19" r="1.6" /></>,
  pendiente: <circle cx="12" cy="12" r="8.5" />,
  dedo: <><path d="M9 11V5a2 2 0 114 0v6" /><path d="M13 11V9a2 2 0 114 0v6a5 5 0 01-5 5H9a5 5 0 01-5-5v-3a2 2 0 114 0" /></>,
  material: <><path d="M4 8l8-4 8 4-8 4z" /><path d="M4 8v8l8 4 8-4V8" /></>,
  clima: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  plano: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>,
  fecha: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  paso: <path d="M4 18h4V6h4v8h4V9h4" />,
  ninguno: <path d="M6 6l12 12M18 6L6 18" />,
  falta: <path d="M6 6l12 12M18 6L6 18" />,
  entrar: <><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><path d="M10 17l5-5-5-5M15 12H3" /></>,
  salir: <><path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  tel: <path d="M5 3h4l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z" />,
  llave: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8 3 3-3 3-2-2" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.01" /></>,
  doc: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></>,
  nota: <path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z" />,
  pin: <><path d="M12 21s7-6.4 7-11a7 7 0 10-14 0c0 4.6 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  tope: <path d="M12 19V5M6 11l6-6 6 6" />,
  baja: <path d="M12 5v14M6 13l6 6 6-6" />,
  externo: <path d="M9 7H5a2 2 0 00-2 2v6a2 2 0 002 2h4M15 7h4a2 2 0 012 2v6a2 2 0 01-2 2h-4M8 12h8" />,
  mover: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M19 8v6M22 11h-6" /></>,
  equipo: <><path d="M3 17h2l1.5-5h9L17 17h4" /><circle cx="7.5" cy="19" r="2" /><circle cx="17.5" cy="19" r="2" /></>,
  seguridad: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  salud: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M12 9v6M9 12h6" /></>,
  enviar: <path d="M4 12l16-8-7 16-2-6z" />,
  recibo: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  subir: <path d="M12 16V4M8 8l4-4 4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />,
  descargar: <path d="M12 4v12M8 12l4 4 4-4M4 19v1a1 1 0 001 1h14a1 1 0 001-1v-1" />,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.4" /><path d="M14 10h4M14 14h4" /></>,
  candado: <><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>,
  historial: <><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" /><path d="M12 8v4.5l3 2" /></>,
  buscar: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></>,
  volver: <path d="M15 6l-6 6 6 6" />,
  siguiente: <path d="M9 6l6 6-6 6" />,
  flecha: <path d="M5 12h14M13 6l6 6-6 6" />,
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
} as const

export type NombreIcono = keyof typeof TRAZO

/**
 * Un icono del mockup. `tamano` es el `width`/`height` que el `.dc.html` le pone en ese lugar.
 *
 * `grosor` sólo se aparta de 2 donde el mockup lo hace: el tilde adentro de un check es `3`, la
 * flecha del delta es `2.6`, el chevron de un rubro plegable es `2.2`.
 */
export function Icono({
  nombre, tamano = 20, grosor = 2, className,
}: {
  nombre: NombreIcono
  tamano?: number
  grosor?: number
  className?: string
}): ReactNode {
  return (
    <svg
      aria-hidden
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {TRAZO[nombre]}
    </svg>
  )
}

/** Los tres puntos de «Más» del topbar de J06 y M04. Es el único icono RELLENO del contrato. */
export function IconoMas({ tamano = 20 }: { tamano?: number }): ReactNode {
  return (
    <svg aria-hidden width={tamano} height={tamano} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}
