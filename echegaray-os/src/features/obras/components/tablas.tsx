// LAS PIEZAS DE TABLA DEL MÓDULO DE OBRAS — una sola copia para las cuatro listas de Operación.
//
// Vivían adentro de `TabOperacion` y eran privadas. Se sacaron acá cuando aparecieron las listas
// globales (`/obras/personal`, `/obras/operacion`, …), para que las dos pantallas no se separaran
// por copia.
//
// ESAS LISTAS GLOBALES YA NO EXISTEN: el dueño las retiró el 20/08 porque Personal, Operación,
// Certificaciones y Documentos son dominios DE UNA OBRA, no vistas del área. El archivo se queda
// igual —`TabOperacion` dibuja cuatro tablas y una sola definición sigue siendo lo correcto—, pero
// se le sacó `CeldaObra`, que era la columna «Obra» y sólo tenía sentido en una lista de todas las
// obras a la vez. Dentro de la ficha esa columna es redundante: ya se sabe de qué obra se trata.

import type { ReactNode } from 'react'

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-[12px] leading-relaxed text-faint">{children}</p>
}

/** El contenedor scrollea por dentro: a 390px la página no puede correrse a lo ancho. */
export function Tabla({
  testid, cols, children,
}: {
  testid: string
  cols: { k: string; num?: boolean }[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table data-testid={testid} className="w-full text-left" style={{ minWidth: 560 }}>
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
 * Una fila. `obra` viaja al DOM aunque no se dibuje: es lo que permite CONTAR desde afuera cuántas
 * filas de una obra dibujó cada lista, sin depender de cómo se ven. Los tests lo usan como clave.
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
