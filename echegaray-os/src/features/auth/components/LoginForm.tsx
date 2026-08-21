'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { loginAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

// ═══ VER / OCULTAR LA CONTRASEÑA (M01) ═══
//
// El diseño lo pide y en el teléfono no es una comodidad: se tipea con una mano, con guantes o con
// el sol de frente, y el único remedio a un error de tipeo invisible es borrar todo y empezar de
// nuevo. Arranca OCULTA: el estado por defecto es el seguro, y mostrarla es una decisión de quien
// está mirando su propia pantalla.
//
// ═══ LO QUE NO SE IMPLEMENTA, Y POR QUÉ ═══
//
// El diseño dibuja «Quedan 3 intentos» debajo del error. Supabase NO publica cuántos intentos
// quedan —limita por su cuenta y contesta el mismo error genérico—, así que ese contador sólo podría
// salir de un estado inventado acá adentro: un número que se reinicia recargando la página y que no
// tiene ninguna relación con el momento en que la cuenta se bloquea de verdad. Un contador que
// miente es peor que ningún contador. Lo que sí se dice es que el sistema limita los intentos.

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState)
  const [ver, setVer] = useState(false)

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="login-form">
      <label className="flex flex-col text-sm">
        Email
        <input name="email" type="email" required autoComplete="email" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col text-sm">
        <span className="flex items-baseline justify-between">
          Contraseña
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            data-testid="ver-contrasena"
            aria-pressed={ver}
            className="text-[12px] font-normal text-muted underline decoration-line underline-offset-2"
          >
            {ver ? 'ocultar' : 'ver'}
          </button>
        </span>
        <input
          name="password"
          type={ver ? 'text' : 'password'}
          required
          autoComplete="current-password"
          className="rounded border px-3 py-2"
        />
      </label>

      {state.error && (
        <div data-testid="login-error">
          <p className="text-sm text-red-600">{state.error}</p>
          <p className="mt-1 text-[12px] text-faint">
            El sistema limita los intentos seguidos. Si no entrás,{' '}
            <Link href="/recuperar" className="underline">recuperá la contraseña</Link>.
          </p>
        </div>
      )}

      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {pending ? 'Ingresando...' : 'Ingresar'}
      </button>

      {/* Debajo de la primaria y sin competir con ella: es la salida de quien ya falló, no la
          acción de quien llega. El diseño la ubica en el mismo lugar. */}
      <Link href="/recuperar" data-testid="ir-a-recuperar" className="text-center text-sm text-muted underline">
        Olvidé mi contraseña
      </Link>

      <p className="text-sm text-gray-600">
        ¿No tenés cuenta? <Link href="/signup" className="underline">Crear una</Link>
      </p>
    </form>
  )
}
