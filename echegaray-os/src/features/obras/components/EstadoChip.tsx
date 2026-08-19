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

const TONO: Record<string, string> = {
  bloqueada: 'border-neg/30 bg-neg/5 text-neg',
  hecha: 'border-pos/30 bg-pos/5 text-pos',
  en_curso: 'border-line-strong text-ink',
}

export function EstadoChip({ estado }: { estado: string }) {
  const tono = TONO[estado] ?? 'border-line text-muted'
  return (
    <span
      data-testid="estado-chip"
      data-estado={estado}
      className={`inline-block truncate rounded border px-1.5 py-[1px] text-[10px] leading-[15px] ${tono}`}
    >{ESTADO_LABEL[estado as keyof typeof ESTADO_LABEL] ?? estado}</span>
  )
}
