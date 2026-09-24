'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { rutaTelefonoDeHerramientas } from '../logica/rutaTelefono'

// HERRAMIENTAS DE ESCRITORIO EN UNA PANTALLA ANGOSTA → LA VERSIÓN DE CAMPO, POR ANCHO (24/09/2026).
//
// El middleware ya manda a `/campo/herramientas` al navegador que SE DECLARA teléfono. El que se
// presenta como computadora —Safari de iPad, o el iPhone con «Solicitar sitio de escritorio»— pasaba
// de largo y dibujaba la pantalla de escritorio: medido en producción a 390 px, 560 px de ancho y
// corrida de costado. El servidor no conoce el ancho; el navegador sí. Mismo destino que el
// middleware (`rutaTelefonoDeHerramientas`), y `?pc=1` sigue dejando ver la de escritorio a propósito.
const ANGOSTA = '(max-width: 767px)'

export function HerramientasAlTelefono() {
  const ruta = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    if (!ruta || params.has('pc')) return
    if (!window.matchMedia(ANGOSTA).matches) return
    const destino = rutaTelefonoDeHerramientas(ruta, params.toString())
    if (destino) router.replace(destino)
  }, [ruta, params, router])
  return null
}
