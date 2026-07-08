import Link from 'next/link'
import type { AlertaDashboard, SeveridadAlerta } from '../types'
import type { Accion } from '@/features/acciones/types'
import { ESTADO_ACCION_LABEL } from '@/features/acciones/types'
import { ConvertirEnAccionForm } from '@/features/acciones/components/ConvertirEnAccionForm'

const SEVERIDAD_CLASSNAME: Record<SeveridadAlerta, string> = {
  critica: 'border-red-400 bg-red-50',
  alta: 'border-amber-400 bg-amber-50',
  media: 'border-blue-300 bg-blue-50',
  informativa: 'border-gray-300 bg-gray-50',
}

const SEVERIDAD_LABEL: Record<SeveridadAlerta, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  informativa: 'Informativa',
}

const SEVERIDAD_BADGE: Record<SeveridadAlerta, string> = {
  critica: 'bg-red-600 text-white',
  alta: 'bg-amber-500 text-white',
  media: 'bg-blue-500 text-white',
  informativa: 'bg-gray-400 text-white',
}

export function AlertaCard({ alerta, accionExistente }: { alerta: AlertaDashboard; accionExistente?: Accion }) {
  return (
    <li className={`rounded border p-3 ${SEVERIDAD_CLASSNAME[alerta.severidad]}`} data-testid="alerta-dashboard">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${SEVERIDAD_BADGE[alerta.severidad]}`}>
            {SEVERIDAD_LABEL[alerta.severidad]}
          </span>
          <p className="mt-1 font-semibold">{alerta.titulo}</p>
        </div>
        {alerta.monto !== null && <p className="text-sm font-semibold">${alerta.monto}</p>}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
        {alerta.obraNombre && (
          <div>
            <dt className="font-medium">Obra</dt>
            <dd>{alerta.obraNombre}</dd>
          </div>
        )}
        {alerta.contraparte && (
          <div>
            <dt className="font-medium">Contraparte</dt>
            <dd>{alerta.contraparte}</dd>
          </div>
        )}
        {alerta.fechaCritica && (
          <div>
            <dt className="font-medium">Fecha crítica</dt>
            <dd>{alerta.fechaCritica}</dd>
          </div>
        )}
        <div>
          <dt className="font-medium">Confianza</dt>
          <dd className="capitalize">{alerta.confianza}</dd>
        </div>
        <div>
          <dt className="font-medium">Fuente</dt>
          <dd>{alerta.fuente}</dd>
        </div>
      </dl>

      <p className="mt-2 text-sm">
        <span className="font-medium">Causa: </span>
        {alerta.causa}
      </p>
      <p className="text-sm">
        <span className="font-medium">Decisión sugerida: </span>
        {alerta.decisionSugerida}
      </p>

      {alerta.link && (
        <Link href={alerta.link} className="mt-2 inline-block text-sm font-medium text-blue-700 underline">
          Ir a la ficha →
        </Link>
      )}

      {accionExistente ? (
        <p className="mt-2 text-xs text-gray-500" data-testid="alerta-ya-convertida">
          Ya convertida en acción — estado: {ESTADO_ACCION_LABEL[accionExistente.estado]} (
          <Link href="/acciones" className="underline">
            ver en Centro de Acción
          </Link>
          )
        </p>
      ) : (
        <ConvertirEnAccionForm alerta={alerta} />
      )}
    </li>
  )
}
