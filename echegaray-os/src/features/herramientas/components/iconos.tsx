// Los iconos del diseño de Herramientas, con sus trazos tal cual (`D01`, `D02`, `M01`). Toman el color
// del contexto salvo que se les pase uno: el color de un icono de lugar ES información (verde = obra).

import type { ReactNode } from 'react'
import type { TipoUbicacion } from '../types'
import { AZUL, V } from './estilo'

function Svg({ tam = 14, color = 'currentColor', children, className }: { tam?: number; color?: string; children: ReactNode; className?: string }) {
  return (
    <svg
      width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0 }} aria-hidden className={className}
    >
      {children}
    </svg>
  )
}

type P = { tam?: number; color?: string; className?: string }

export const IcoTaller = (p: P) => <Svg {...p}><path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-2.5z" /></Svg>
export const IcoObra = (p: P) => <Svg {...p}><path d="M4 20V7l7-3v16M11 20h9V11h-9" /><path d="M15 15h1M15 18h1" /></Svg>
export const IcoRodado = (p: P) => (
  <Svg {...p}><path d="M3 16V9h11l4 4h3v3" /><circle cx="7.5" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /><path d="M9.5 17.5h5" /></Svg>
)
export const IcoServicio = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></Svg>
)
export const IcoTercero = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a4 4 0 014-4h4a4 4 0 014 4v1M17 11a3 3 0 100-6M18 20v-1a4 4 0 00-2-3.5" /></Svg>
)
export const IcoAviso = (p: P) => <Svg {...p}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Svg>
export const IcoReloj = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></Svg>
export const IcoLista = (p: P) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18.5" cy="17.5" r="3" /></Svg>
export const IcoFlecha = (p: P) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const IcoBuscar = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></Svg>
export const IcoEscanear = (p: P) => (
  <Svg {...p}><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M8 12h8" /></Svg>
)
export const IcoEquipo = (p: P) => <Svg {...p}><path d="M4 18h16M6 18V9l6-4 6 4v9" /><path d="M10 18v-5h4v5" /></Svg>
/** Una persona (a quien se le entregó EPP o ropa). */
export const IcoPersona = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1a5 5 0 015-5h4a5 5 0 015 5v1" /></Svg>
export const IcoCheck = (p: P) => <Svg {...p}><path d="M4 12l5 5L20 6" /></Svg>

/** El icono y su color por tipo de lugar. Taller = el taller Y el almacén: un solo lugar (dueño, 21/09). */
export function IconoLugar({ tipo, tam = 14 }: { tipo: TipoUbicacion | 'sin_ubicacion'; tam?: number }) {
  switch (tipo) {
    case 'taller': return <IcoTaller tam={tam} color={V.warn} />
    case 'obra': return <IcoObra tam={tam} color={V.pos} />
    case 'rodado': return <IcoRodado tam={tam} color={V.tinta} />
    case 'servicio_tecnico': return <IcoServicio tam={tam} color={V.apagado} />
    case 'tercero': return <IcoTercero tam={tam} color={V.apagado} />
    case 'persona': return <IcoPersona tam={tam} color={V.tintaSuave} />
    default: return <IcoAviso tam={tam} color={V.warn} />
  }
}

/** El color de la barra de «Dónde está el parque». `D01`. */
export const COLOR_BARRA: Record<TipoUbicacion, string> = {
  taller: V.warn, obra: V.pos, rodado: V.tinta, servicio_tecnico: V.apagado, tercero: '#C8C7C1', persona: V.tintaSuave,
}

export { AZUL }
