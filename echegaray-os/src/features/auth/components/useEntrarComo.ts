'use client'

// ENTRAR COMO OTRO USUARIO Y VOLVER, DESDE EL NAVEGADOR.
//
// Es el mismo patrón que `useLente` (POST + recarga), con una diferencia deliberada: acá se hace una
// NAVEGACIÓN COMPLETA (`window.location.assign`) y no `router.refresh()`. Cambió la identidad de la
// sesión, y el router del cliente tiene en caché layouts y payloads RSC de la persona anterior: con un
// refresh parcial, alguna pantalla podría seguir mostrando lo del otro hasta el próximo clic. Rehacer
// el documento entero es exactamente lo que corresponde cuando cambia QUIÉN mira.

import { useState, useTransition } from 'react'

export function useEntrarComo() {
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const pedir = (consulta: string) => {
    setError(null)
    empezar(async () => {
      try {
        const r = await fetch(`/entrar-como?${consulta}`, { method: 'POST', credentials: 'same-origin' })
        const cuerpo = (await r.json().catch(() => null)) as { error?: string; destino?: string } | null
        if (!r.ok) {
          setError(cuerpo?.error ?? `No se pudo cambiar de cuenta (${r.status}).`)
          return
        }
        window.location.assign(cuerpo?.destino ?? '/')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cambiar de cuenta.')
      }
    })
  }

  return {
    pendiente,
    error,
    entrar: (usuarioId: string) => pedir(`usuario=${encodeURIComponent(usuarioId)}`),
    volver: () => pedir('volver=1'),
  }
}
