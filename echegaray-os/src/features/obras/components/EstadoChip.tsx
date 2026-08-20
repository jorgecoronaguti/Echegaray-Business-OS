// EL ESTADO DE UNA ACTIVIDAD, DIBUJADO UNA SOLA VEZ.
//
// Lo muestran el Gantt, la Lista y el Tablero. Con un chip por pantalla, el día que «Bloqueada»
// cambie de color lo haría en dos de las tres y nadie lo notaría hasta que alguien compare.
//
// ═══ EL COLOR SIGNIFICA ALGO ═══
//
// Rojo SÓLO para bloqueada, que es el único problema real de este dato: hay trabajo detenido por
// algo que alguien tiene que destrabar. Verde sólo para hecha, que es el único estado positivo de
// verdad. Los tres del medio son grises: «pendiente», «lista» y «en curso» son el curso normal de
// una obra y pintarlos de colores convierte la pantalla en una decoración.

import { ESTADO_LABEL } from '../types'

// PÍLDORA CON FONDO, NO UN RECUADRO FINO. El objetivo las dibuja así y no es capricho: en una
// columna de treinta filas, un borde de 1px con texto del mismo gris que el resto no se distingue
// hasta que uno lo busca, y el estado es lo primero que se barre con la vista.
const TONO: Record<string, string> = {
  bloqueada: 'bg-neg/10 text-neg',
  hecha: 'bg-pos-soft text-pos',
  en_curso: 'bg-accent/10 text-ink',
  lista: 'bg-marca-soft text-ink',
}

export function EstadoChip({ estado }: { estado: string }) {
  const tono = TONO[estado] ?? 'bg-surface-sunken text-muted'
  return (
    <span
      data-testid="estado-chip"
      data-estado={estado}
      className={`inline-block truncate rounded-full px-2.5 py-[3px] text-[11px] font-medium leading-[15px] ${tono}`}
    >{ESTADO_LABEL[estado as keyof typeof ESTADO_LABEL] ?? estado}</span>
  )
}
