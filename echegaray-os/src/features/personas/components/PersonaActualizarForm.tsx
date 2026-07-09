'use client'

import { useActionState } from 'react'
import { actualizarPersonaAction, type ActionState } from '../services/actions'
import type { Persona } from '../types'

const initialState: ActionState = { error: null }

export function PersonaActualizarForm({ persona }: { persona: Persona }) {
  const [state, formAction, pending] = useActionState(actualizarPersonaAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-dashed p-3 text-sm" data-testid="persona-actualizar-form">
      <input type="hidden" name="persona_id" value={persona.id} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col">
          Categoría
          <input name="categoria" defaultValue={persona.categoria ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Especialidad
          <input name="especialidad" defaultValue={persona.especialidad ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Retribución pactada
          <input
            name="retribucion_pactada"
            type="number"
            step="0.01"
            defaultValue={persona.retribucion_pactada ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          Fecha de baja
          <input
            name="fecha_egreso"
            type="date"
            defaultValue={persona.fecha_egreso ?? ''}
            className="rounded border px-2 py-1"
            data-testid="persona-fecha-egreso-input"
          />
        </label>
        <label className="col-span-2 flex flex-col sm:col-span-4">
          Notas
          <input name="notas" defaultValue={persona.notas ?? ''} className="rounded border px-2 py-1" />
        </label>
      </div>

      {state.error && <span className="text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </form>
  )
}
