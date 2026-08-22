'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { contrasenaNuevaAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

// LA CONTRASEÑA NUEVA, con la sesión que dejó el canje del enlace.
//
// SE PIDE DOS VECES, igual que en «Mi cuenta» y por el mismo motivo: un error de tipeo acá deja a la
// persona afuera del sistema, y afuera no puede entrar a arreglarlo. El costo de un campo de más es
// muchísimo menor que el de un llamado para resetear una cuenta desde cero.
//
// NO HAY BOTÓN «VER» ACÁ, a diferencia del login: la confirmación ya cumple esa función —si las dos
// no coinciden, el servidor lo dice— y una contraseña nueva a la vista es la que se lee por encima
// del hombro justo cuando todavía no está guardada en ningún gestor.

export function ContrasenaNuevaForm() {
  const [state, formAction, pending] = useActionState(contrasenaNuevaAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="contrasena-nueva-form">
      <label className="flex flex-col text-sm">
        Contraseña nueva
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          autoFocus
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col text-sm">
        Repetila
        <input
          name="password2"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded border px-3 py-2"
        />
      </label>

      {state.error && (
        <p className="text-sm text-red-600" data-testid="contrasena-nueva-error">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {pending ? 'Guardando...' : 'Guardar y entrar'}
      </button>

      <Link href="/recuperar" className="text-center text-sm text-muted underline">
        Pedir un enlace nuevo
      </Link>
    </form>
  )
}
