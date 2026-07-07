'use client'

import { useActionState } from 'react'
import { iniciarPostMortemAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function IniciarPostMortemForm({ obraId }: { obraId: string }) {
  const [state, formAction, pending] = useActionState(iniciarPostMortemAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="obra_id" value={obraId} />
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Iniciando...' : 'Iniciar Post Mortem (borrador)'}
      </button>
    </form>
  )
}
