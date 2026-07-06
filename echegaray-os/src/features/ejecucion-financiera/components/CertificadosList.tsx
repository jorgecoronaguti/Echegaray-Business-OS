import type { Certificado } from '../types'
import { calcularAlertasCertificado, type TipoAlertaCertificado } from '../types'
import { CertificadoActualizarForm } from './CertificadoActualizarForm'
import type { MovimientoCaja } from '@/features/flujo-caja/types'

const ALERTA_CLASSNAME: Record<TipoAlertaCertificado, string> = {
  pendiente_facturacion: 'bg-amber-100 text-amber-800',
  pendiente_cobranza: 'bg-amber-100 text-amber-800',
  factura_vencida: 'bg-red-100 text-red-800',
}

export function CertificadosList({
  certificados,
  obraId,
  movimientosDeCobro,
}: {
  certificados: Certificado[]
  obraId: string
  movimientosDeCobro: MovimientoCaja[]
}) {
  if (certificados.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">Sin certificados registrados todavía.</p>
  }

  return (
    <ul className="mt-3 space-y-3" data-testid="certificados-list">
      {certificados.map((c) => {
        const alertas = calcularAlertasCertificado(c)

        return (
          <li key={c.id} className="rounded border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-semibold">
                  Certificado {c.numero}
                  {c.descripcion ? ` — ${c.descripcion}` : ''}
                </p>
                <p className="text-sm text-gray-600">Certificado el {c.fecha_certificacion}</p>
              </div>
              <p className="text-sm font-semibold">${c.monto_certificado}</p>
            </div>

            {alertas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1" data-testid="certificado-alertas">
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
              <summary className="cursor-pointer text-sm text-gray-600">Registrar facturación / cobranza</summary>
              <div className="mt-2">
                <CertificadoActualizarForm certificado={c} obraId={obraId} movimientosDeCobro={movimientosDeCobro} />
              </div>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
