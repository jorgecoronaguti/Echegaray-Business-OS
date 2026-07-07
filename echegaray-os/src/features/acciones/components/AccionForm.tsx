'use client'

import { useActionState } from 'react'
import { crearAccionManualAction, type ActionState } from '../services/actions'
import { AREAS_OS, AREA_LABEL } from '@/features/areas/types'
import type { Obra } from '@/features/obras/types'

const initialState: ActionState = { error: null }

export function AccionForm({ obras }: { obras: Obra[] }) {
  const [state, formAction, pending] = useActionState(crearAccionManualAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <div className="flex flex-wrap gap-2">
        <input name="titulo" placeholder="Qué hay que hacer" required className="w-72 rounded border px-2 py-1" />

        <select name="area" defaultValue={AREAS_OS[0]} required className="rounded border px-2 py-1">
          {AREAS_OS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABEL[a]}
            </option>
          ))}
        </select>

        <select name="obra_id" defaultValue="" className="rounded border px-2 py-1">
          <option value="">Sin obra asociada</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <input name="contraparte" placeholder="Contraparte (cliente/proveedor/persona)" className="w-64 rounded border px-2 py-1" />
        <input name="monto" type="number" step="0.01" placeholder="Monto afectado (opcional)" className="rounded border px-2 py-1" />
        <label className="flex flex-col text-sm">
          Fecha límite
          <input name="fecha_limite" type="date" className="rounded border px-2 py-1" />
        </label>
        <input name="responsable" placeholder="Responsable (opcional)" className="rounded border px-2 py-1" />
      </div>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Crear acción'}
      </button>
    </form>
  )
}
