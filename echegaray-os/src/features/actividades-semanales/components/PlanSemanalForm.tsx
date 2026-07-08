'use client'

import { useActionState } from 'react'
import { crearPlanSemanalAction, type ActionState } from '../services/actions'
import { inicioSemanaISO } from '../types'

const initialState: ActionState = { error: null }

export function PlanSemanalForm({ obraId }: { obraId: string }) {
  const [state, formAction, pending] = useActionState(crearPlanSemanalAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4" data-testid="plan-semanal-form">
      <input type="hidden" name="obra_id" value={obraId} />

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col text-sm">
          Semana (lunes)
          <input name="semana_inicio" type="date" required defaultValue={inicioSemanaISO()} className="rounded border px-2 py-1" />
        </label>
        <input name="actividad" placeholder="Actividad" required className="w-72 rounded border px-2 py-1" />
        <input name="responsable" placeholder="Responsable" required className="w-48 rounded border px-2 py-1" />
        <input name="frente" placeholder="Frente (opcional)" className="w-40 rounded border px-2 py-1" />
      </div>

      <div className="flex flex-wrap gap-2">
        <input name="avance_objetivo" type="number" min="0" max="100" placeholder="Avance objetivo %" className="rounded border px-2 py-1" />
        <input name="hh_objetivo" type="number" step="0.5" placeholder="HH objetivo (opcional)" className="rounded border px-2 py-1" />
        <input name="restricciones" placeholder="Restricciones (opcional)" className="w-64 rounded border px-2 py-1" />
        <input name="fuente_legacy" placeholder="Fuente (opcional)" className="w-40 rounded border px-2 py-1" />
      </div>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button type="submit" disabled={pending} className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50">
        {pending ? 'Guardando...' : 'Planificar actividad'}
      </button>
    </form>
  )
}
