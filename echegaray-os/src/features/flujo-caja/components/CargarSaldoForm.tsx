'use client'

import { useActionState } from 'react'
import { cargarSaldoCajaAction, type CargarSaldoState } from '../services/cargarSaldoAction'

const initialState: CargarSaldoState = { ok: null, error: null }

// Carga diaria del saldo real por cuenta. Alimenta el panel de Caja del Sheet,
// el RESUMEN, el calendario y el número de saldo de los reportes.
export function CargarSaldoForm() {
  const [state, formAction, isPending] = useActionState(cargarSaldoCajaAction, initialState)

  return (
    <details className="rounded-lg border bg-white p-3 shadow-sm" data-testid="cargar-saldo-section">
      <summary className="cursor-pointer text-sm font-semibold text-gray-800">💵 Cargar saldo de hoy</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3" data-testid="cargar-saldo-form">
        <label className="flex flex-col text-xs text-gray-600">
          Cuenta
          <select name="cuenta" className="mt-1 rounded border px-2 py-1.5 text-sm" required>
            <option value="Banco Santander">Banco Santander</option>
            <option value="Efectivo">Efectivo</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-gray-600">
          Saldo ($)
          <input
            name="saldo"
            type="number"
            step="0.01"
            required
            className="mt-1 w-40 rounded border px-2 py-1.5 text-sm tabular-nums"
            placeholder="0,00"
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col text-xs text-gray-600">
          Notas (opcional)
          <input name="notas" type="text" maxLength={300} className="mt-1 rounded border px-2 py-1.5 text-sm" />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          data-testid="cargar-saldo-submit"
        >
          {isPending ? 'Cargando…' : 'Cargar'}
        </button>
      </form>
      {state.ok && (
        <p className="mt-2 text-xs text-green-700" data-testid="cargar-saldo-ok">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-xs text-red-700" data-testid="cargar-saldo-error">
          {state.error}
        </p>
      )}
    </details>
  )
}
