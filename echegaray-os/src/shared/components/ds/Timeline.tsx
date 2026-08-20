import type { ReactNode } from 'react'
import { Vacio } from './Tabla'

// LA ACTIVIDAD DE UNA ENTIDAD — `design/system/COMPONENTS.md` §Timeline.
//
// El patrón de HubSpot: la ficha de una entidad no es sólo sus campos, es lo que le pasó. Una fila
// por evento — fecha mono · tipo en versalitas · texto · importe a la derecha— y los últimos N con
// «Ver todo (N) →». Mostrar los 400 eventos de un cliente en su ficha no es transparencia: es
// esconder los tres que importan entre 397 que no.

export type Evento = {
  id: string
  fecha: ReactNode
  tipo: string
  texto: ReactNode
  derecha?: ReactNode
  tono?: 'neg' | 'warn'
}

export function Timeline({
  eventos,
  total,
  verTodo,
  vacio = 'Todavía no hay movimientos registrados.',
  testid = 'timeline',
}: {
  eventos: Evento[]
  total?: number
  verTodo?: ReactNode
  vacio?: ReactNode
  testid?: string
}) {
  if (eventos.length === 0) return <Vacio>{vacio}</Vacio>
  return (
    <div data-testid={testid}>
      <ul className="divide-y divide-[#EFEEEA]">
        {eventos.map((e) => (
          <li key={e.id} className="flex items-baseline gap-3 py-2.5" data-testid="evento">
            {/* 58px: `dd/mm/aa` en mono tabular. Con 52 el año quedaba fuera y la fecha mentía por
                omisión — en una lista que abarca años, «20/08» no dice de cuándo es. */}
            <span className="w-[58px] shrink-0 font-mono text-[11.5px] tabular-nums text-muted">{e.fecha}</span>
            <span className="w-[92px] shrink-0 text-[10px] uppercase tracking-[0.06em] text-faint">{e.tipo}</span>
            <span className={`min-w-0 flex-1 text-[13px] ${e.tono === 'neg' ? 'text-neg' : e.tono === 'warn' ? 'text-warn' : 'text-ink-soft'}`}>
              {e.texto}
            </span>
            {e.derecha && <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-ink">{e.derecha}</span>}
          </li>
        ))}
      </ul>
      {total !== undefined && total > eventos.length && verTodo && (
        <div className="pt-2 text-[12.5px]">{verTodo}</div>
      )}
    </div>
  )
}
