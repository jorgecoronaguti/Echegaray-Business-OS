'use client'

import { useActionState } from 'react'
import { createPresupuestoAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function PresupuestoForm({ obraId }: { obraId: string }) {
  const [state, formAction, pending] = useActionState(createPresupuestoAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <input type="hidden" name="obra_id" value={obraId} />

      <div className="flex flex-wrap gap-2">
        <select name="estado" defaultValue="borrador" className="rounded border px-2 py-1">
          <option value="borrador">Borrador</option>
          <option value="aprobado">Aprobado (reemplaza la versión vigente)</option>
        </select>

        <input
          name="monto_presupuestado"
          type="number"
          step="0.01"
          placeholder="Monto presupuestado"
          required
          className="rounded border px-2 py-1"
        />

        <input
          name="costo_directo_presupuestado"
          type="number"
          step="0.01"
          placeholder="Costo directo presupuestado"
          required
          className="rounded border px-2 py-1"
        />

        <input
          name="costo_indirecto_presupuestado"
          type="number"
          step="0.01"
          placeholder="Costo indirecto presupuestado"
          className="rounded border px-2 py-1"
        />

        <input
          name="margen_esperado"
          type="number"
          step="0.01"
          placeholder="Margen esperado"
          required
          className="rounded border px-2 py-1"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          name="fuente_legacy"
          placeholder="Fuente (ej. Planilla para Cotizar.xlsm — copia Obra X)"
          required
          className="w-96 rounded border px-2 py-1"
        />

        <label className="flex flex-col text-sm">
          Fecha del presupuesto
          <input name="fecha_presupuesto" type="date" required className="rounded border px-2 py-1" />
        </label>
      </div>

      <textarea name="notas" placeholder="Notas (opcional)" className="rounded border px-2 py-1" />

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Registrar versión de presupuesto'}
      </button>
    </form>
  )
}
