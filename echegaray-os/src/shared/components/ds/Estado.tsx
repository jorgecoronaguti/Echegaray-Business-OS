import type { ReactNode } from 'react'

// EL ESTADO SE DICE CON UNA PASTILLA DE COLOR — los mockups del zip ganan a COMPONENTS.md
// §Status badges por orden del dueño 24/08.
//
// COMPONENTS.md dice «prohibidas las pastillas de color» y este archivo implementaba eso: un punto
// de 6px con la palabra al lado. PERDIÓ. Las 28 pantallas del zip (`echegaray-design/*.dc.html`)
// dibujan pastilla en todas las tablas, y lo que se exige es fidelidad visual al zip: si el
// componente y el mockup no coinciden, el que está mal es el componente.
//
// MAPA MEDIDO — de los estilos inline de `03 · Obra Tareas.dc.html` (líneas 491-500 el mapa de
// color, 162 y 242 la caja) y `01 · Obras Cartera.dc.html` (220-224 y 104). Los mockups escriben
// cada propiedad inline, así que el atributo ES el valor computado; no hay cascada que lo altere.
//
//   caja (idéntica en las dos pantallas): font 11px / peso 500 / radio 11px / padding 1.5px 8px /
//                                         borde 1px sólido / sin punto adentro
//
//   tono        estados del zip                              texto     fondo     borde
//   pos         «Hecha» · «Terminada»                        #067647   #F1F9F4   #D6EBDF
//   curso       «En curso» · «En ejecución»                  #175CD3   #EFF5FF   #D6E4FB
//   warn        «En curso · crítica» · «Sin cuadrilla»
//               · «Sin análisis»                             #B54708   #FDF6EE   #F0E1CD
//   neg         «Sub · sin ART» · «En ejecución · atraso»     #B42318   #FEF6F5   #F3DDDA
//   pendiente   «Pendiente» · «Previo» · «Sin plan»          #6B6B67   #FAFAF8   #E7E6E2
//
// EL PUNTO DE 6px SE VA: ninguna de las dos pantallas lo dibuja dentro de la pastilla, y afuera
// duplicaría en dos señales lo que la pastilla ya dice en una.
//
// `nulo` NO ES UNA PASTILLA y por eso no está en el mapa: es la AUSENCIA de dato, y el zip no le
// da caja a nada. Una pastilla gris ahí diría que el estado es «neutro» cuando lo que pasa es que
// no se sabe. Queda como texto en `faint`, que es lo que hacía antes.

export type TonoEstado = 'pos' | 'neg' | 'warn' | 'curso' | 'pendiente' | 'nulo'

const PASTILLA: Record<Exclude<TonoEstado, 'nulo'>, string> = {
  pos: 'text-[#067647] bg-[#F1F9F4] border-[#D6EBDF]',
  neg: 'text-[#B42318] bg-[#FEF6F5] border-[#F3DDDA]',
  warn: 'text-[#B54708] bg-[#FDF6EE] border-[#F0E1CD]',
  curso: 'text-[#175CD3] bg-[#EFF5FF] border-[#D6E4FB]',
  pendiente: 'text-[#6B6B67] bg-[#FAFAF8] border-[#E7E6E2]',
}

// La caja, tal como la mide el zip. Va aparte del color para que agregar un tono no pueda cambiarle
// la geometría a los otros cinco.
const CAJA = 'rounded-[11px] border px-2 py-[1.5px] text-[11px] font-medium'

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
      className={`inline-flex items-center whitespace-nowrap ${
        tono === 'nulo' ? 'text-[11px] text-faint' : `${CAJA} ${PASTILLA[tono]}`
      } ${className ?? ''}`}
    >
      {children}
    </span>
  )
}
