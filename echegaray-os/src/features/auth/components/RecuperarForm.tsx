'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { recuperarAction, type EnvioState } from '../services/actions'

const initialState: EnvioState = { error: null, enviado: false }

// PEDIR EL CORREO DE RECUPERACIÓN.
//
// ═══ EL ÉXITO NO CONFIRMA QUE LA CUENTA EXISTA ═══
//
// «Si esa dirección tiene cuenta, te va a llegar un correo» no es una vuelta cortés: es lo único que
// se puede afirmar sin convertir este formulario en un detector de quién trabaja acá. Supabase
// contesta lo mismo exista o no la cuenta, y la pantalla no puede saber más que la respuesta.
//
// Cuando se envió, el formulario DESAPARECE. Dejarlo abajo del cartel invita a tocar «Enviar» tres
// veces más, y lo único que consigue la tercera es chocar contra el límite de envíos.

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState(recuperarAction, initialState)

  if (state.enviado) {
    return (
      <div data-testid="recuperar-enviado">
        <p className="rounded-card border border-pos/25 bg-pos-soft px-3.5 py-2.5 text-[13px] text-pos">
          Si esa dirección tiene una cuenta del OS, te va a llegar un correo con un enlace para poner
          una contraseña nueva.
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          El enlace dura poco y se usa una sola vez. Si no llega en unos minutos, mirá el correo no
          deseado — y si tampoco está, avisale a Administración: puede que tu cuenta esté registrada
          con otra dirección.
        </p>
        <Link href="/login" className="mt-5 block text-sm underline">Volver a ingresar</Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="recuperar-form">
      <label className="flex flex-col text-sm">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className="rounded border px-3 py-2"
        />
      </label>

      {state.error && <p className="text-sm text-red-600" data-testid="recuperar-error">{state.error}</p>}

      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {pending ? 'Enviando...' : 'Enviarme el enlace'}
      </button>

      <Link href="/login" className="text-center text-sm text-muted underline">Volver a ingresar</Link>
    </form>
  )
}
