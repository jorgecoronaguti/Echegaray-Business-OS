'use client'

import { useActionState } from 'react'
import type { AlertaDashboard } from '@/features/dashboard/types'
import { crearAccionDesdeAlertaAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

// Serializa la alerta ya calculada (nunca persistida) en campos ocultos para que el
// server action pueda copiar su contenido una sola vez al crear la Acción — ver nota
// en features/acciones/types sobre por qué esto no es "duplicar" el cálculo.
export function ConvertirEnAccionForm({ alerta }: { alerta: AlertaDashboard }) {
  const [state, formAction, isPending] = useActionState(crearAccionDesdeAlertaAction, initialState)

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="alerta_id" value={alerta.id} />
      <input type="hidden" name="alerta_titulo" value={alerta.titulo} />
      <input type="hidden" name="alerta_severidad" value={alerta.severidad} />
      <input type="hidden" name="alerta_categoria" value={alerta.categoria} />
      <input type="hidden" name="alerta_obra_id" value={alerta.obraId ?? ''} />
      <input type="hidden" name="alerta_obra_nombre" value={alerta.obraNombre ?? ''} />
      <input type="hidden" name="alerta_contraparte" value={alerta.contraparte ?? ''} />
      <input type="hidden" name="alerta_monto" value={alerta.monto ?? ''} />
      <input type="hidden" name="alerta_fecha_critica" value={alerta.fechaCritica ?? ''} />
      <input type="hidden" name="alerta_causa" value={alerta.causa} />
      <input type="hidden" name="alerta_decision" value={alerta.decisionSugerida} />
      <input type="hidden" name="alerta_link" value={alerta.link ?? ''} />

      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-gray-400 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        data-testid="convertir-en-accion-btn"
      >
        {isPending ? 'Convirtiendo…' : 'Convertir en acción'}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  )
}
