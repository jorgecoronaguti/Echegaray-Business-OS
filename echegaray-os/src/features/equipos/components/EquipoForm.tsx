'use client'

import { useActionState } from 'react'
import { createEquipoAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function EquipoForm() {
  const [state, formAction, pending] = useActionState(createEquipoAction, initialState)

  return (
    <form action={formAction} className="flex flex-wrap gap-2 rounded border p-4" data-testid="equipo-alta-form">
      <input name="nombre" placeholder="Nombre / modelo" required className="rounded border px-2 py-1" />

      <select name="tipo" defaultValue="vehiculo" className="rounded border px-2 py-1">
        <option value="vehiculo">Vehículo</option>
        <option value="maquinaria">Maquinaria</option>
        <option value="herramienta_mayor">Herramienta mayor</option>
      </select>

      <input
        name="patente_o_identificador"
        placeholder="Patente / identificador"
        className="rounded border px-2 py-1"
      />

      <input name="notas" placeholder="Notas (opcional)" className="w-56 rounded border px-2 py-1" />

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Dar de alta'}
      </button>
    </form>
  )
}
