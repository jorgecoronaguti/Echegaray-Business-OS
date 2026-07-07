'use client'

import { useActionState } from 'react'
import { actualizarCompraAction, type ActionState } from '../services/actions'
import type { Compra } from '../types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

const initialState: ActionState = { error: null }

export function CompraActualizarForm({
  compra,
  obraId,
  movimientosDePago,
}: {
  compra: Compra
  obraId: string
  movimientosDePago: MovimientoCaja[]
}) {
  const [state, formAction, pending] = useActionState(actualizarCompraAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-dashed p-3 text-sm">
      <input type="hidden" name="compra_id" value={compra.id} />
      <input type="hidden" name="obra_id_para_revalidar" value={obraId} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col">
          Solicitud
          <input name="fecha_solicitud" type="date" defaultValue={compra.fecha_solicitud ?? ''} className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col">
          Cotización
          <input name="fecha_cotizacion" type="date" defaultValue={compra.fecha_cotizacion ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Monto cotizado
          <input
            name="monto_cotizado"
            type="number"
            step="0.01"
            defaultValue={compra.monto_cotizado ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col">
          Orden
          <input name="fecha_orden" type="date" defaultValue={compra.fecha_orden ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Monto de la orden
          <input
            name="monto_orden"
            type="number"
            step="0.01"
            defaultValue={compra.monto_orden ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          N° de orden
          <input name="referencia_orden" defaultValue={compra.referencia_orden ?? ''} className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col">
          Entrega prevista (si se conoce)
          <input
            name="fecha_entrega_prevista"
            type="date"
            defaultValue={compra.fecha_entrega_prevista ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col">
          Recepción
          <input name="fecha_recepcion" type="date" defaultValue={compra.fecha_recepcion ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Monto recibido
          <input
            name="monto_recibido"
            type="number"
            step="0.01"
            defaultValue={compra.monto_recibido ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="col-span-2 flex flex-col">
          Vincular un pago existente (cuota, pago parcial)
          <select name="movimiento_caja_id_a_vincular" defaultValue="" className="rounded border px-2 py-1">
            <option value="">Sin nuevo vínculo</option>
            {movimientosDePago.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fecha_real ?? m.fecha_esperada} — {m.concepto} (${m.monto})
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.error && <span className="text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Actualizar compra'}
      </button>
    </form>
  )
}
