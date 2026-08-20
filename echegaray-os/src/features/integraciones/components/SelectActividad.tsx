'use client'

import { useState } from 'react'
import { CAMPO } from '@/shared/components/ds'
import type { ActividadOpcion } from '../services/operacionGlobalService'
import type { ActionState } from '../services/pedidosActions'

// «PARA QUÉ ACTIVIDAD ES ESTE PEDIDO» — un solo campo, así que GUARDA AL ELEGIR.
//
// Un botón «guardar» por fila en una lista de treinta pedidos son treinta clics de más para un dato
// que es un desplegable. El handoff lo pide explícito («select que guarda al elegir») y el DS lo
// permite exactamente para este caso: campo único, sin formulario alrededor.
//
// ES OPCIONAL Y SE VE QUE LO ES: «sin asignar» en `faint`, no un hueco. La obra sigue siendo el eje
// del pedido; esto contesta «¿qué está esperando esta actividad?» cuando alguien lo sabe.
//
// ═══ UNA ASIGNACIÓN QUE NO ESTÁ EN LA LISTA NO SE PISA EN SILENCIO ═══
//
// Si el pedido apunta a una actividad archivada —o a una que este usuario no ve—, el `select` con
// `defaultValue` desconocido pinta la PRIMERA opción: la pantalla diría que el pedido es de otra
// actividad sin que nadie lo haya cambiado. Por eso, cuando el valor guardado no está entre las
// opciones, se agrega una opción que lo dice.

export function SelectActividad({
  valor,
  actividades,
  alElegir,
  testid = 'pedido-actividad',
}: {
  valor: string | null
  actividades: ActividadOpcion[]
  alElegir: (actividadId: string) => Promise<ActionState>
  testid?: string
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const huerfana = Boolean(valor) && !actividades.some((a) => a.id === valor)

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <select
        defaultValue={valor ?? ''}
        disabled={guardando}
        data-testid={testid}
        aria-label="Para la actividad"
        className={`${CAMPO} h-[30px] max-w-[220px] border-line px-1.5 py-0 text-[12.5px] text-muted max-lg:h-control-movil`}
        onChange={async (e) => {
          setGuardando(true)
          setError(null)
          const r = await alElegir(e.target.value)
          setGuardando(false)
          setError(r.error)
        }}
      >
        <option value="">sin asignar</option>
        {huerfana && <option value={valor as string}>actividad asignada (fuera de la lista)</option>}
        {actividades.map((a) => (
          <option key={a.id} value={a.id}>
            {a.codigo ? `${a.codigo} · ${a.nombre}` : a.nombre}
          </option>
        ))}
      </select>
      {error && <span className="text-[11.5px] text-neg">{error}</span>}
    </span>
  )
}
