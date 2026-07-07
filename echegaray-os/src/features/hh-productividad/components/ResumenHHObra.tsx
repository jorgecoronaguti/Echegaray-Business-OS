import type { ObraHHResumen, RegistroHH, TipoAlertaHH } from '../types'
import { calcularAlertasObraHH, agruparHHPorSemana } from '../types'

const ALERTA_CLASSNAME: Record<TipoAlertaHH, string> = {
  sin_estimacion: 'bg-gray-200 text-gray-800',
  desvio_significativo: 'bg-red-100 text-red-800',
  concentracion_anormal: 'bg-amber-100 text-amber-800',
  obra_activa_sin_registro_reciente: 'bg-amber-100 text-amber-800',
  informacion_insuficiente: 'bg-gray-200 text-gray-800',
}

export function ResumenHHObra({ resumen, registros }: { resumen: ObraHHResumen; registros: RegistroHH[] }) {
  const alertas = calcularAlertasObraHH(resumen, registros)
  const semanas = agruparHHPorSemana(registros)
  const trabajadores = Array.from(new Set(registros.map((r) => r.trabajador_o_cuadrilla)))

  return (
    <div data-testid="resumen-hh" className="space-y-3">
      {alertas.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="hh-alertas">
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
          <dt className="text-gray-500">HH estimadas</dt>
          <dd>{resumen.hh_estimada ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">HH real acumulada</dt>
          <dd>{resumen.hh_real_acumulada}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Desvío absoluto</dt>
          <dd>{resumen.desvio_absoluto ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Desvío porcentual</dt>
          <dd>{resumen.desvio_porcentual !== null ? `${resumen.desvio_porcentual}%` : '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Semanas registradas</dt>
          <dd>{resumen.cantidad_semanas_registradas}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Último registro</dt>
          <dd>{resumen.ultima_fecha_registro ?? '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-gray-500">Personas / cuadrillas que participaron</dt>
          <dd>{trabajadores.length > 0 ? trabajadores.join(', ') : '—'}</dd>
        </div>
      </dl>

      {semanas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Evolución semanal de HH</h3>
          <table className="mt-1 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="pr-4">Semana</th>
                <th className="pr-4">Horas</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((s) => (
                <tr key={s.semana}>
                  <td className="pr-4">{s.semana}</td>
                  <td className="pr-4">{s.horas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
