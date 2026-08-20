'use client'

import { useState } from 'react'
import { Estado } from '@/shared/components/ds'
import { lecturaPedido } from '../services/estados'
import { setEstadoPedidoAction } from '../services/pedidosActions'
import type { PedidoGlobal } from '../services/operacionGlobalService'

// EL ESTADO DEL PEDIDO SE LEE COMO ESTADO Y SE CAMBIA DONDE VIVE.
//
// El handoff dibuja el estado como punto + palabra, y la capacidad que ya existía dejaba cambiarlo
// desde la lista sin abrir nada (regla 5: se edita donde vive el dato). Las dos conviven: lo que se
// VE es el `Estado` del sistema —sin pastilla, sin caja—, y encima va un `select` transparente que
// guarda al elegir. No es un botón más en la fila ni una pastilla de color.
//
// Los tres estados que ofrece son los que acepta la acción (`pedidoSchema`). Un estado que la fuente
// trajo y no está entre ésos se MUESTRA igual —no se borra— pero no se puede elegir: cambiarlo por
// uno de los tres sería decidir por el AppSheet.

const OFRECIDOS = ['PENDIENTE', 'PEDIDO', 'ENTREGADO'] as const

export function SelectEstadoPedido({ p }: { p: PedidoGlobal }) {
  const [estado, setEstado] = useState(p.estado)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const l = lecturaPedido(estado)

  async function cambiar(nuevo: string) {
    const fd = new FormData()
    fd.set('id_pedido', p.id_pedido)
    fd.set('estado', nuevo)
    setGuardando(true)
    setError(null)
    const r = await setEstadoPedidoAction({ error: null }, fd)
    setGuardando(false)
    if (r.error) setError(r.error)
    else setEstado(nuevo)
  }

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className={`relative inline-flex items-center ${guardando ? 'opacity-50' : ''}`}>
        <Estado tono={l.tono} clave={l.clave} testid="estado-pedido">
          {l.label}
        </Estado>
        <select
          value={OFRECIDOS.includes(l.label.toUpperCase() as (typeof OFRECIDOS)[number]) ? l.label.toUpperCase() : ''}
          disabled={guardando}
          aria-label="Cambiar el estado del pedido"
          data-testid="cambiar-estado"
          onChange={(e) => void cambiar(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="" disabled>
            {l.label}
          </option>
          {OFRECIDOS.map((e) => (
            <option key={e} value={e}>
              {lecturaPedido(e).label}
            </option>
          ))}
        </select>
      </span>
      {error && <span className="text-[11.5px] text-neg">{error}</span>}
    </span>
  )
}
