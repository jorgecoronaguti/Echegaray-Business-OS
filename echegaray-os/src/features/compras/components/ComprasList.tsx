import type { Compra, CompraResumen, TipoAlertaCompra, TipoAlertaObraCompras } from '../types'
import { calcularAlertasCompra, calcularAlertasObraCompras, estadoOperativoCompra } from '../types'
import { CompraActualizarForm } from './CompraActualizarForm'
import type { MovimientoCaja } from '@/features/flujo-caja/types'
import type { Proveedor } from '@/features/fundacion/types'

const ALERTA_CLASSNAME: Record<TipoAlertaCompra, string> = {
  sin_obra: 'bg-gray-200 text-gray-800',
  sin_proveedor: 'bg-gray-200 text-gray-800',
  pendiente_entrega: 'bg-amber-100 text-amber-800',
  entrega_retrasada: 'bg-red-100 text-red-800',
  recibida_sin_costo_real: 'bg-amber-100 text-amber-800',
  costo_sin_pago_trazable: 'bg-amber-100 text-amber-800',
  pagada_no_recibida: 'bg-red-100 text-red-800',
}

const ALERTA_OBRA_CLASSNAME: Record<TipoAlertaObraCompras, string> = {
  concentracion_urgentes: 'bg-red-100 text-red-800',
  proveedor_retrasos_recurrentes: 'bg-amber-100 text-amber-800',
}

const ESTADO_LABEL: Record<string, string> = {
  necesidad: 'Necesidad detectada',
  solicitada: 'Solicitada',
  cotizada: 'Cotizada',
  ordenada: 'Ordenada',
  recibida: 'Recibida',
}

export function ComprasList({
  compras,
  resumenes,
  obraId,
  movimientosDePago,
  proveedores,
}: {
  compras: Compra[]
  resumenes: CompraResumen[]
  obraId: string
  movimientosDePago: MovimientoCaja[]
  proveedores: Proveedor[]
}) {
  const alertasObra = calcularAlertasObraCompras(compras)
  const proveedorNombre = (id: string | null) => proveedores.find((p) => p.id === id)?.nombre ?? '—'

  if (compras.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">Sin compras registradas todavía.</p>
  }

  return (
    <div className="mt-3 space-y-3">
      {alertasObra.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="compras-obra-alertas">
          {alertasObra.map((alerta, i) => (
            <span
              key={i}
              className={`inline-block rounded px-2 py-1 text-xs font-medium ${ALERTA_OBRA_CLASSNAME[alerta.tipo]}`}
            >
              {alerta.mensaje}
              {alerta.proveedorId ? ` (${proveedorNombre(alerta.proveedorId)})` : ''}
            </span>
          ))}
        </div>
      )}

      <ul className="space-y-3" data-testid="compras-list">
        {compras.map((c) => {
          const resumen = resumenes.find((r) => r.compra_id === c.id)
          const alertas = resumen ? calcularAlertasCompra(c, resumen) : []

          return (
            <li key={c.id} className="rounded border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.concepto}</p>
                  <p className="text-sm text-gray-600">
                    Proveedor: {proveedorNombre(c.proveedor_id)} · Necesidad detectada el {c.fecha_necesidad}
                  </p>
                </div>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                  {ESTADO_LABEL[estadoOperativoCompra(c)]}
                </span>
              </div>

              {resumen && (
                <p className="mt-1 text-sm text-gray-600">
                  Costo real: ${resumen.costo_real_acumulado} · Pagado: ${resumen.monto_pagado} (
                  {resumen.cantidad_pagos} pago{resumen.cantidad_pagos === 1 ? '' : 's'})
                </p>
              )}

              {alertas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" data-testid="compra-alertas">
                  {alertas.map((alerta, i) => (
                    <span
                      key={i}
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ALERTA_CLASSNAME[alerta.tipo]}`}
                    >
                      {alerta.mensaje}
                    </span>
                  ))}
                </div>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-gray-600">Registrar / actualizar etapas</summary>
                <div className="mt-2">
                  <CompraActualizarForm compra={c} obraId={obraId} movimientosDePago={movimientosDePago} />
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
