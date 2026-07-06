'use client'

import { useActionState } from 'react'
import { createObraAction, type ActionState } from '../services/actions'
import type { Cliente } from '../types'

const initialState: ActionState = { error: null }

export function ObraForm({ clientes }: { clientes: Cliente[] }) {
  const [state, formAction, pending] = useActionState(createObraAction, initialState)

  return (
    <form action={formAction} className="flex items-start gap-2">
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
      <div className="flex flex-col">
        <input
          name="nombre"
          placeholder="Nombre de la obra"
          required
          className="rounded border px-2 py-1"
        />
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
      <button
        type="submit"
        disabled={pending || clientes.length === 0}
        className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Agregar'}
      </button>
    </form>
  )
}
