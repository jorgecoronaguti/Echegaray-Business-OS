// LAS PIEZAS DE TABLA DEL MÓDULO DE OBRAS — una sola copia para la ficha y para la vista global.
//
// Vivían adentro de `TabOperacion` y eran privadas. Cuando aparecieron las listas globales
// (`/obras/personal`, `/obras/operacion`, …) la alternativa era copiarlas: seis tablas escritas a
// mano se desalinean en el primer cambio de densidad, y peor, la lista global de una obra y la de
// la ficha empezarían a verse distintas sin que nadie lo decida.
//
// LA COLUMNA «OBRA» SÓLO EXISTE ACÁ. En la ficha es redundante —ya se sabe de qué obra se está
// mirando— y ocupa el ancho que necesita el dato que sí se vino a leer.

import Link from 'next/link'
import type { ReactNode } from 'react'

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-[12px] leading-relaxed text-faint">{children}</p>
}

/** El contenedor scrollea por dentro: a 390px la página no puede correrse a lo ancho. */
export function Tabla({
  testid, cols, min = 560, children,
}: {
  testid: string
  cols: { k: string; num?: boolean }[]
  /** Ancho mínimo en px. Con la columna Obra hace falta más antes de empezar a desplazar. */
  min?: number
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table data-testid={testid} className="w-full text-left" style={{ minWidth: min }}>
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            {cols.map((c) => (
              <th key={c.k} className={`px-3 py-2 font-medium first:pl-4 last:pr-4 ${c.num ? 'text-right' : ''}`}>{c.k}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/**
 * Una fila. `obra` viaja al DOM aunque no se dibuje: es lo que permite contar desde afuera que la
 * lista global trae, para una obra, exactamente las mismas filas que la ficha de esa obra.
 */
export function Fila({ children, obra }: { children: ReactNode; obra?: string | null }) {
  return <tr data-obra={obra ?? undefined} className="border-b border-line/60 last:border-0">{children}</tr>
}

export function C({ children, num, fuerte }: { children: ReactNode; num?: boolean; fuerte?: boolean }) {
  return (
    <td className={`px-3 py-2 first:pl-4 last:pr-4 ${num ? 'text-right tabular-nums' : ''} ${fuerte ? 'text-[13px] text-ink' : 'text-[12px] text-muted'}`}>
      {children}
    </td>
  )
}

/**
 * LA CELDA «OBRA» de las listas globales. Es un enlace a la ficha, en la solapa equivalente: desde
 * la lista global se entra a la obra, no se abre una segunda versión de la obra.
 *
 * Sin obra no se inventa una: una compra de estructura (Administración, Taller, F931) NO es de
 * ninguna obra, y ponerla bajo la primera de la lista sería imputar plata a quien no la gastó.
 */
export function CeldaObra({ id, nombre, href }: { id: string | null; nombre?: string; href?: string }) {
  if (!id) return <C><span className="text-faint">sin obra</span></C>
  return (
    <C>
      {href
        ? <Link href={href} className="text-ink hover:underline">{nombre ?? id}</Link>
        : <span className="text-ink">{nombre ?? id}</span>}
    </C>
  )
}
