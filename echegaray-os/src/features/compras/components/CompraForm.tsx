'use client'

import { useActionState } from 'react'
import { createCompraAction, type ActionState } from '../services/actions'
import type { Proveedor } from '@/features/fundacion/types'

const initialState: ActionState = { error: null }

export function CompraForm({ obraId, proveedores }: { obraId: string; proveedores: Proveedor[] }) {
  const [state, formAction, pending] = useActionState(createCompraAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <input type="hidden" name="obra_id" value={obraId} />

      <div className="flex flex-wrap gap-2">
        <input
          name="concepto"
          placeholder="Concepto (qué se necesita comprar)"
          required
          className="w-64 rounded border px-2 py-1"
        />

        <select name="proveedor_id" defaultValue="" className="rounded border px-2 py-1">
          <option value="">Sin proveedor todavía</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        <label className="flex flex-col text-sm">
          Fecha de necesidad
          <input name="fecha_necesidad" type="date" required className="rounded border px-2 py-1" />
        </label>

        <input
          name="fuente_legacy"
          placeholder="Fuente (ej. manual)"
          required
          className="w-48 rounded border px-2 py-1"
        />
      </div>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Registrar necesidad de compra'}
      </button>
    </form>
  )
}
