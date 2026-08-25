'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Boton, CAMPO, Campo } from '@/shared/components/ds'
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
    <form action={formAction} className="flex flex-col gap-4" data-testid="contrasena-nueva-form">
      <Campo rotulo="Contraseña nueva">
        <input
          name="password" type="password" required minLength={6}
          autoComplete="new-password" autoFocus className={CAMPO}
        />
      </Campo>
      <Campo rotulo="Repetila">
        <input
          name="password2" type="password" required minLength={6}
          autoComplete="new-password" className={CAMPO}
        />
      </Campo>

      {state.error && (
        <p className="text-[13px] text-neg" data-testid="contrasena-nueva-error">{state.error}</p>
      )}

      <Boton type="submit" variante="primaria" tamano="acceso" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar y entrar'}
      </Boton>

      <Link href="/recuperar" className="-my-1 py-3 text-center text-[13px] text-muted underline decoration-line underline-offset-2 hover:text-ink">
        Pedir un enlace nuevo
      </Link>
    </form>
  )
}
