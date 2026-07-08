'use client'

import { useActionState } from 'react'
import type { BacklogItem } from '../types'
import { crearAccionDesdeBacklogAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function ConvertirBacklogEnAccionForm({ item }: { item: BacklogItem }) {
  const [state, formAction, isPending] = useActionState(crearAccionDesdeBacklogAction, initialState)

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="backlog_id" value={item.id} />
      <input type="hidden" name="backlog_titulo" value={item.titulo} />
      <input type="hidden" name="backlog_evidencia" value={item.evidencia} />
      <input type="hidden" name="backlog_tipo" value={item.tipo} />
      <input type="hidden" name="backlog_impacto" value={item.impacto} />
      <input type="hidden" name="backlog_confianza" value={item.confianza} />

      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-gray-400 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        data-testid="convertir-backlog-en-accion-btn"
      >
        {isPending ? 'Convirtiendo…' : 'Convertir en acción'}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  )
}
