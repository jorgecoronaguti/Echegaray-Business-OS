// LOS ICONOS DE `/campo` — trazo, no emoji.
//
// ═══ POR QUÉ SE DIBUJAN Y NO SE ESCRIBEN ═══
//
// La pantalla ya había echado los emojis (`page.tsx` lo cuenta) y quedó todo en palabras. Parado en
// el frente, con guante y con sol, una palabra de 13px se lee DESPUÉS de encontrarla; una forma se
// reconoce antes de leerla. Lo que se agrega acá es esa forma, y no vuelve el emoji: un emoji lo
// dibuja cada sistema operativo a su manera, cambia de color solo y no hereda el token de texto.
//
// Todos heredan `currentColor` y miden lo que diga la clase de quien los usa: el color lo sigue
// decidiendo el estado de la fila (`text-ink` normal, `text-warn` pendiente), nunca el icono.
//
// NO viven en `shared/`: son de este producto. El jefe de obra tiene los suyos en
// `features/jefe/components/Iconos.tsx` porque su vocabulario es otro —frentes, avance, plantel— y
// una carpeta compartida con nueve iconos que sólo usa una pantalla no es reutilización.

import type { ReactNode } from 'react'

type Props = { className?: string }

function Trazo({ className = 'h-[24px] w-[24px]', children }: Props & { children: ReactNode }) {
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

/** El parte del día: la planilla con lo hecho tildado. */
export function IconoParte(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M8.5 4.5H6.6A1.6 1.6 0 0 0 5 6.1v13.3a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6V6.1a1.6 1.6 0 0 0-1.6-1.6h-1.9" />
      <rect x="8.5" y="2.8" width="7" height="3.4" rx="1.2" />
      <path d="M8.8 13.4l2.2 2.2 4.2-4.6" />
    </Trazo>
  )
}

/** Material: la caja que se pide y que llega. */
export function IconoMaterial(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M3.6 7.6 12 3.6l8.4 4v8.8L12 20.4l-8.4-4z" />
      <path d="M3.6 7.6 12 11.6l8.4-4" />
      <path d="M12 11.6v8.8" />
    </Trazo>
  )
}

/** Un problema que frena el trabajo. Es el MISMO triángulo que usa el jefe: un impedimento se ve
 *  igual desde los dos lados, y ahí repetir la forma es la ventaja, no el costo. */
export function IconoProblema(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M12 3.9 21 19.4H3z" />
      <path d="M12 9.6v4.4" />
      <path d="M12 16.8v.4" />
    </Trazo>
  )
}

/** Herramientas en obra. */
export function IconoHerramienta(p: Props) {
  return (
    <Trazo {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 4.6v2.2M12 17.2v2.2M4.6 12h2.2M17.2 12h2.2M6.8 6.8l1.6 1.6M15.6 15.6l1.6 1.6M17.2 6.8l-1.6 1.6M8.4 15.6l-1.6 1.6" />
    </Trazo>
  )
}

/** Un traslado: algo que sale de un lado y entra en otro. */
export function IconoMovimiento(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M4 9h13" />
      <path d="M13.8 5.6 17.4 9l-3.6 3.4" />
      <path d="M20 15H7" />
      <path d="M10.2 11.6 6.6 15l3.6 3.4" />
    </Trazo>
  )
}
