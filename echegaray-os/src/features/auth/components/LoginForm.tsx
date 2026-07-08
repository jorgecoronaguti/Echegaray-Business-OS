'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { loginAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="login-form">
      <label className="flex flex-col text-sm">
        Email
        <input name="email" type="email" required autoComplete="email" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col text-sm">
        Contraseña
        <input name="password" type="password" required autoComplete="current-password" className="rounded border px-3 py-2" />
      </label>

      {state.error && <p className="text-sm text-red-600" data-testid="login-error">{state.error}</p>}

      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {pending ? 'Ingresando...' : 'Ingresar'}
      </button>

      <p className="text-sm text-gray-600">
        ¿No tenés cuenta? <Link href="/signup" className="underline">Crear una</Link>
      </p>
    </form>
  )
}
