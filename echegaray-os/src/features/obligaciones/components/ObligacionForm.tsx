'use client'

import { useActionState } from 'react'
import { createObligacionAction, type ActionState } from '../services/actions'
import type { Proveedor } from '@/features/fundacion/types'
import type { Obra } from '@/features/obras/types'
import type { Compra } from '@/features/compras/types'

const initialState: ActionState = { error: null }

export function ObligacionForm({
  obraId,
  obras = [],
  proveedores,
  compras = [],
}: {
  obraId?: string
  obras?: Obra[]
  proveedores: Proveedor[]
  compras?: Compra[]
}) {
  const [state, formAction, pending] = useActionState(createObligacionAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      {obraId && <input type="hidden" name="obra_id" value={obraId} />}

      <div className="flex flex-wrap gap-2">
        {!obraId && (
          <select name="obra_id" defaultValue="" className="rounded border px-2 py-1">
            <option value="">Sin obra (obligación general de empresa)</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        )}

        <select name="proveedor_id" defaultValue="" className="rounded border px-2 py-1">
          <option value="">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        {compras.length > 0 && (
          <select name="compra_id" defaultValue="" className="w-64 rounded border px-2 py-1">
            <option value="">Sin vínculo a compra</option>
            {compras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.concepto}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input name="concepto" placeholder="Concepto" required className="w-64 rounded border px-2 py-1" />

        <input
          name="monto_total"
          type="number"
          step="0.01"
          placeholder="Monto total"
          required
          className="rounded border px-2 py-1"
        />

        <label className="flex flex-col text-sm">
          Fecha de origen
          <input name="fecha_origen" type="date" required className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col text-sm">
          Vencimiento (si se conoce)
          <input name="fecha_vencimiento" type="date" className="rounded border px-2 py-1" />
        </label>

        <input
          name="fuente_legacy"
          placeholder="Fuente (ej. manual, saldo_inicial_legacy)"
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
        {pending ? 'Guardando...' : 'Registrar obligación'}
      </button>
    </form>
  )
}
