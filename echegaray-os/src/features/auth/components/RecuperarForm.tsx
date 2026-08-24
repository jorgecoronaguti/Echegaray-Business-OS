'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Boton, CAMPO, Campo } from '@/shared/components/ds'
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
        <Link href="/login" className="mt-5 inline-block py-2 text-[13px] text-muted underline decoration-line underline-offset-2 hover:text-ink">
          Volver a ingresar
        </Link>
      </div>
    )
  }

  return (
    // Los controles son los del design system (`CAMPO`, `Boton`), igual que en el login: las cuatro
    // pantallas sin sesión comparten marco, así que compartir también los controles es lo que evita
    // que una de las cuatro se quede con el borde crudo el día que el DS cambie.
    <form action={formAction} className="flex flex-col gap-4" data-testid="recuperar-form">
      <Campo rotulo="Email">
        <input name="email" type="email" required autoComplete="email" autoFocus className={CAMPO} />
      </Campo>

      {state.error && <p className="text-[13px] text-neg" data-testid="recuperar-error">{state.error}</p>}

      <Boton type="submit" variante="primaria" tamano="acceso" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviarme el enlace'}
      </Boton>

      <Link href="/login" className="-my-1 py-3 text-center text-[13px] text-muted underline decoration-line underline-offset-2 hover:text-ink">
        Volver a ingresar
      </Link>
    </form>
  )
}
