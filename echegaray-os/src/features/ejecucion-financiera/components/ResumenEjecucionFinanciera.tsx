import type { ObraEjecucionFinanciera } from '../types'
import { calcularAlertasObraEjecucionFinanciera, type TipoAlertaObra } from '../types'

const ALERTA_CLASSNAME: Record<TipoAlertaObra, string> = {
  certificada_sin_ingreso_caja: 'bg-red-100 text-red-800',
  baja_conversion_a_caja: 'bg-amber-100 text-amber-800',
}

export function ResumenEjecucionFinanciera({ resumen }: { resumen: ObraEjecucionFinanciera }) {
  const alertas = calcularAlertasObraEjecucionFinanciera(resumen)

  return (
    <div data-testid="resumen-ejecucion-financiera" className="space-y-3">
      {alertas.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="ejecucion-financiera-alertas">
          {alertas.map((alerta, i) => (
            <span
              key={i}
              className={`inline-block rounded px-2 py-1 text-xs font-medium ${ALERTA_CLASSNAME[alerta.tipo]}`}
            >
              {alerta.mensaje}
            </span>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500">Monto contratado</dt>
          <dd>${resumen.monto_contratado}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Total certificado</dt>
          <dd>${resumen.total_certificado}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Total facturado</dt>
          <dd>${resumen.total_facturado}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Total cobrado</dt>
          <dd>${resumen.total_cobrado}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Pendiente de certificar</dt>
          <dd>${resumen.pendiente_certificar}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Pendiente de facturar</dt>
          <dd>${resumen.pendiente_facturar}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Pendiente de cobrar</dt>
          <dd>${resumen.pendiente_cobrar}</dd>
        </div>
        <div>
          <dt className="text-gray-500">% del contrato ya en caja</dt>
          <dd>{resumen.porcentaje_contrato_cobrado ?? '—'}%</dd>
        </div>
      </dl>
    </div>
  )
}
