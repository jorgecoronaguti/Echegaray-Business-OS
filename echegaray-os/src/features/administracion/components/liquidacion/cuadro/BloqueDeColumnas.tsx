// UN BLOQUE DE COLUMNAS DEL CUADRO: una caja con fondo que cubre sus columnas sin mover ninguna.
//
// ═══ POR QUÉ `subgrid` Y NO UN FONDO POR CELDA ═══
//
// Pintar cada celda deja blanco el aire de 8 px entre columnas: el bloque se lee como una reja, no como un
// bloque. Un envoltorio con `grid-template-columns: subgrid` ocupa las columnas del bloque en la grilla de la
// fila, sus celdas siguen alineadas a las MISMAS pistas que el encabezado y el total, y el fondo cubre los huecos
// de adentro. Entre un bloque y el siguiente queda el aire de la grilla: ése es el corte.
//
// ═══ EL FONDO SOBRESALE 3 PX Y LAS CELDAS NO SE MUEVEN ═══
//
// Un número alineado a la derecha pegado al filo del fondo se lee apretado. `margin` −3 y `padding` 3 se anulan
// para las celdas (en un subgrid se suman como margen extra de las del borde) y el fondo crece 3 px por lado. De
// los 8 px de aire entre bloques quedan 2 en blanco: la línea que separa blanco de negro sin dibujar un borde.

import type { CSSProperties, ReactNode } from 'react'

const SOBRESALE = 3

export function BloqueDeColumnas({ fondo, columna, fila, filas = false, testid, estilo, children }: {
  /** El fondo del bloque (`BLOQUES[i].fondo`). Sin fondo la caja igual agrupa, para que todas las filas midan igual. */
  fondo: string | undefined
  /** `span N` en la fila, o `inicio / span N` en el encabezado, que coloca sus bloques a mano. */
  columna: string
  fila?: string
  /** Si hereda también los renglones (el encabezado: rótulo del bloque arriba, rótulos de columna abajo). */
  filas?: boolean
  testid?: string
  estilo?: CSSProperties
  children: ReactNode
}) {
  return (
    <div data-testid={testid} data-bloque="" style={{
      gridColumn: columna, gridRow: fila, display: 'grid', gridTemplateColumns: 'subgrid',
      gridTemplateRows: filas ? 'subgrid' : undefined, alignItems: 'center', alignSelf: 'stretch',
      marginInline: -SOBRESALE, paddingInline: SOBRESALE, background: fondo, minWidth: 0,
      ...estilo,
    }}>
      {children}
    </div>
  )
}
