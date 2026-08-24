import type { ReactNode } from 'react'

// LA TABLA DEL SISTEMA — `design/system/COMPONENTS.md` §Table.
//
// «Las tablas no van en caja: hairline superior + divisores de fila». La caja con borde y radio
// alrededor de una tabla es un contenedor que no aporta nada: la tabla ya se delimita sola con su
// encabezado y sus divisores, y el borde exterior sólo agrega una línea más para que el ojo la
// procese. Lo que sí hace falta es que las filas se separen entre sí, y para eso alcanza el
// divisor más liviano del sistema (#EFEEEA), no el borde de bloque (#E7E6E2).
//
// El encabezado mide 32px, va en 10px con 0.06em de interletrado, en versalitas y en `faint`: es
// el rótulo de la columna, no un dato, y compite con el dato si se le da peso.
//
// Los números van a la derecha y en TABULARES. Una columna de importes alineada a la izquierda con
// cifras de ancho variable no se puede comparar de un vistazo — que es lo único para lo que existe
// una columna de importes.

export function Tabla({
  children,
  testid,
  minWidth = 560,
  className = '',
}: {
  children: ReactNode
  testid?: string
  /** Mínimo antes de scrollear por dentro: a 390px la PÁGINA no puede correrse de costado. */
  minWidth?: number
  className?: string
}) {
  // `relative` NO es decorativo: un `sr-only` (position:absolute) dentro de la tabla escapa del
  // clip de un scroll container no posicionado, aterriza en su posición estática (x=822 en la
  // lista de presupuestos) y EXPANDE el viewport móvil a ese ancho para siempre (QA 24/08,
  // innerWidth 390→823 tras hidratar). Posicionado, el ancestro lo contiene y lo recorta.
  return (
    <div className={`relative w-full overflow-x-auto border-t border-line ${className}`}>
      <table data-testid={testid} className="w-full border-collapse text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      {/* El encabezado se cierra con el divisor de FILA (#EFEEEA), no con el borde de bloque: el
          borde de bloque ya lo puso el hairline superior, y dos líneas fuertes seguidas convierten
          el encabezado en una caja. */}
      <tr className="h-thead border-b border-[#EFEEEA]">{children}</tr>
    </thead>
  )
}

// PESO NORMAL, no `font-medium`. El especimen (§07) dibuja el encabezado en 400: ya se separa del
// dato por tamaño (10px), color (`faint`), versalitas e interletrado. Sumarle peso es la cuarta
// señal para decir lo mismo, y la que lo devuelve a competir con el dato que rotula.
export function Th({
  children,
  num,
  className = '',
  ...props
}: { children?: ReactNode; num?: boolean } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={`px-3 align-middle text-[10px] uppercase tracking-[0.06em] text-faint first:pl-0 last:pr-0 ${
        num ? 'text-right' : ''
      } ${className}`}
    >
      {children}
    </th>
  )
}

/**
 * Una fila. `seleccionada` la marca con la regla amarilla de 2px por dentro del borde izquierdo
 * (`INTERACTION.md`): un borde real correría la fila 2px y desalinearía la tabla del Gantt.
 */
export function Tr({
  children,
  seleccionada,
  onClick,
  compacta,
  className = '',
  ...props
}: {
  children: ReactNode
  seleccionada?: boolean
  compacta?: boolean
  className?: string
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...props}
      onClick={onClick}
      data-seleccionada={seleccionada ? '' : undefined}
      style={seleccionada ? { boxShadow: 'inset 2px 0 0 var(--os-marca)' } : undefined}
      className={`border-b border-[#EFEEEA] ${compacta ? 'h-fila-compacta' : 'h-fila'} ${
        seleccionada ? 'bg-surface-quiet' : 'hover:bg-surface-quiet'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}

// EL NÚMERO SIEMPRE VA EN `ink`, y por eso `fuerte` no lo toca.
//
// El especimen §07 dibuja la celda numérica en `#1F1F1E` y la de texto secundario en `muted`: el
// número ES el valor que la persona vino a comparar, nunca el acompañamiento. Acá el número
// heredaba `ink-soft` salvo que quien lo escribió se acordara de pasar `fuerte`, así que la misma
// columna de importes salía en dos tintas distintas según la pantalla. `fuerte` sigue existiendo
// para la celda de TEXTO, que es donde la distinción nombre/atributo sí es real.
export function Td({
  children,
  num,
  fuerte,
  className = '',
  ...props
}: { children?: ReactNode; num?: boolean; fuerte?: boolean } & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...props}
      className={`px-3 align-middle first:pl-0 last:pr-0 ${
        num ? 'text-right font-mono text-[12.5px] tabular-nums text-ink' : `text-[13px] ${fuerte ? 'text-ink' : 'text-ink-soft'}`
      } ${className}`}
    >
      {children}
    </td>
  )
}

/** Fila de total: se separa del cuerpo con el borde fuerte, no con negrita sola. */
export function FilaTotal({ children }: { children: ReactNode }) {
  return <tr className="h-fila border-t border-line-strong font-medium text-ink">{children}</tr>
}

// ═══ ESTADO VACÍO ═══
//
// «Una línea, accionable». Sin ilustraciones y sin párrafos permanentes: quien ve esto ya sabe que
// no hay nada, lo que no sabe es qué hacer al respecto. El texto tiene que decírselo.
export function Vacio({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#EFEEEA] py-6 text-[13px] text-muted" data-testid="vacio">
      <span>{children}</span>
      {accion}
    </div>
  )
}
