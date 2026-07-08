'use client'

import { useActionState, useState } from 'react'
import { actualizarBloqueoAccionAction, type ActionState } from '../services/actions'
import type { Accion } from '../types'

const initialState: ActionState = { error: null }

export function BloqueoAccionForm({ accion }: { accion: Accion }) {
  const [state, formAction, pending] = useActionState(actualizarBloqueoAccionAction, initialState)
  const [bloqueada, setBloqueada] = useState(accion.bloqueada)

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2 border-t pt-2">
      <input type="hidden" name="accion_id" value={accion.id} />
      <input type="hidden" name="bloqueada" value={bloqueada ? 'true' : 'false'} />

      <button
        type="button"
        onClick={() => setBloqueada((b) => !b)}
        className={`rounded border px-2 py-1 text-xs font-medium ${bloqueada ? 'border-red-400 bg-red-50 text-red-800' : 'border-gray-300'}`}
        data-testid="toggle-bloqueada"
      >
        {bloqueada ? '⛔ Bloqueada' : 'Marcar como bloqueada'}
      </button>

      {bloqueada && (
        <input
          name="motivo_bloqueo"
          placeholder="Motivo del bloqueo"
          defaultValue={accion.motivo_bloqueo ?? ''}
          className="w-56 rounded border px-2 py-1 text-sm"
        />
      )}

      <input
        name="evidencia"
        placeholder="Evidencia (link o nota, opcional)"
        defaultValue={accion.evidencia ?? ''}
        className="w-56 rounded border px-2 py-1 text-sm"
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded border border-gray-400 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar'}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  )
}
