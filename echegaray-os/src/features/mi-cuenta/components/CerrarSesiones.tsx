'use client'

// CERRAR TODAS LAS SESIONES — con confirmación, porque incluye la de acá.
//
// El primer clic pide confirmación en el mismo lugar; no abre un diálogo modal. Un modal para dos
// palabras interrumpe más de lo que protege, y el patrón del sistema es «la confirmación vive junto
// a la acción» (`INTERACTION.md` §Éxito).
//
// DESPUÉS DE CERRAR, LA SESIÓN DE ESTA PESTAÑA TAMBIÉN MURIÓ: se manda al login en vez de dejar una
// pantalla que parece viva y que va a fallar en el próximo clic.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/shared/components/ds'
import { cerrarTodasLasSesiones } from '../services/actions'

export function CerrarSesiones() {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!confirmando) {
    return (
      <Boton variante="destructiva" onClick={() => setConfirmando(true)} data-testid="cerrar-todo">
        Cerrar todo
      </Boton>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Boton
          variante="destructiva"
          disabled={pendiente}
          data-testid="cerrar-todo-confirmar"
          onClick={() => iniciar(async () => {
            setError(null)
            const r = await cerrarTodasLasSesiones()
            if (!r.ok) setError(r.error)
            else router.push('/login')
          })}
        >{pendiente ? 'Cerrando…' : 'Sí, cerrar todas'}</Boton>
        <Boton variante="discreta" onClick={() => setConfirmando(false)} disabled={pendiente}>Cancelar</Boton>
      </div>
      {error && <p className="text-[11.5px] text-neg" data-testid="cerrar-todo-error">{error}</p>}
    </div>
  )
}
