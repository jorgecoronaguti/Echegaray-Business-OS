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

// LA PALABRA TOMA EL COLOR DEL PUNTO, salvo «en curso» y «pendiente».
//
// Medido del especimen (`Echegaray Design System.dc.html` §06 y §07, `getComputedStyle`): «Hecha»
// se dibuja en `#067647` —el verde del punto—, no en tinta. Acá estaba en `text-ink`, y el efecto
// era que el ÚNICO estado que el ojo puede saltear —el trabajo terminado, el que ya no requiere
// nada de nadie— se leía con el mismo peso visual que el resto de la columna.
//
// Las dos excepciones son deliberadas y están en el mismo especimen: «En curso» es grafito (`INK`,
// «neutro, sin color») porque estar trabajando no es una noticia, y «Pendiente» queda en `muted`
// porque su punto es hueco: no hay color que heredar.
const TEXTO: Record<TonoEstado, string> = {
  pos: 'text-pos',
  neg: 'text-neg',
  warn: 'text-warn',
  curso: 'text-ink',
  pendiente: 'text-muted',
  nulo: 'text-faint',
}

// La separación punto→palabra es de 8px (`gap-2`), medida del especimen §06. Estaba en 6px, que
// pegaba el punto a la letra y lo hacía leer como parte de la palabra en vez de como su marca.
export function Estado({
  tono,
  children,
  testid,
  clave,
  className,
}: {
  tono: TonoEstado
  children: ReactNode
  testid?: string
  /** Va al DOM aunque no se dibuje: es lo que deja verificar el estado desde un test sin leer color. */
  clave?: string
  /** Para cuando el contenido debe truncarse dentro de una celda: `min-w-0` y compañía. */
  className?: string
}) {
  return (
    <span
      data-testid={testid ?? 'estado'}
      data-estado={clave}
      className={`inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] ${TEXTO[tono]} ${className ?? ''}`}
    >
      {tono !== 'nulo' && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} />}
      {children}
    </span>
  )
}
