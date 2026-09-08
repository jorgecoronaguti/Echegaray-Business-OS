'use client'

// EL CAMPO DONDE SE ESCRIBE LA ANOTACIÓN — cliente por UNA razón: `Ctrl+Enter` guarda.
//
// El bloque entero es un Server Component; lo único que necesita JavaScript en el navegador es el
// atajo. Por eso vive en su propio archivo de tres líneas útiles en vez de volver de cliente la
// lista, que es lo que se lee cien veces por cada vez que se escribe.
//
// ═══ POR QUÉ EL ATAJO Y NO SÓLO EL BOTÓN ═══
//
// El dueño lo pidió, y el motivo se ve en el uso: la anotación se escribe mientras se está mirando
// la ficha, muchas veces seguidas. `Enter` solo NO puede enviar —una anotación de tres renglones es
// normal y el salto de línea tiene que seguir siendo un salto de línea—, así que el atajo es
// `Ctrl+Enter` (y `Cmd+Enter` en Mac), que es lo que hace todo editor de comentarios.
//
// `requestSubmit()` y no `submit()`: el primero dispara el `onSubmit` del formulario —que es donde
// `FormAccion` intercepta, valida y evita que React limpie el campo cuando el servidor rechazó— y
// el segundo lo saltea, mandando el formulario crudo y perdiendo el texto ante el primer error.

import { CTRL } from '@/shared/components/ui'
import type { KeyboardEvent } from 'react'

export function CampoAnotacion({ maxLength, deshabilitado = false }: {
  maxLength: number
  /** Cuando la tabla todavía no existe: se ve, no se escribe. Un campo que acepta texto que no se
   *  va a poder guardar es la forma de perder la anotación y creerla guardada. */
  deshabilitado?: boolean
}) {
  function atajo(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }

  return (
    <textarea
      name="texto"
      rows={2}
      maxLength={maxLength}
      disabled={deshabilitado}
      onKeyDown={atajo}
      data-testid="campo-anotacion"
      // `rows={2}` con `min-h`: entra de una a tres líneas sin que el bloque salte de alto mientras
      // se escribe. `resize-y` porque una anotación larga es legítima y el sistema no la corta.
      className={`${CTRL} min-h-[56px] resize-y leading-[1.5] disabled:cursor-not-allowed disabled:bg-surface-sunken`}
      placeholder="Llegó tarde tres días seguidos; hablé con él el viernes."
    />
  )
}
