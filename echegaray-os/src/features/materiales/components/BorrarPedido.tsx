'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { borrarPedidos } from '../services/acciones'

// «BORRAR» CON CONFIRMACIÓN EN EL LUGAR (dueño, 23/09/2026). Dos toques: el primero pregunta, el
// segundo borra. Sin modal: en el teléfono un diálogo encima de una tarjeta tapa lo que se está por
// borrar, y en la computadora la fila ya dice qué es. Una sola pieza para las dos caras.
export function BorrarPedido({ ids, que, variante = 'escritorio', onBorrado }: {
  /** Los `id_pedido` que se borran: uno (una fila de la tabla) o todos los de un pedido (la tarjeta). */
  ids: string[]
  /** Cómo se llama lo que se borra en la pregunta: «este ítem», «este pedido». */
  que: string
  variante?: 'escritorio' | 'telefono'
  onBorrado?: () => void
}) {
  const router = useRouter()
  const [preguntando, setPreguntando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const telefono = variante === 'telefono'
  const base = telefono
    ? 'inline-flex min-h-[44px] items-center px-3 text-[14px]'
    : 'inline-flex min-h-[28px] items-center px-1.5 text-[12px]'

  const borrar = () => {
    setError(null)
    startTransition(async () => {
      const r = await borrarPedidos(ids)
      if (r.error) { setError(r.error); setPreguntando(false); return }
      setPreguntando(false)
      ;(onBorrado ?? router.refresh)()
    })
  }

  if (!preguntando) {
    return (
      <span className="inline-flex flex-col items-end">
        <button type="button" onClick={() => setPreguntando(true)} data-testid="borrar-pedido"
          className={`${base} text-faint hover:text-neg`}>
          Borrar
        </button>
        {error && <span role="alert" className="text-[11.5px] text-neg">{error}</span>}
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="borrar-pedido-confirmar">
      <span className={telefono ? 'text-[13px] text-muted' : 'text-[11.5px] text-muted'}>¿Borrar {que}?</span>
      <button type="button" onClick={borrar} disabled={pendiente} data-testid="borrar-pedido-si"
        className={`${base} font-semibold text-neg disabled:opacity-50`}>
        {pendiente ? 'Borrando…' : 'Sí, borrar'}
      </button>
      <button type="button" onClick={() => setPreguntando(false)} disabled={pendiente} data-testid="borrar-pedido-no"
        className={`${base} text-muted`}>
        No
      </button>
    </span>
  )
}
