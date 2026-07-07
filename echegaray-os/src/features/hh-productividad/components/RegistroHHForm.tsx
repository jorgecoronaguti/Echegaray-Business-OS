'use client'

import { useActionState } from 'react'
import { createRegistroHHAction, type ActionState } from '../services/actions'
import type { CostoReal } from '@/features/costos-reales/types'

const initialState: ActionState = { error: null }

export function RegistroHHForm({
  obraId,
  costosReales,
}: {
  obraId: string
  costosReales: CostoReal[]
}) {
  const [state, formAction, pending] = useActionState(createRegistroHHAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <input type="hidden" name="obra_id" value={obraId} />

      <div className="flex flex-wrap gap-2">
        <input
          name="trabajador_o_cuadrilla"
          placeholder="Trabajador o cuadrilla"
          required
          className="w-56 rounded border px-2 py-1"
        />

        <select name="categoria" defaultValue="" className="rounded border px-2 py-1">
          <option value="">Categoría (opcional)</option>
          <option value="oficial_especializado">Oficial especializado</option>
          <option value="oficial">Oficial</option>
          <option value="medio_oficial">Medio oficial</option>
          <option value="ayudante">Ayudante</option>
        </select>

        <label className="flex flex-col text-sm">
          Semana (lunes)
          <input name="fecha_inicio_semana" type="date" required className="rounded border px-2 py-1" />
        </label>

        <input
          name="horas"
          type="number"
          step="0.5"
          placeholder="Horas de la semana"
          required
          className="rounded border px-2 py-1"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <select name="costo_real_id" defaultValue="" className="w-72 rounded border px-2 py-1">
          <option value="">Sin vínculo con costo real</option>
          {costosReales.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fecha} — {c.concepto} (${c.monto})
            </option>
          ))}
        </select>

        <input
          name="fuente_legacy"
          placeholder="Fuente (ej. JORNALES)"
          required
          className="w-56 rounded border px-2 py-1"
        />
      </div>

      <textarea name="notas" placeholder="Notas (opcional)" className="rounded border px-2 py-1" />

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Registrar HH de la semana'}
      </button>
    </form>
  )
}
