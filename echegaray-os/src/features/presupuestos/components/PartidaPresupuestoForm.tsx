'use client'

import { useActionState } from 'react'
import { createPartidaPresupuestoAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function PartidaPresupuestoForm({
  presupuestoId,
  obraId,
}: {
  presupuestoId: string
  obraId: string
}) {
  const [state, formAction, pending] = useActionState(createPartidaPresupuestoAction, initialState)

  return (
    <form action={formAction} className="flex items-start gap-2">
      <input type="hidden" name="presupuesto_id" value={presupuestoId} />
      <input type="hidden" name="obra_id_para_revalidar" value={obraId} />

      <input name="codigo" placeholder="Código (ej. T1001)" className="w-32 rounded border px-2 py-1" />

      <div className="flex flex-col">
        <input
          name="descripcion"
          placeholder="Descripción de la partida"
          required
          className="w-64 rounded border px-2 py-1"
        />
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>

      <input
        name="monto"
        type="number"
        step="0.01"
        placeholder="Monto"
        required
        className="rounded border px-2 py-1"
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Agregar partida'}
      </button>
    </form>
  )
}
