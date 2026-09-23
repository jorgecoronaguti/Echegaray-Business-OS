'use client'

// PRENDER Y APAGAR LA LENTE SIN QUE LA FRANJA QUEDE PEGADA. Un <Link> a `/ver-como` hacía que el
// router del cliente siguiera la redirección reusando el layout ya dibujado: la cookie se borraba en
// el servidor y la franja «Viendo como…» seguía en pantalla (dueño, 23/09/2026: «se me quedó pegado
// en jefe de obra»). Acá se hace un POST y después `router.refresh()`, que vuelve a pedir el layout
// entero con la cookie nueva. Si la pantalla actual no corresponde al rol nuevo, el middleware la
// redirige en esa misma recarga.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function useLente() {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const pedir = (consulta: string) => {
    setError(null)
    empezar(async () => {
      try {
        const r = await fetch(`/ver-como?${consulta}`, { method: 'POST', credentials: 'same-origin' })
        if (!r.ok) {
          const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null
          setError(cuerpo?.error ?? `No se pudo cambiar la lente (${r.status}).`)
          return
        }
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cambiar la lente.')
      }
    })
  }

  return {
    pendiente,
    error,
    poner: (rol: string) => pedir(`rol=${encodeURIComponent(rol)}`),
    salir: () => pedir('salir=1'),
  }
}
