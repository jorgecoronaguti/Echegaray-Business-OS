// EL ESTADO DE UNA ACTIVIDAD, DIBUJADO UNA SOLA VEZ.
//
// Lo muestran el Gantt, la Lista, el Tablero y el panel. Con un chip por pantalla, el día que
// «Bloqueada» cambie de tono lo haría en tres de las cuatro y nadie lo notaría hasta que alguien
// compare.
//
// ═══ DEJÓ DE SER UNA PASTILLA (Design Handoff V2) ═══
//
// Era una píldora rellena. `design/system/COMPONENTS.md` §Status badges las prohíbe, y el motivo
// está medido en esta pantalla: en una columna de treinta filas, treinta pastillas de color
// convierten el estado en el elemento más ruidoso de la vista —y el estado casi nunca es lo que la
// persona vino a leer, que es cuándo empieza y cómo viene—. Punto de 6px más palabra se barre igual
// de rápido y no compite con el dato.
//
// El color sigue significando lo mismo que antes: verde sólo lo terminado, rojo sólo el problema
// real (bloqueada), grafito lo que está en curso, y punto hueco lo que todavía no arrancó — que no
// es bueno ni malo, es ausencia de trabajo.

import { Estado, type TonoEstado } from '@/shared/components/ds'
import { ESTADO_LABEL } from '../types'

const TONO: Record<string, TonoEstado> = {
  bloqueada: 'neg',
  hecha: 'pos',
  en_curso: 'curso',
  lista: 'pendiente',
  pendiente: 'pendiente',
}

export function EstadoChip({ estado }: { estado: string }) {
  return (
    <Estado tono={TONO[estado] ?? 'pendiente'} clave={estado} testid="estado-chip">
      {ESTADO_LABEL[estado as keyof typeof ESTADO_LABEL] ?? estado}
    </Estado>
  )
}
