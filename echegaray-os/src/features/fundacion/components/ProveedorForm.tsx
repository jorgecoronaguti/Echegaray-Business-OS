'use client'

import { useActionState } from 'react'
import { createProveedorAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function ProveedorForm() {
  const [state, formAction, pending] = useActionState(createProveedorAction, initialState)

  return (
    <form action={formAction} className="flex items-start gap-2">
      <div className="flex flex-col">
        <input
          name="nombre"
          placeholder="Nombre del proveedor"
          required
          className="rounded border px-2 py-1"
        />
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Agregar'}
      </button>
    </form>
  )
}
