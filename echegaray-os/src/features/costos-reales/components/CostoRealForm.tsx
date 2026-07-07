'use client'

import { useActionState } from 'react'
import { createCostoRealAction, type ActionState } from '../services/actions'
import type { Proveedor } from '@/features/fundacion/types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'
import type { Compra } from '@/features/compras/types'

const initialState: ActionState = { error: null }

export function CostoRealForm({
  obraId,
  proveedores,
  movimientosDePago,
  compras = [],
}: {
  obraId: string
  proveedores: Proveedor[]
  movimientosDePago: MovimientoCaja[]
  compras?: Compra[]
}) {
  const [state, formAction, pending] = useActionState(createCostoRealAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <input type="hidden" name="obra_id" value={obraId} />

      <div className="flex flex-wrap gap-2">
        <input
          name="concepto"
          placeholder="Concepto (ej. Compra de materiales)"
          required
          className="w-64 rounded border px-2 py-1"
        />

        <select name="proveedor_id" defaultValue="" className="rounded border px-2 py-1">
          <option value="">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        <input
          name="monto"
          type="number"
          step="0.01"
          placeholder="Monto"
          required
          className="rounded border px-2 py-1"
        />

        <label className="flex flex-col text-sm">
          Fecha
          <input name="fecha" type="date" required className="rounded border px-2 py-1" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <select name="estado" defaultValue="pendiente" className="rounded border px-2 py-1">
          <option value="comprometido">Comprometido</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
        </select>

        <select name="movimiento_caja_id" defaultValue="" className="w-72 rounded border px-2 py-1">
          <option value="">Sin vínculo a movimiento de caja</option>
          {movimientosDePago.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fecha_real ?? m.fecha_esperada} — {m.concepto} (${m.monto})
            </option>
          ))}
        </select>

        <input
          name="fuente_legacy"
          placeholder="Fuente (ej. CONTROL DE GASTOS.xlsx)"
          required
          className="w-64 rounded border px-2 py-1"
        />

        <select name="compra_id" defaultValue="" className="w-72 rounded border px-2 py-1">
          <option value="">Sin vínculo a compra</option>
          {compras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.concepto} ({c.fecha_necesidad})
            </option>
          ))}
        </select>
      </div>

      <textarea name="notas" placeholder="Notas (opcional)" className="rounded border px-2 py-1" />

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Registrar costo real'}
      </button>
    </form>
  )
}
