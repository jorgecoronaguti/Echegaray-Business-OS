'use client'

import { useActionState } from 'react'
import { actualizarAdicionalAction, type ActionState } from '../services/actions'
import type { Adicional } from '../types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

const initialState: ActionState = { error: null }

export function AdicionalActualizarForm({
  adicional,
  obraId,
  movimientosDeCobro,
}: {
  adicional: Adicional
  obraId: string
  movimientosDeCobro: MovimientoCaja[]
}) {
  const [state, formAction, pending] = useActionState(actualizarAdicionalAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-dashed p-3 text-sm">
      <input type="hidden" name="adicional_id" value={adicional.id} />
      <input type="hidden" name="obra_id_para_revalidar" value={obraId} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col">
          Cotización
          <input name="fecha_cotizacion" type="date" defaultValue={adicional.fecha_cotizacion ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Monto cotizado
          <input
            name="monto_cotizado"
            type="number"
            step="0.01"
            defaultValue={adicional.monto_cotizado ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col">
          Aprobación
          <input name="fecha_aprobacion" type="date" defaultValue={adicional.fecha_aprobacion ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Monto aprobado
          <input
            name="monto_aprobado"
            type="number"
            step="0.01"
            defaultValue={adicional.monto_aprobado ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col">
          Ejecución
          <input name="fecha_ejecucion" type="date" defaultValue={adicional.fecha_ejecucion ?? ''} className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col">
          Facturación
          <input name="fecha_facturacion" type="date" defaultValue={adicional.fecha_facturacion ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Monto facturado
          <input
            name="monto_facturado"
            type="number"
            step="0.01"
            defaultValue={adicional.monto_facturado ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          N° factura
          <input name="referencia_factura" defaultValue={adicional.referencia_factura ?? ''} className="rounded border px-2 py-1" />
        </label>

        <label className="flex flex-col">
          Cobranza
          <input name="fecha_cobranza" type="date" defaultValue={adicional.fecha_cobranza ?? ''} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col">
          Monto cobrado
          <input
            name="monto_cobrado"
            type="number"
            step="0.01"
            defaultValue={adicional.monto_cobrado ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="col-span-2 flex flex-col">
          Movimiento de caja (cobro) vinculado
          <select name="movimiento_caja_id" defaultValue={adicional.movimiento_caja_id ?? ''} className="rounded border px-2 py-1">
            <option value="">Sin vínculo</option>
            {movimientosDeCobro.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fecha_real ?? m.fecha_esperada} — {m.concepto} (${m.monto})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="frenado" defaultChecked={adicional.frenado} />
          Marcar como frenado
        </label>
        <input
          name="motivo_frenado"
          placeholder="Motivo (obligatorio si está frenado)"
          defaultValue={adicional.motivo_frenado ?? ''}
          className="w-64 rounded border px-2 py-1"
        />
      </div>

      {state.error && <span className="text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Actualizar adicional'}
      </button>
    </form>
  )
}
