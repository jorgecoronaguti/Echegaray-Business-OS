import type { ReactNode } from 'react'

// LOS ICONOS DEL JEFE DE OBRA — trazo de 1,6, `currentColor`, nada más.
//
// ═══ POR QUÉ EXISTEN ═══
//
// Este producto se usa parado en el frente, con una mano y a veces con guante. Una barra de tres
// destinos escritos en 12,5px obliga a LEER tres palabras para elegir una; con la forma delante, la
// palabra confirma en vez de decidir. Es lo mismo que ya hacía la pantalla con `△` y `◔`, pero con
// una forma que se reconoce a 390px y que hereda el color del estado en vez de traer el suyo.
//
// ═══ POR QUÉ NO SON EMOJI Y NO ESTÁN EN `shared/` ═══
//
// El emoji lo dibuja cada teléfono a su manera, trae color propio y el handoff ya lo echó una vez
// de `/campo`. Y `shared/components/ds` es el sistema de ESCRITORIO: subir ahí seis formas que sólo
// usan las pantallas del teléfono sería ampliar el contrato del sistema para un solo consumidor.
// Campo tiene las suyas en `app/campo/iconos.tsx` por el mismo motivo, y el triángulo del problema
// se repite a propósito: un impedimento tiene que verse igual desde los dos lados.

type Props = { className?: string }

function Trazo({ className = 'h-[22px] w-[22px]', children }: Props & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

/** HOY: el día de la obra. */
export function IconoHoy(p: Props) {
  return (
    <Trazo {...p}>
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.2" />
      <path d="M3.4 9.9h17.2M8.2 3.4v3.4M15.8 3.4v3.4" />
      <path d="M11.9 14.9h.2" />
    </Trazo>
  )
}

/** TAREAS: la lista de la obra, con lo hecho tildado. */
export function IconoTareas(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M10 6.6h10M10 12h10M10 17.4h10" />
      <path d="M3.8 6.4 5.1 7.7 7.6 5.2M3.8 11.8l1.3 1.3 2.5-2.5M3.8 17.2l1.3 1.3 2.5-2.5" />
    </Trazo>
  )
}

/** GENTE: el plantel en obra. */
export function IconoGente(p: Props) {
  return (
    <Trazo {...p}>
      <circle cx="9.3" cy="8.4" r="3.3" />
      <path d="M3.6 19.8c0-3.2 2.6-5.4 5.7-5.4s5.7 2.2 5.7 5.4" />
      <path d="M16.4 5.8a3.3 3.3 0 0 1 0 5.6M17.6 14.9c1.7.8 2.8 2.4 2.8 4.7" />
    </Trazo>
  )
}

/** AVANCE: lo que se movió. */
export function IconoAvance(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M3.8 15.4 9.4 9.8l3.4 3.4 7-7" />
      <path d="M15.6 6.2h4.2v4.2" />
      <path d="M3.8 20.2h16.4" />
    </Trazo>
  )
}

/** LO QUE FRENA: el mismo triángulo que ve el operario en `/campo`. */
export function IconoAlerta(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M12 3.9 21 19.4H3z" />
      <path d="M12 9.6v4.4" />
      <path d="M12 16.8v.4" />
    </Trazo>
  )
}

/** LA UBICACIÓN de una marca de asistencia. */
export function IconoUbicacion(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M12 21.2s6.4-5.6 6.4-10.2a6.4 6.4 0 1 0-12.8 0c0 4.6 6.4 10.2 6.4 10.2z" />
      <circle cx="12" cy="10.8" r="2.4" />
    </Trazo>
  )
}
