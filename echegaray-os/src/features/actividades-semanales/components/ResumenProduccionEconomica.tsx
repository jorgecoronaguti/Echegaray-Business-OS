import type { DatoTrazado, ResumenProduccionEconomica as ResumenType } from '../types/produccionEconomica'

const NATURALEZA_LABEL: Record<string, string> = {
  observado: 'Observado',
  calculado: 'Calculado',
  estimado: 'Estimado',
  inferido: 'Inferido',
  sin_dato: 'Sin dato',
}

const NATURALEZA_COLOR: Record<string, string> = {
  observado: 'text-gray-900',
  calculado: 'text-gray-900',
  estimado: 'text-amber-700',
  inferido: 'text-amber-700',
  sin_dato: 'text-gray-400',
}

function Fila({ etiqueta, dato, formato }: { etiqueta: string; dato: DatoTrazado<unknown>; formato?: (v: unknown) => string }) {
  const texto = dato.valor == null ? '—' : formato ? formato(dato.valor) : String(dato.valor)
  return (
    <tr data-testid="produccion-economica-fila">
      <td className="pr-4 text-gray-600">{etiqueta}</td>
      <td className={`pr-4 font-medium ${NATURALEZA_COLOR[dato.naturaleza]}`}>{texto}</td>
      <td className="pr-4 text-xs text-gray-500">{NATURALEZA_LABEL[dato.naturaleza]}</td>
      <td className="text-xs text-gray-400">{dato.explicacion}</td>
    </tr>
  )
}

export function ResumenProduccionEconomicaView({ resumen }: { resumen: ResumenType }) {
  const pct = (v: unknown) => `${(v as number).toFixed(0)}%`
  const money = (v: unknown) => `$${(v as number).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

  return (
    <table className="w-full text-left text-sm" data-testid="produccion-economica-resumen">
      <thead>
        <tr>
          <th className="pr-4">Dato</th>
          <th className="pr-4">Valor</th>
          <th className="pr-4">Naturaleza</th>
          <th>Explicación</th>
        </tr>
      </thead>
      <tbody>
        <Fila etiqueta="Avance físico promedio" dato={resumen.avanceFisicoPromedio} formato={pct} />
        <Fila etiqueta="Tendencia" dato={resumen.tendencia} />
        <Fila etiqueta="HH estimada (presupuesto)" dato={resumen.hhEstimada} />
        <Fila etiqueta="HH consumida (obra)" dato={resumen.hhConsumidaObra} />
        <Fila etiqueta="Rendimiento" dato={resumen.rendimiento} />
        <Fila etiqueta="Costo presupuestado" dato={resumen.costoPresupuestado} formato={money} />
        <Fila etiqueta="Costo real acumulado" dato={resumen.costoRealAcumulado} formato={money} />
        <Fila etiqueta="Costo esperado a la fecha" dato={resumen.costoEsperadoAFecha} formato={money} />
        <Fila etiqueta="Desvío de costo" dato={resumen.desvioCosto} formato={money} />
        <Fila etiqueta="Clasificación del desvío" dato={resumen.clasificacionDesvio} />
        <Fila etiqueta="Margen actualizado" dato={resumen.margenActualizado} formato={money} />
        <Fila etiqueta="Margen en riesgo" dato={resumen.margenEnRiesgo} formato={(v) => (v ? 'Sí' : 'No')} />
        <Fila etiqueta="CPI (índice de eficiencia de costo)" dato={resumen.cpi} formato={(v) => (v as number).toFixed(2)} />
        <Fila etiqueta="ETC (falta gastar para terminar)" dato={resumen.etc} formato={money} />
        <Fila etiqueta="EAC (costo final estimado)" dato={resumen.eac} formato={money} />
        <Fila etiqueta="VAC (variación final estimada)" dato={resumen.vac} formato={money} />
      </tbody>
    </table>
  )
}
