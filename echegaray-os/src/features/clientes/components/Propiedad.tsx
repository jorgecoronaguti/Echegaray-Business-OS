// EL RENGLÓN RÓTULO/VALOR DEL COSTADO DE LA FICHA DEL CLIENTE.
//
// Vivía en `Bloque.tsx` junto al marco de bloque que el v2 retiró —el v2 no tiene bloques con
// título y contador: tiene caras y un costado—. El marco se fue; el renglón se quedó, porque es el
// 100% del bloque IDENTIDAD y no tiene nada que ver con la caja.
//
// RÓTULO ARRIBA Y VALOR ABAJO, no en dos columnas como el `DatoDeCostado` genérico: en el costado
// de 300px «Responsable interno» y «Rodrigo Echegaray» no entran en la misma línea, y forzarlos
// parte las dos en cuatro renglones. La razón está medida, no supuesta.

import type { ReactNode } from 'react'

export function Propiedad({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-faint">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-ink">{children}</dd>
    </div>
  )
}

/** «sin cargar» NUNCA se dibuja como un problema: no hay rojo ni naranja. Que falte el teléfono de
 *  un cliente es un dato que falta, no un desvío. */
export function oFalta(v: string | null | undefined): ReactNode {
  return v ? v : <span className="text-faint">sin cargar</span>
}
