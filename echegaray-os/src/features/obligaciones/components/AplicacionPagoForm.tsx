'use client'

import { useActionState } from 'react'
import { createAplicacionPagoAction, type ActionState } from '../services/actions'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

const initialState: ActionState = { error: null }

export function AplicacionPagoForm({
  obligacionId,
  obraId,
  movimientosDePago,
}: {
  obligacionId: string
  obraId?: string | null
  movimientosDePago: MovimientoCaja[]
}) {
  const [state, formAction, pending] = useActionState(createAplicacionPagoAction, initialState)

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2 rounded border border-dashed p-3 text-sm">
      <input type="hidden" name="obligacion_id" value={obligacionId} />
      {obraId && <input type="hidden" name="obra_id_para_revalidar" value={obraId} />}

      <select name="movimiento_caja_id" required defaultValue="" className="w-72 rounded border px-2 py-1">
        <option value="" disabled>
          Elegí un pago...
        </option>
        {movimientosDePago.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fecha_real ?? m.fecha_esperada} — {m.concepto} (${m.monto})
          </option>
        ))}
      </select>

      <input
        name="monto_aplicado"
        type="number"
        step="0.01"
        placeholder="Monto a aplicar"
        required
        className="rounded border px-2 py-1"
      />

      <input name="notas" placeholder="Notas (opcional)" className="w-48 rounded border px-2 py-1" />

      {state.error && <span className="w-full text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Aplicando...' : 'Aplicar pago'}
      </button>
    </form>
  )
}
