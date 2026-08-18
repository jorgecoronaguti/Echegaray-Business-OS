// PLANIFICACIÓN — la solapa vieja, ahora un envoltorio de una sola línea útil.
//
// ═══ POR QUÉ QUEDA ESTE ARCHIVO ═══
//
// «Próximos trabajos» se mudó adentro de Cronograma, que es donde el dueño lo pidió: son dos zooms
// del mismo cronograma y tenerlos como dos solapas principales hacía parecer que había dos planes.
// La tabla real vive ahora en `VistaProximos` y la usan las dos entradas — no hay dos copias de la
// misma tabla esperando divergir.
//
// Este archivo sigue existiendo sólo porque la página lo importa, y el cableado de la página lo hace
// el dueño. Cuando `/obras/[obra]` deje de ofrecer la solapa «Planificación», este archivo se borra
// y no se pierde nada: no tiene lógica propia.
//
// `proximas` se recibe y NO se usa: la ventana ahora la elige el que mira —una, dos o seis semanas—
// y se calcula con `lookahead()` sobre las mismas actividades. Recibir una lista ya recortada a seis
// semanas y además dejar elegir la ventana daría dos respuestas distintas a la misma pregunta.

import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Restriccion } from '../types'
import { VistaProximos } from './VistaProximos'

export function TabPlanificacion(props: {
  /** @deprecated La ventana se elige en la vista; se ignora. */
  proximas?: Actividad[]
  impedimentos: Restriccion[]
  actividades: Actividad[]
  crear: AccionFormulario
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
}) {
  return (
    <VistaProximos
      actividades={props.actividades}
      impedimentos={props.impedimentos}
      crear={props.crear}
      liberar={props.liberar}
    />
  )
}
