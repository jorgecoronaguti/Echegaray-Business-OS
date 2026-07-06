import type { ObraResumenEconomico } from '../types'
import { calcularEstadoEconomico } from '../types'
import type { CostoReal } from '@/features/costos-reales/types'

const ESTADO_LABEL: Record<string, string> = {
  sin_presupuesto_aprobado: 'Sin presupuesto aprobado',
  sano: 'Sano',
  atencion: 'Atención',
  critico: 'Crítico',
}

const ESTADO_CLASSNAME: Record<string, string> = {
  sin_presupuesto_aprobado: 'bg-gray-100 text-gray-700',
  sano: 'bg-green-100 text-green-800',
  atencion: 'bg-amber-100 text-amber-800',
  critico: 'bg-red-100 text-red-800',
}

export function ResumenEconomicoObra({
  resumen,
  costosQueExplicanDesvio,
}: {
  resumen: ObraResumenEconomico
  costosQueExplicanDesvio: CostoReal[]
}) {
  const estado = calcularEstadoEconomico(resumen)

  return (
    <div data-testid="resumen-economico" className="space-y-3">
      <span
        data-testid="estado-economico"
        className={`inline-block rounded px-2 py-1 text-sm font-semibold ${ESTADO_CLASSNAME[estado]}`}
      >
        {ESTADO_LABEL[estado]}
      </span>

      {!resumen.presupuesto_id && (
        <p className="text-sm text-gray-600">
          No hay un presupuesto aprobado para esta obra — no se puede calcular desvío ni margen actualizado.
          Costo real acumulado hasta hoy: ${resumen.costo_real_acumulado}.
        </p>
      )}

      {resumen.presupuesto_id && (
        <>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">Monto contratado</dt>
              <dd>${resumen.monto_contratado}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Presupuesto aprobado (v{resumen.presupuesto_version})</dt>
              <dd>${resumen.monto_presupuestado}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Costo presupuestado</dt>
              <dd>${resumen.costo_presupuestado}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Costo real acumulado</dt>
              <dd>${resumen.costo_real_acumulado}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Margen esperado</dt>
              <dd>${resumen.margen_esperado}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Margen actualizado</dt>
              <dd>${resumen.margen_actualizado}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Desvío absoluto</dt>
              <dd>${resumen.desvio_absoluto}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Desvío porcentual</dt>
              <dd>{resumen.desvio_porcentual}%</dd>
            </div>
            <div>
              <dt className="text-gray-500">% presupuesto consumido</dt>
              <dd>
                {resumen.costo_presupuestado
                  ? `${((resumen.costo_real_acumulado / resumen.costo_presupuestado) * 100).toFixed(1)}%`
                  : '—'}
              </dd>
            </div>
          </dl>

          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600">
              Desglose por estado (comprometido / pendiente / pagado)
            </summary>
            <ul className="mt-1 list-inside list-disc">
              <li>Comprometido: ${resumen.costo_comprometido}</li>
              <li>Pendiente: ${resumen.costo_pendiente}</li>
              <li>Pagado: ${resumen.costo_pagado}</li>
            </ul>
          </details>

          {costosQueExplicanDesvio.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Costos que más explican el desvío</h3>
              <ul className="mt-1 list-inside list-disc text-sm">
                {costosQueExplicanDesvio.map((c) => (
                  <li key={c.id}>
                    {c.concepto}: ${c.monto} ({c.estado})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
