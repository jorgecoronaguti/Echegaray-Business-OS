'use client'

import { useActionState } from 'react'
import { generarReporteAction, type GenerarReporteState } from '../services/actions'

const initialState: GenerarReporteState = { error: null }

export function GenerarReporteButton({ clave, definicionId }: { clave: string; definicionId: string }) {
  const [state, formAction, isPending] = useActionState(generarReporteAction, initialState)

  return (
    <form action={formAction}>
      <input type="hidden" name="clave" value={clave} />
      <input type="hidden" name="definicion_id" value={definicionId} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded border border-gray-400 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        data-testid={`generar-reporte-${clave}`}
      >
        {isPending ? 'Generando…' : 'Generar ahora'}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  )
}
