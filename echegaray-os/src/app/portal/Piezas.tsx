// LAS PIEZAS QUE LAS SIETE PANTALLAS COMPARTEN.
//
// Salen de las maquetas y se declaran una vez: la fila de estado, el vacío, el icono que le
// corresponde a cada estado. Repetirlas en cada pantalla es cómo dos filas que deberían verse igual
// terminan con dos alturas distintas.

import type { ReactNode } from 'react'
import type { EstadoPago } from './cronograma'
import { IconoCheck, IconoAlerta, IconoReloj, IconoFactura } from './iconos'

/** El color de cada estado. Nunca decorativo: ámbar vencido, verde pagado, azul en curso. */
export const TINTA: Record<EstadoPago, string> = {
  pagado: 'text-pos',
  vencido: 'text-warn',
  proximo: 'text-info',
  programado: 'text-muted',
  sin_factura: 'text-faint',
}

export function IconoEstado({ estado, tamano = 19 }: { estado: EstadoPago; tamano?: number }) {
  const dibujo =
    estado === 'pagado' ? <IconoCheck tamano={tamano} />
    : estado === 'vencido' ? <IconoAlerta tamano={tamano} />
    : estado === 'sin_factura' ? <IconoFactura tamano={tamano} />
    : <IconoReloj tamano={tamano} />
  return <span className={TINTA[estado]}>{dibujo}</span>
}

/** El encabezado de bloque de las maquetas: 11px, versalita apagada. */
export function Rubro({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="mt-9 flex items-center gap-3 border-b border-line-strong pb-2.5">
      <span className="text-[11px] font-semibold tracking-[.09em] text-faint">{children}</span>
      {derecha ? <span className="ml-auto text-[12px] text-faint">{derecha}</span> : null}
    </div>
  )
}

/**
 * EL VACÍO NO ES UNA PANTALLA EN BLANCO.
 *
 * Una obra sin cronograma cargado y un error de lectura se ven igual si el vacío no dice nada, y el
 * cliente no tiene forma de saber cuál de las dos le tocó.
 */
export function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[10px] border border-dashed border-line bg-surface-quiet px-4 py-8 text-center text-sm text-muted">
      {children}
    </p>
  )
}

/** Una fila de la lista. Alto mínimo 44px: es el objetivo táctil del teléfono, no una estética. */
export function Fila({ children, resaltada = false }: { children: ReactNode; resaltada?: boolean }) {
  return (
    <div
      className={
        'flex min-h-11 flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-line py-[15px] ' +
        (resaltada ? '-mx-3 rounded-[8px] border-transparent bg-marca-soft px-3' : '')
      }
    >
      {children}
    </div>
  )
}
