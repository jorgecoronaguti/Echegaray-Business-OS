'use client'

import { useState, useTransition } from 'react'
import { ejecutarAccionTarea } from '../services/actions'
import { accionesDisponibles, ACCION_LABEL, type HumanAction, type OrqTaskState } from '../types'

const ESTILO: Record<HumanAction, string> = {
  retry: 'bg-blue-600 hover:bg-blue-700',
  resume: 'bg-blue-600 hover:bg-blue-700',
  approve: 'bg-emerald-600 hover:bg-emerald-700',
  reject: 'bg-red-600 hover:bg-red-700',
  cancel: 'bg-slate-500 hover:bg-slate-600',
  pause: 'bg-yellow-600 hover:bg-yellow-700',
}

export function TaskActions({ taskId, state }: { taskId: string; state: OrqTaskState }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const acciones = accionesDisponibles(state)
  if (!acciones.length) return null

  function run(action: HumanAction) {
    setError(null)
    start(async () => {
      const res = await ejecutarAccionTarea(taskId, action)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {acciones.map((a) => (
        <button
          key={a}
          type="button"
          disabled={pending}
          onClick={() => run(a)}
          className={`rounded px-2 py-1 text-xs font-medium text-white disabled:opacity-50 ${ESTILO[a]}`}
        >
          {ACCION_LABEL[a]}
        </button>
      ))}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
