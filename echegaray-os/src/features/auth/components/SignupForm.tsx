'use client'

import { useActionState } from 'react'
import { signupAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="signup-form">
      <label className="flex flex-col text-sm">
        Nombre
        <input name="nombre" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col text-sm">
        Email
        <input name="email" type="email" required autoComplete="email" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col text-sm">
        Contraseña
        <input name="password" type="password" required autoComplete="new-password" className="rounded border px-3 py-2" />
      </label>

      <p className="text-xs text-gray-500">
        La cuenta se crea sin rol asignado -- Dirección tiene que asignarte un rol (Dirección, Administración o Jefe
        de Obra) antes de que puedas cargar o editar información.
      </p>

      {state.error && <p className="text-sm text-red-600" data-testid="signup-error">{state.error}</p>}

      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {pending ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
    </form>
  )
}
