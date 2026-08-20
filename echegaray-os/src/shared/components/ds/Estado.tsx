import type { ReactNode } from 'react'

// EL ESTADO SE DICE CON UN PUNTO Y UNA PALABRA — `design/system/COMPONENTS.md` §Status badges.
//
// «Prohibidas las pastillas de color». No es una preferencia estética: en una tabla de treinta
// filas, treinta pastillas rellenas convierten la columna de estado en el elemento más ruidoso de
// la pantalla, y el estado casi nunca es lo que la persona vino a leer. Un punto de 6px con su
// palabra al lado se barre igual de rápido y no compite con el dato.
//
// El color del punto significa, y sólo significa cuando aparece poco: `pos` para lo terminado,
// `neg` para el problema real, `warn` para el dato que falta y bloquea, grafito para lo que está
// en curso, y un punto HUECO para lo que todavía no empezó — que no es un estado positivo ni
// negativo, es la ausencia de trabajo. La ausencia de dato no lleva punto: se escribe en `faint`.

export type TonoEstado = 'pos' | 'neg' | 'warn' | 'curso' | 'pendiente' | 'nulo'

const PUNTO: Record<Exclude<TonoEstado, 'nulo'>, string> = {
  pos: 'bg-pos',
  neg: 'bg-neg',
  warn: 'bg-warn',
  curso: 'bg-accent',
  pendiente: 'border border-[#C9C4C2] bg-transparent',
}

const TEXTO: Record<TonoEstado, string> = {
  pos: 'text-ink',
  neg: 'text-neg',
  warn: 'text-warn',
  curso: 'text-ink',
  pendiente: 'text-muted',
  nulo: 'text-faint',
}

export function Estado({
  tono,
  children,
  testid,
  clave,
}: {
  tono: TonoEstado
  children: ReactNode
  testid?: string
  /** Va al DOM aunque no se dibuje: es lo que deja verificar el estado desde un test sin leer color. */
  clave?: string
}) {
  return (
    <span
      data-testid={testid ?? 'estado'}
      data-estado={clave}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] ${TEXTO[tono]}`}
    >
      {tono !== 'nulo' && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} />}
      {children}
    </span>
  )
}
