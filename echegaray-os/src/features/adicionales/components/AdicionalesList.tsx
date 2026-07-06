import type { Adicional } from '../types'
import { calcularAlertasAdicional, montoRelevanteParaMargen, type TipoAlertaAdicional } from '../types'
import { AdicionalActualizarForm } from './AdicionalActualizarForm'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

const ALERTA_CLASSNAME: Record<TipoAlertaAdicional, string> = {
  ejecutado_sin_cotizar: 'bg-red-100 text-red-800',
  cotizado_pendiente_aprobacion: 'bg-amber-100 text-amber-800',
  aprobado_pendiente_ejecucion: 'bg-amber-100 text-amber-800',
  ejecutado_pendiente_facturacion: 'bg-amber-100 text-amber-800',
  facturado_pendiente_cobranza: 'bg-amber-100 text-amber-800',
  frenado: 'bg-gray-200 text-gray-800',
  riesgo_perdida_margen: 'bg-red-100 text-red-800',
}

export function AdicionalesList({
  adicionales,
  obraId,
  movimientosDeCobro,
}: {
  adicionales: Adicional[]
  obraId: string
  movimientosDeCobro: MovimientoCaja[]
}) {
  if (adicionales.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">Sin adicionales registrados todavía.</p>
  }

  return (
    <ul className="mt-3 space-y-3" data-testid="adicionales-list">
      {adicionales.map((a) => {
        const alertas = calcularAlertasAdicional(a)
        const montoRelevante = montoRelevanteParaMargen(a)

        return (
          <li key={a.id} className="rounded border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-semibold">{a.concepto}</p>
                <p className="text-sm text-gray-600">
                  Origen: {a.origen} · Detectado por {a.detectado_por} el {a.fecha_deteccion}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {montoRelevante !== null ? `$${montoRelevante}` : 'Sin monto todavía'}
              </p>
            </div>

            {alertas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1" data-testid="adicional-alertas">
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
                <AdicionalActualizarForm adicional={a} obraId={obraId} movimientosDeCobro={movimientosDeCobro} />
              </div>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
