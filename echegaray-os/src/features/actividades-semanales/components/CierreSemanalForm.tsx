'use client'

import { useActionState } from 'react'
import { cerrarSemanaAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

// Cierre de semana (Viernes) -- solo pide lo que el sistema no puede conocer por otra
// vía: avance real y causa de desvío. No repite nada de lo ya planificado.
export function CierreSemanalForm({ obraId, actividadId }: { obraId: string; actividadId: string }) {
  const [state, formAction, pending] = useActionState(cerrarSemanaAction, initialState)

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" data-testid="cierre-semanal-form">
      <input type="hidden" name="obra_id" value={obraId} />
      <input type="hidden" name="actividad_id" value={actividadId} />
      <input name="avance_real" type="number" min="0" max="100" placeholder="Avance real %" required className="w-32 rounded border px-2 py-1" />
      <input name="hh_real" type="number" step="0.5" placeholder="HH real (si se conoce)" className="w-40 rounded border px-2 py-1" />
      <input name="causa_desvio" placeholder="Causa de desvío (si hubo)" className="w-56 rounded border px-2 py-1" />
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      <button type="submit" disabled={pending} className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50">
        {pending ? 'Guardando...' : 'Cerrar semana'}
      </button>
    </form>
  )
}
