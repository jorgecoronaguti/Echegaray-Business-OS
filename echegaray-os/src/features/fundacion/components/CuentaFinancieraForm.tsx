'use client'

import { useActionState } from 'react'
import { createCuentaFinancieraAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function CuentaFinancieraForm() {
  const [state, formAction, pending] = useActionState(createCuentaFinancieraAction, initialState)

  return (
    <form action={formAction} className="flex items-start gap-2">
      <input
        name="nombre"
        placeholder="Nombre de la cuenta"
        required
        className="rounded border px-2 py-1"
      />
      <select name="tipo" required defaultValue="banco" className="rounded border px-2 py-1">
        <option value="banco">Banco</option>
        <option value="caja">Caja</option>
      </select>
      <div className="flex flex-col">
        <input
          name="saldo_inicial"
          type="number"
          step="0.01"
          placeholder="Saldo inicial"
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
