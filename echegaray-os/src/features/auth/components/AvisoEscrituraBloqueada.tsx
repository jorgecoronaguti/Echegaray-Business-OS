'use client'

// EL AVISO DE «NO SE PUEDE CARGAR CON LA LENTE PUESTA».
//
// Se monta sólo dentro de la franja de «Ver como» (`BarraVerComo`): sin lente no hay nada que vigilar
// y `fetch` no se toca. Envuelve `window.fetch` mientras la franja existe y, si una escritura vuelve
// con el 403 de la lente (cabecera propia, ver `bloqueo-escritura.ts`), muestra una alerta fija en la
// pantalla. Va por `fetch` y no por cada formulario porque las escrituras del OS salen de decenas de
// componentes, varios sin try/catch: arreglar uno por uno deja al siguiente mudo.

import { useEffect, useState } from 'react'
import { MENSAJE_LENTE, esBloqueoPorLente } from '@/lib/auth/bloqueo-escritura'

export function AvisoEscrituraBloqueada() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const original = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const r = await original(...args)
      if (esBloqueoPorLente(r)) setVisible(true)
      return r
    }
    return () => { window.fetch = original }
  }, [])

  if (!visible) return null
  return (
    <div role="alert" data-testid="aviso-escritura-bloqueada"
      className="fixed inset-x-3 bottom-20 z-50 flex items-start gap-3 rounded-control border border-line-strong bg-warn px-3 py-2 text-[13px] text-ink md:bottom-6 md:left-auto md:max-w-md">
      <span className="flex-1">{MENSAJE_LENTE}</span>
      <button type="button" onClick={() => setVisible(false)} aria-label="Cerrar el aviso" className="min-h-11 px-2 font-semibold">Cerrar</button>
    </div>
  )
}
