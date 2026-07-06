'use client'

import { useActionState } from 'react'
import { createObraAction, type ActionState } from '../services/actions'
import type { Cliente } from '@/features/fundacion/types'

const initialState: ActionState = { error: null }

export function ObraForm({ clientes }: { clientes: Cliente[] }) {
  const [state, formAction, pending] = useActionState(createObraAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <div className="flex flex-wrap gap-2">
        <select name="cliente_id" required defaultValue="" className="rounded border px-2 py-1">
          <option value="" disabled>
            Cliente...
          </option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <input
          name="nombre"
          placeholder="Nombre de la obra"
          required
          className="rounded border px-2 py-1"
        />

        <input
          name="monto_contratado"
          type="number"
          step="0.01"
          placeholder="Monto contratado"
          required
          className="rounded border px-2 py-1"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col text-sm">
          Fecha de inicio
          <input name="fecha_inicio" type="date" required className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col text-sm">
          Fecha objetivo
          <input name="fecha_fin_objetivo" type="date" required className="rounded border px-2 py-1" />
        </label>
      </div>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending || clientes.length === 0}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Contratar obra'}
      </button>
    </form>
  )
}
