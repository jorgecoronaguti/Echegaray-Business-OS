'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Cada cuánto se vuelve a leer la pantalla mientras hay un ticket «leyendo». La cola lo resuelve en ~5 s. */
export const REFRESCO_LEYENDO_MS = 4_000
/** Hasta cuándo insistir: un ticket que sigue «leyendo» después de esto está trabado y lo dice la tarjeta. */
export const REFRESCO_LEYENDO_HASTA_MS = 3 * 60_000

/**
 * LA PANTALLA SE ENTERA SOLA de que el ticket terminó de leerse.
 *
 * El aviso en vivo (`RefrescarEnVivo`, canal `os:cambios`) es el camino normal; pero el 30/09/2026 el
 * dueño mandó un ticket como Maldonado y la pantalla quedó en «leyendo» aunque la base ya lo tenía en
 * `a_confirmar` cinco segundos después. Un canal que no llega —red del teléfono, sesión prestada,
 * pestaña recién abierta— no puede ser lo único que mueva el estado. Mientras haya un ticket leyendo,
 * la pantalla se vuelve a pedir cada pocos segundos; sin tickets leyendo no hace nada.
 */
export function RefrescarMientrasLee({ activo }: { activo: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!activo) return
    const desde = Date.now()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (Date.now() - desde > REFRESCO_LEYENDO_HASTA_MS) { window.clearInterval(id); return }
      router.refresh()
    }, REFRESCO_LEYENDO_MS)
    return () => window.clearInterval(id)
  }, [activo, router])
  return null
}
