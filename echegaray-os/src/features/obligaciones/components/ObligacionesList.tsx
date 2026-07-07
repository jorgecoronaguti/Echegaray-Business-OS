import type { Obligacion, ObligacionResumen, TipoAlertaObligacion } from '../types'
import { calcularAlertasObligacion, calcularAlertasGeneralesObligaciones } from '../types'
import { AplicacionPagoForm } from './AplicacionPagoForm'
import type { Proveedor } from '@/features/fundacion/types'
import type { Obra } from '@/features/obras/types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

const ALERTA_CLASSNAME: Record<TipoAlertaObligacion, string> = {
  vencida: 'bg-red-100 text-red-800',
  proxima_a_vencer: 'bg-amber-100 text-amber-800',
  parcialmente_pagada: 'bg-blue-100 text-blue-800',
  sin_vencimiento: 'bg-gray-200 text-gray-800',
  sin_trazabilidad: 'bg-gray-200 text-gray-800',
}

export function ObligacionesList({
  obligaciones,
  resumenes,
  proveedores,
  obras = [],
  movimientosDePago,
  obraId,
}: {
  obligaciones: Obligacion[]
  resumenes: ObligacionResumen[]
  proveedores: Proveedor[]
  obras?: Obra[]
  movimientosDePago: MovimientoCaja[]
  obraId?: string
}) {
  const proveedorNombre = (id: string | null) => proveedores.find((p) => p.id === id)?.nombre ?? '—'
  const obraNombre = (id: string | null) => obras.find((o) => o.id === id)?.nombre ?? 'Sin obra'
  const alertasGenerales = calcularAlertasGeneralesObligaciones(resumenes)

  if (obligaciones.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">Sin obligaciones registradas todavía.</p>
  }

  return (
    <div className="mt-3 space-y-3">
      {alertasGenerales.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="obligaciones-alertas-generales">
          {alertasGenerales.map((a, i) => (
            <span key={i} className="inline-block rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
              {a.mensaje}
            </span>
          ))}
        </div>
      )}

      <ul className="space-y-3" data-testid="obligaciones-list">
        {obligaciones.map((o) => {
          const resumen = resumenes.find((r) => r.obligacion_id === o.id)
          const alertas = resumen ? calcularAlertasObligacion(resumen) : []

          return (
            <li key={o.id} className="rounded border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold">{o.concepto}</p>
                  <p className="text-sm text-gray-600">
                    {proveedorNombre(o.proveedor_id)}
                    {!obraId ? ` · ${obraNombre(o.obra_id)}` : ''} · Origen {o.fecha_origen}
                    {o.fecha_vencimiento ? ` · Vence ${o.fecha_vencimiento}` : ''}
                  </p>
                </div>
                {resumen && (
                  <p className="text-sm font-semibold">
                    ${resumen.saldo_pendiente} pendiente de ${resumen.monto_total}
                  </p>
                )}
              </div>

              {alertas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" data-testid="obligacion-alertas">
                  {alertas.map((a, i) => (
                    <span
                      key={i}
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ALERTA_CLASSNAME[a.tipo]}`}
                    >
                      {a.mensaje}
                    </span>
                  ))}
                </div>
              )}

              {resumen && resumen.saldo_pendiente > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-600">Aplicar un pago</summary>
                  <div className="mt-2">
                    <AplicacionPagoForm
                      obligacionId={o.id}
                      obraId={o.obra_id}
                      movimientosDePago={movimientosDePago}
                    />
                  </div>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
