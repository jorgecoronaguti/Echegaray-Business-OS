'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Boton, CAMPO } from '@/shared/components/ds'
import type { Pedido } from '../logica/pedidos'
import { faltaLlegar, leerCantidad, textoStock, type Destino } from '../logica/stock'
import { llegoPedidoAction } from '../services/stockAcciones'

// «LLEGÓ» EN LA FILA DEL PEDIDO — lo marca el jefe de obra o Administración (dueño, 29/09/2026).
//
// Total o parcial: la cantidad que aparece ya es lo que FALTA (pedido menos lo ya recibido), así el caso
// común —llegó todo— es un toque. Si llegó menos, se corrige el número y el pedido queda abierto con su
// saldo. El destino sólo se pregunta cuando el pedido no sabe de qué obra es (los del Sheet sin obra
// canónica): en los demás el stock entra en la obra del pedido y no hay nada que elegir.
//
// Un «Llegó» equivocado NO se deshace desde acá: el libro de movimientos es inmutable y se corrige con un
// recuento en la pestaña Stock, que deja escrito quién y por qué.

export function LlegoPedido({ pedido, destinos, variante = 'escritorio' }: {
  pedido: Pedido
  destinos: Destino[]
  variante?: 'escritorio' | 'telefono'
}) {
  const router = useRouter()
  const falta = faltaLlegar(pedido.cantidad, pedido.cantidad_recibida)
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(falta == null ? '' : String(falta).replace('.', ','))
  const [destino, setDestino] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const tel = variante === 'telefono'
  const alto = tel ? 'inline-flex min-h-[44px] items-center px-3 text-[14px]' : 'inline-flex min-h-[28px] items-center px-1.5 text-[12px]'
  const recibida = pedido.cantidad_recibida ?? 0

  if (pedido.lectura.clave === 'entregado' || pedido.lectura.clave === 'cancelado') {
    return recibida > 0 ? <span className="text-[11.5px] text-faint" data-testid="recibido">{`Llegó ${textoStock(recibida, pedido.unidad)}`}</span> : null
  }
  const sinObra = pedido.obra === null

  const confirmar = () => {
    const n = leerCantidad(texto)
    if (n == null) return setError('Poné cuánto llegó')
    if (sinObra && !destino) return setError('Elegí en qué lugar quedó')
    setError(null)
    startTransition(async () => {
      const r = await llegoPedidoAction({ id_pedido: pedido.id_pedido, cantidad: n, destino: destino || null })
      if (r.error) return setError(r.error)
      setAbierto(false)
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <span className="inline-flex flex-col items-end">
        <button type="button" onClick={() => setAbierto(true)} data-testid="llego" className={`${alto} font-semibold text-ink hover:underline`}>
          {recibida > 0 ? `Llegó más (${textoStock(recibida, pedido.unidad)} ya)` : 'Llegó'}
        </button>
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2" data-testid="llego-form">
      <input
        inputMode="decimal" aria-label={`Cuánto llegó de ${pedido.material ?? 'este material'}`} value={texto}
        onChange={(e) => setTexto(e.target.value)} className={`${CAMPO} !w-[88px] text-right font-mono`} data-testid="llego-cantidad"
      />
      <span className="text-[12px] text-muted">{pedido.unidad ?? ''}</span>
      {sinObra && (
        <select aria-label="Lugar donde quedó" value={destino} onChange={(e) => setDestino(e.target.value)} className={`${CAMPO} !w-auto`} data-testid="llego-destino">
          <option value="">¿Dónde quedó?</option>
          {destinos.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
        </select>
      )}
      <Boton type="button" variante="primaria" onClick={confirmar} disabled={pendiente} data-testid="llego-confirmar">
        {pendiente ? 'Guardando…' : 'Confirmar'}
      </Boton>
      <button type="button" onClick={() => setAbierto(false)} disabled={pendiente} className={`${alto} text-muted`}>No</button>
      {error && <span role="alert" className="w-full text-[11.5px] text-neg">{error}</span>}
    </span>
  )
}
