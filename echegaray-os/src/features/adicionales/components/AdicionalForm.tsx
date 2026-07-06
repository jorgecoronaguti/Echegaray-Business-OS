'use client'

import { useActionState } from 'react'
import { createAdicionalAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function AdicionalForm({ obraId }: { obraId: string }) {
  const [state, formAction, pending] = useActionState(createAdicionalAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <input type="hidden" name="obra_id" value={obraId} />

      <div className="flex flex-wrap gap-2">
        <input
          name="concepto"
          placeholder="Concepto (qué es el adicional)"
          required
          className="w-64 rounded border px-2 py-1"
        />
        <input
          name="origen"
          placeholder="Origen (qué lo originó)"
          required
          className="w-64 rounded border px-2 py-1"
        />
        <input
          name="detectado_por"
          placeholder="Detectado por"
          required
          className="rounded border px-2 py-1"
        />
        <label className="flex flex-col text-sm">
          Fecha de detección
          <input name="fecha_deteccion" type="date" required className="rounded border px-2 py-1" />
        </label>
      </div>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Registrar adicional detectado'}
      </button>
    </form>
  )
}
