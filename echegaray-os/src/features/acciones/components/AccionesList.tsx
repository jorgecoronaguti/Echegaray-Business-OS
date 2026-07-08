import Link from 'next/link'
import type { Accion } from '../types'
import { ESTADO_ACCION_LABEL } from '../types'
import { AREA_LABEL } from '@/features/areas/types'
import { CambiarEstadoAccionForm } from './CambiarEstadoAccionForm'
import { BloqueoAccionForm } from './BloqueoAccionForm'

const ESTADO_CLASSNAME: Record<Accion['estado'], string> = {
  pendiente: 'bg-gray-200 text-gray-800',
  en_curso: 'bg-blue-100 text-blue-800',
  resuelta: 'bg-green-100 text-green-800',
  descartada: 'bg-gray-100 text-gray-500 line-through',
}

const SEVERIDAD_CLASSNAME: Record<string, string> = {
  critica: 'border-red-400 bg-red-50',
  alta: 'border-amber-400 bg-amber-50',
  media: 'border-blue-300 bg-blue-50',
  informativa: 'border-gray-300 bg-gray-50',
}

export function AccionesList({ acciones }: { acciones: Accion[] }) {
  if (acciones.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">Sin acciones registradas todavía.</p>
  }

  return (
    <ul className="mt-3 space-y-2" data-testid="acciones-list">
      {acciones.map((a) => (
        <li
          key={a.id}
          className={`rounded border p-3 ${a.severidad ? SEVERIDAD_CLASSNAME[a.severidad] : ''}`}
          data-testid="accion-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_CLASSNAME[a.estado]}`}>
                {ESTADO_ACCION_LABEL[a.estado]}
              </span>
              {a.bloqueada && (
                <span className="ml-2 inline-block rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white" data-testid="accion-bloqueada-badge">
                  ⛔ Bloqueada
                </span>
              )}
              {!a.responsable && (a.estado === 'pendiente' || a.estado === 'en_curso') && (
                <span className="ml-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  Sin responsable
                </span>
              )}
              <span className="ml-2 text-xs text-gray-500">
                {AREA_LABEL[a.area]} · {a.origen === 'manual' ? 'Manual' : 'Generada por alerta'}
              </span>
              <p className="mt-1 font-semibold">{a.titulo}</p>
            </div>
            {a.monto !== null && <p className="text-sm font-semibold">${a.monto}</p>}
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
            {a.contraparte && (
              <div>
                <dt className="font-medium">Contraparte</dt>
                <dd>{a.contraparte}</dd>
              </div>
            )}
            {a.fecha_limite && (
              <div>
                <dt className="font-medium">Fecha límite</dt>
                <dd>{a.fecha_limite}</dd>
              </div>
            )}
            {a.responsable && (
              <div>
                <dt className="font-medium">Responsable</dt>
                <dd>{a.responsable}</dd>
              </div>
            )}
          </dl>

          {a.causa && (
            <p className="mt-2 text-sm">
              <span className="font-medium">Causa: </span>
              {a.causa}
            </p>
          )}

          {a.obra_id && (
            <Link href={`/obras/${a.obra_id}`} className="mt-1 inline-block text-sm font-medium text-blue-700 underline">
              Ir a la ficha de la obra →
            </Link>
          )}

          {a.motivo_bloqueo && (
            <p className="mt-2 text-sm text-red-700">
              <span className="font-medium">Motivo del bloqueo: </span>
              {a.motivo_bloqueo}
            </p>
          )}

          {a.evidencia && (
            <p className="mt-1 text-xs text-gray-500">
              <span className="font-medium">Evidencia: </span>
              {a.evidencia}
            </p>
          )}

          {(a.estado === 'resuelta' || a.estado === 'descartada') && a.resolucion_notas && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="font-medium">Resolución ({a.fecha_resolucion}): </span>
              {a.resolucion_notas}
            </p>
          )}

          <CambiarEstadoAccionForm accion={a} />
          <BloqueoAccionForm accion={a} />
        </li>
      ))}
    </ul>
  )
}
