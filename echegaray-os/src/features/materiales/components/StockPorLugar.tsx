'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Boton, CAMPO, Vacio } from '@/shared/components/ds'
import { existenciasDe, leerCantidad, lugaresConStock, textoStock, type Existencia, type Lugar } from '../logica/stock'
import { ajusteMaterialAction, usoMaterialAction } from '../services/stockAcciones'

// STOCK POR LUGAR — qué hay en el Taller y en cada obra. Una sola pieza para las dos caras.
//
// Se lee como una lista agrupada por lugar, no como una tarjeta por dato: el lugar es el título, cada
// material una fila con su número alineado. Las acciones son texto (secundarias) y abren su campo en la
// misma fila: «Usé» resta lo consumido, «Contar» reemplaza el saldo por lo que se contó y deja la
// diferencia en el libro. «Sobra → …» es del LUGAR (se manda más de un material en un solo remito).
//
// Quien no opera (campo) ve el saldo de su obra y nada más: sin botones que la base rechazaría igual.

type Modo = 'uso' | 'conteo'

export function StockPorLugar({ lugares, existencias, puedeOperar, cara, alMover }: {
  lugares: Lugar[]
  existencias: Existencia[]
  puedeOperar: boolean
  cara: 'escritorio' | 'telefono'
  /** Escritorio: abre el panel lateral. En el teléfono «mover» es una pantalla propia y no se pasa. */
  alMover?: (lugarId: string) => void
}) {
  const conStock = lugaresConStock(lugares, existencias)
  if (conStock.length === 0) return <Vacio>Todavía no hay material en ningún lugar. Aparece cuando se marca «Llegó» en un pedido.</Vacio>
  return (
    <div className="space-y-6" data-testid="stock-por-lugar">
      {conStock.map((l) => (
        <section key={l.id} data-testid="stock-lugar" data-lugar={l.id}>
          <div className="mb-1 flex items-center gap-3 border-b border-line pb-1.5">
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{l.rotulo}</h2>
            {puedeOperar && (alMover
              ? <button type="button" onClick={() => alMover(l.id)} data-testid="sobra" className="inline-flex min-h-[28px] items-center px-1.5 text-[12px] font-semibold text-ink hover:underline">Sobra → Taller u otra obra</button>
              : <Link href={`/campo/material/mover?desde=${l.id}`} data-testid="sobra" className="inline-flex min-h-[44px] items-center px-2 text-[14px] font-semibold text-ink">Sobra → Taller u otra obra</Link>)}
          </div>
          <ul>
            {existenciasDe(existencias, l.id).map((e) => <FilaStock key={e.material_id} e={e} puedeOperar={puedeOperar} cara={cara} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function FilaStock({ e, puedeOperar, cara }: { e: Existencia; puedeOperar: boolean; cara: 'escritorio' | 'telefono' }) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo | null>(null)
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('recuento')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const tel = cara === 'telefono'
  const alto = tel ? 'inline-flex min-h-[44px] items-center px-3 text-[14px]' : 'inline-flex min-h-[28px] items-center px-1.5 text-[12px]'

  const confirmar = () => {
    // El recuento admite 0 («no queda nada»); «usé» no: consumir cero no es un hecho.
    const n = modo === 'conteo' && texto.trim() === '0' ? 0 : leerCantidad(texto)
    if (n == null) return setError(modo === 'uso' ? 'Poné cuánto usaste' : 'Poné lo que contaste')
    setError(null)
    startTransition(async () => {
      const r = modo === 'uso'
        ? await usoMaterialAction({ material: e.material_id, lugar: e.ubicacion_id, cantidad: n })
        : await ajusteMaterialAction({ material: e.material_id, lugar: e.ubicacion_id, contado: n, motivo })
      if (r.error) return setError(r.error)
      setModo(null)
      setTexto('')
      router.refresh()
    })
  }

  return (
    <li data-testid="stock-fila" className="border-b border-line/60 py-1.5">
      <div className="flex min-h-[32px] items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px] text-ink md:text-[13px]">{e.material}</span>
        <span className="whitespace-nowrap font-mono text-[14px] tabular-nums text-ink md:text-[13px]" data-testid="stock-cantidad">{textoStock(e.cantidad, e.unidad)}</span>
        {puedeOperar && !modo && (
          <span className="flex items-center">
            <button type="button" onClick={() => setModo('uso')} data-testid="uso" className={`${alto} text-muted hover:text-ink`}>Usé</button>
            <button type="button" onClick={() => setModo('conteo')} data-testid="conteo" className={`${alto} text-faint hover:text-ink`}>Contar</button>
          </span>
        )}
      </div>
      {modo && (
        <div className="flex flex-wrap items-center gap-2 pb-1 pt-1" data-testid="stock-form">
          <input inputMode="decimal" autoFocus aria-label={modo === 'uso' ? `Cuánto usaste de ${e.material}` : `Cuánto contaste de ${e.material}`}
            placeholder={modo === 'uso' ? 'Usé' : 'Hay'} value={texto} onChange={(ev) => setTexto(ev.target.value)}
            className={`${CAMPO} !w-[96px] text-right font-mono`} data-testid="stock-input" />
          {modo === 'conteo' && (
            <select aria-label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} className={`${CAMPO} !w-auto`} data-testid="stock-motivo">
              <option value="recuento">Recuento</option>
              <option value="perdido">Se perdió</option>
              <option value="descartado">Se descartó</option>
            </select>
          )}
          <Boton type="button" variante="primaria" onClick={confirmar} disabled={pendiente} data-testid="stock-confirmar">{pendiente ? 'Guardando…' : 'Confirmar'}</Boton>
          <button type="button" onClick={() => { setModo(null); setError(null) }} disabled={pendiente} className={`${alto} text-muted`}>No</button>
          {error && <span role="alert" className="w-full text-[11.5px] text-neg">{error}</span>}
        </div>
      )}
    </li>
  )
}
