'use client'

import { useActionState } from 'react'
import { eliminarEquipoAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function EliminarEquipoForm({ equipoId }: { equipoId: string }) {
  const [state, formAction, pending] = useActionState(eliminarEquipoAction, initialState)

  return (
    <form action={formAction} data-testid="equipo-eliminar-form" className="inline">
      <input type="hidden" name="equipo_id" value={equipoId} />
      {state.error && <span className="mr-2 text-xs text-red-600">{state.error}</span>}
      <button type="submit" disabled={pending} className="text-xs text-red-700 underline disabled:opacity-50">
        {pending ? 'Dando de baja...' : 'Dar de baja'}
      </button>
    </form>
  )
}
