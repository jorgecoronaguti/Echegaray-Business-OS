'use client'

// PARA QUÉ ACTIVIDAD ES UN PAPEL — se elige acá o desde el panel de la actividad, y es lo mismo.
//
// El documento sigue siendo DE LA OBRA: esto sólo contesta «¿qué papeles tiene esta actividad?».
// Un plano general no es de ninguna en particular y por eso «ninguna» es una opción de verdad, no
// un estado a completar.
//
// EL BOTÓN APARECE SÓLO CUANDO EL VALOR CAMBIÓ. Un guardado que se dispara con el `onChange` del
// desplegable escribe cada vez que alguien lo recorre con el teclado.

import { useState } from 'react'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad } from '../types'

export function AsignarActividad({ driveFileId, actual, actividades, asignar }: {
  driveFileId: string
  actual: string | null
  actividades: Actividad[]
  asignar: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
}) {
  const [valor, setValor] = useState(actual ?? '')
  return (
    <div className="flex items-center gap-1.5" data-testid="asignar-actividad">
      <select
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        aria-label="Actividad del documento"
        className="min-w-0 max-w-[180px] flex-1 truncate rounded-control border border-line bg-surface px-2 py-1 text-[12px] text-muted"
      >
        <option value="">ninguna</option>
        {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
      </select>
      {valor !== (actual ?? '') && (
        <BotonAccion accion={asignar} args={[driveFileId, valor]} testid="confirmar-actividad-documento" tono="fuerte">
          Guardar
        </BotonAccion>
      )}
    </div>
  )
}
