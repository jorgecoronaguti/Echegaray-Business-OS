'use client'

import { useEffect, useRef, useState } from 'react'
import { useEstadoDelServidor } from '@/shared/tiempo-real/useEstadoDelServidor'
import { useCeldaViva, useGuardadoDeshacible } from '@/shared/components/deshacer/DeshacerProvider'
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
// CMD/CTRL+Z Y CMD/CTRL+SHIFT+Z (dueño, 17/09/2026): el cambio se apila en la pila de la plataforma y
// deshacer vuelve a llamar a la MISMA acción con el estado anterior. Escribe sólo en Supabase
// (`pedidos_materiales`, origen `os`): la app no toca el Sheet del AppSheet, así que volver atrás es
// simétrico de ir adelante.
//
// Los tres estados que ofrece son los que acepta la acción (`pedidoSchema`). Un estado que la fuente
// trajo y no está entre ésos se MUESTRA igual —no se borra— pero no se puede elegir: cambiarlo por
// uno de los tres sería decidir por el AppSheet.

const OFRECIDOS = ['PENDIENTE', 'PEDIDO', 'ENTREGADO'] as const

export function SelectEstadoPedido({ p }: { p: PedidoGlobal }) {
  const [estado, setEstado] = useEstadoDelServidor(p.estado ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const l = lecturaPedido(estado)

  const estadoRef = useRef(estado ?? '')
  useEffect(() => { estadoRef.current = estado ?? '' })
  const clave = `estado-del-pedido-${p.id_pedido}`

  const guardarDeshacible = useGuardadoDeshacible({
    clave,
    rotulo: `Estado del pedido ${p.id_pedido}`,
    valorAnterior: estado ?? '',
    formato: (v) => lecturaPedido(v).label,
    guardar: async (v) => {
      const fd = new FormData()
      fd.set('id_pedido', p.id_pedido)
      fd.set('estado', v)
      const r = await setEstadoPedidoAction({ error: null }, fd)
      return r.error ? { ok: false as const, error: r.error } : { ok: true as const }
    },
  })

  useCeldaViva(clave, { actual: () => estadoRef.current, aplicar: (v) => setEstado(v) })

  async function cambiar(nuevo: string) {
    setGuardando(true)
    setError(null)
    const r = await guardarDeshacible(nuevo)
    setGuardando(false)
    if (r.ok) setEstado(nuevo)
    else setError(r.error)
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
