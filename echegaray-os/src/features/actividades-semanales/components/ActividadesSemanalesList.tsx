import type { ActividadSemanal } from '../types'
import { calcularDesvioActividad } from '../types'
import { CierreSemanalForm } from './CierreSemanalForm'

const ESTADO_LABEL: Record<ActividadSemanal['estado'], string> = {
  planificada: 'Planificada',
  en_curso: 'En curso',
  cerrada: 'Cerrada',
}

export function ActividadesSemanalesList({ obraId, actividades }: { obraId: string; actividades: ActividadSemanal[] }) {
  const porSemana = new Map<string, ActividadSemanal[]>()
  for (const a of actividades) {
    const lista = porSemana.get(a.semana_inicio) ?? []
    lista.push(a)
    porSemana.set(a.semana_inicio, lista)
  }
  const semanas = Array.from(porSemana.keys()).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-6" data-testid="actividades-semanales-list">
      {semanas.map((semana) => (
        <div key={semana}>
          <h3 className="font-medium text-gray-800">Semana del {semana}</h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="pr-4">Actividad</th>
                <th className="pr-4">Responsable</th>
                <th className="pr-4">Objetivo</th>
                <th className="pr-4">Real</th>
                <th className="pr-4">Desvío</th>
                <th className="pr-4">Estado</th>
                <th className="pr-4">Causa</th>
              </tr>
            </thead>
            <tbody>
              {(porSemana.get(semana) ?? []).map((a) => {
                const { nivel, desvioPuntosPorcentuales } = calcularDesvioActividad(a)
                return (
                  <tr key={a.id} data-testid="actividad-semanal-fila" className={nivel === 'significativo' ? 'bg-red-50' : undefined}>
                    <td className="pr-4">{a.actividad}</td>
                    <td className="pr-4">{a.responsable}</td>
                    <td className="pr-4">{a.avance_objetivo != null ? `${a.avance_objetivo}%` : '—'}</td>
                    <td className="pr-4">{a.avance_real != null ? `${a.avance_real}%` : '—'}</td>
                    <td className="pr-4">
                      {desvioPuntosPorcentuales != null ? `${desvioPuntosPorcentuales.toFixed(0)} pp` : 'sin dato'}
                      {nivel === 'significativo' && ' ⚠️'}
                    </td>
                    <td className="pr-4">{ESTADO_LABEL[a.estado]}</td>
                    <td className="pr-4">
                      {a.causa_desvio ?? (
                        a.estado !== 'cerrada' ? <CierreSemanalForm obraId={obraId} actividadId={a.id} /> : '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      {semanas.length === 0 && <p className="text-sm text-gray-500">Sin actividades planificadas todavía.</p>}
    </div>
  )
}
