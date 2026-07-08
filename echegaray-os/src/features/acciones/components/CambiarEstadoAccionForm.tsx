'use client'

import { useActionState, useState } from 'react'
import { cambiarEstadoAccionAction, type ActionState } from '../services/actions'
import type { Accion, EstadoAccion } from '../types'
import { ESTADO_ACCION_LABEL } from '../types'

const initialState: ActionState = { error: null }
const ESTADOS: EstadoAccion[] = ['pendiente', 'en_curso', 'resuelta', 'descartada']

export function CambiarEstadoAccionForm({ accion }: { accion: Accion }) {
  const [state, formAction, pending] = useActionState(cambiarEstadoAccionAction, initialState)
  const [estadoElegido, setEstadoElegido] = useState<EstadoAccion>(accion.estado)
  const requiereCierre = estadoElegido === 'resuelta' || estadoElegido === 'descartada'

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="accion_id" value={accion.id} />

      <label className="flex flex-col text-xs">
        Estado
        <select
          name="estado"
          value={estadoElegido}
          onChange={(e) => setEstadoElegido(e.target.value as EstadoAccion)}
          className="rounded border px-2 py-1 text-sm"
        >
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_ACCION_LABEL[e]}
            </option>
          ))}
        </select>
      </label>

      {requiereCierre && (
        <>
          <label className="flex flex-col text-xs">
            Fecha de resolución
            <input
              name="fecha_resolucion"
              type="date"
              defaultValue={accion.fecha_resolucion ?? ''}
              required
              className="rounded border px-2 py-1 text-sm"
            />
          </label>
          <input
            name="resolucion_notas"
            placeholder="Notas de resolución (opcional)"
            defaultValue={accion.resolucion_notas ?? ''}
            className="w-48 rounded border px-2 py-1 text-sm"
          />
          <input
            name="resultado_real"
            placeholder="Resultado real (opcional)"
            defaultValue={accion.resultado_real ?? ''}
            className="w-48 rounded border px-2 py-1 text-sm"
          />
          <input
            name="aprendizaje_asociado"
            placeholder="Aprendizaje para el futuro (opcional)"
            defaultValue={accion.aprendizaje_asociado ?? ''}
            className="w-56 rounded border px-2 py-1 text-sm"
          />
        </>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-400 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Actualizar'}
      </button>

      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  )
}
