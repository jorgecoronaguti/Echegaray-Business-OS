'use client'

import { useActionState } from 'react'
import { Boton, CAMPO, Campo } from '@/shared/components/ds'
import { signupAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

// El alta pública no la dibuja el Design canónico —acá no hay usuarios externos—, pero la ruta
// EXISTE y `supabase/config.toml` declara `enable_signup = true`. Mientras esté viva se ve como el
// resto del OS: esconderla la dejaría abierta y sin cartel. Apagarla es una decisión de acceso, no
// de diseño, y se toma en la configuración de auth del proyecto.

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="signup-form">
      <Campo rotulo="Nombre">
        <input name="nombre" required className={CAMPO} />
      </Campo>
      <Campo rotulo="Email">
        <input name="email" type="email" required autoComplete="email" className={CAMPO} />
      </Campo>
      <Campo
        rotulo="Contraseña"
        ayuda="La cuenta se crea SIN rol. Hasta que Dirección te asigne uno no podés cargar ni editar nada."
      >
        <input name="password" type="password" required autoComplete="new-password" className={CAMPO} />
      </Campo>

      {state.error && <p className="text-[13px] text-neg" data-testid="signup-error">{state.error}</p>}

      <Boton type="submit" variante="primaria" tamano="acceso" disabled={pending}>
        {pending ? 'Creando la cuenta…' : 'Crear cuenta'}
      </Boton>
    </form>
  )
}
