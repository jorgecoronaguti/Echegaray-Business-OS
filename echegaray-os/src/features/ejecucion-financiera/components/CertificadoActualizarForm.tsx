'use client'

import { useActionState } from 'react'
import { actualizarCertificadoAction, type ActionState } from '../services/actions'
import type { Certificado } from '../types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

const initialState: ActionState = { error: null }

export function CertificadoActualizarForm({
  certificado,
  obraId,
  movimientosDeCobro,
}: {
  certificado: Certificado
  obraId: string
  movimientosDeCobro: MovimientoCaja[]
}) {
  const [state, formAction, pending] = useActionState(actualizarCertificadoAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-dashed p-3 text-sm">
      <input type="hidden" name="certificado_id" value={certificado.id} />
      <input type="hidden" name="obra_id_para_revalidar" value={obraId} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col">
          Facturación
          <input
            name="fecha_facturacion"
            type="date"
            defaultValue={certificado.fecha_facturacion ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          Monto facturado
          <input
            name="monto_facturado"
            type="number"
            step="0.01"
            defaultValue={certificado.monto_facturado ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          N° factura
          <input
            name="referencia_factura"
            defaultValue={certificado.referencia_factura ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          Vencimiento (si se conoce)
          <input
            name="fecha_vencimiento"
            type="date"
            defaultValue={certificado.fecha_vencimiento ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>

        <label className="flex flex-col">
          Cobranza
          <input
            name="fecha_cobranza"
            type="date"
            defaultValue={certificado.fecha_cobranza ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          Monto cobrado
          <input
            name="monto_cobrado"
            type="number"
            step="0.01"
            defaultValue={certificado.monto_cobrado ?? ''}
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="col-span-2 flex flex-col">
          Movimiento de caja (cobro) vinculado
          <select
            name="movimiento_caja_id"
            defaultValue={certificado.movimiento_caja_id ?? ''}
            className="rounded border px-2 py-1"
          >
            <option value="">Sin vínculo</option>
            {movimientosDeCobro.map((m) => (
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
        {pending ? 'Guardando...' : 'Actualizar certificado'}
      </button>
    </form>
  )
}
