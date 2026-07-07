import type { AlertaDashboard } from '../types'
import type { Accion } from '@/features/acciones/types'
import { AlertaCard } from './AlertaCard'

export function SeccionAlertas({
  titulo,
  descripcion,
  alertas,
  testId,
  accionesPorAlertaId,
}: {
  titulo: string
  descripcion: string
  alertas: AlertaDashboard[]
  testId: string
  accionesPorAlertaId?: Map<string, Accion>
}) {
  return (
    <section data-testid={testId}>
      <h2 className="text-xl font-semibold">
        {titulo} <span className="text-sm font-normal text-gray-500">({alertas.length})</span>
      </h2>
      <p className="mt-1 text-sm text-gray-600">{descripcion}</p>

      {alertas.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Sin situaciones para revisar en esta sección.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {alertas.map((a) => (
            <AlertaCard key={a.id} alerta={a} accionExistente={accionesPorAlertaId?.get(a.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}
