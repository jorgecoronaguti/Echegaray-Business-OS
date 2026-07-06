'use client'

import { useActionState } from 'react'
import { createCertificadoAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function CertificadoForm({ obraId }: { obraId: string }) {
  const [state, formAction, pending] = useActionState(createCertificadoAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <input type="hidden" name="obra_id" value={obraId} />

      <div className="flex flex-wrap gap-2">
        <input name="numero" placeholder="N° de certificado" required className="w-32 rounded border px-2 py-1" />
        <input
          name="descripcion"
          placeholder="Descripción (opcional)"
          className="w-64 rounded border px-2 py-1"
        />
        <label className="flex flex-col text-sm">
          Fecha de certificación
          <input name="fecha_certificacion" type="date" required className="rounded border px-2 py-1" />
        </label>
        <input
          name="monto_certificado"
          type="number"
          step="0.01"
          placeholder="Monto certificado"
          required
          className="rounded border px-2 py-1"
        />
      </div>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Registrar certificado'}
      </button>
    </form>
  )
}
