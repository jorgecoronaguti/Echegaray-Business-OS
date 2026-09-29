'use client'

import { useState, useTransition } from 'react'
import { Boton, Campo, CAMPO } from '@/shared/components/ds'
import { existenciasDe, leerCantidad, textoStock, verificarSalida, type Destino, type Existencia, type Lugar } from '../logica/stock'
import { moverMaterialAction } from '../services/stockAcciones'

// «SOBRA → TALLER / OTRA OBRA» — un movimiento, un remito.
//
// El origen viaja fijo (se llega desde el lugar que tiene el material) y se escriben cantidades sólo en los
// materiales que se mandan: un renglón vacío no se mueve. Todo lo que se manda va en UN remito con un solo
// número, que es lo que el que recibe firma. «Quién recibe» es un nombre escrito, no un usuario: el que
// descarga en el Taller o en la otra obra muchas veces no tiene cuenta en la app.
//
// La regla (no mover más de lo que hay, correlativo sin huecos) la aplica Postgres dentro de una sola
// transacción: si algo falla, no queda movimiento ni número consumido. Acá se avisa antes, no se decide.

export function MoverMaterial({ origen, lugares, existencias, destinos, alHacer }: {
  origen: string
  lugares: Lugar[]
  existencias: Existencia[]
  destinos: Destino[]
  alHacer: (remito: { id: string; numero: number }) => void
}) {
  const lugar = lugares.find((l) => l.id === origen)
  const filas = existenciasDe(existencias, origen)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [destino, setDestino] = useState('')
  const [recibe, setRecibe] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault()
    const items = filas.flatMap((f) => {
      const t = (cantidades[f.material_id] ?? '').trim()
      if (!t) return []
      return [{ material_id: f.material_id, cantidad: leerCantidad(t) ?? 0 }]
    })
    if (!destino) return setError('Elegí a dónde va')
    const v = verificarSalida(items, new Map(filas.map((f) => [f.material_id, f.cantidad])), new Map(filas.map((f) => [f.material_id, f.material])))
    if (!v.ok) return setError(v.error)
    setError(null)
    startTransition(async () => {
      const r = await moverMaterialAction({
        origen, destino, items: items.map((i) => ({ material: i.material_id, cantidad: i.cantidad })), recibe, nota,
      })
      if (r.error || !r.remito) return setError(r.error ?? 'No se pudo emitir el remito')
      alHacer(r.remito)
    })
  }

  if (!lugar) return <p className="text-[13px] text-muted">Ese lugar ya no tiene material para mandar.</p>
  return (
    <form id="form-mover-material" onSubmit={enviar} className="space-y-4" data-testid="form-mover">
      <div className="text-[13px] text-muted">Sale de <span className="font-semibold text-ink">{lugar.rotulo}</span></div>
      <Campo rotulo="Va a">
        <select value={destino} onChange={(e) => setDestino(e.target.value)} className={CAMPO} data-testid="mover-destino">
          <option value="">Elegí el Taller o una obra</option>
          {destinos.filter((d) => d.valor !== origen).map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
        </select>
      </Campo>
      <div>
        <div className="mb-1 text-[12px] text-muted">Cuánto se manda (vacío = no se manda)</div>
        <ul className="border-t border-line">
          {filas.map((f) => (
            <li key={f.material_id} className="flex min-h-[44px] items-center gap-3 border-b border-line/60 py-1" data-testid="mover-fila">
              <span className="min-w-0 flex-1 text-[14px] text-ink md:text-[13px]">{f.material}</span>
              <span className="whitespace-nowrap text-[12px] text-faint">hay <span className="font-mono tabular-nums">{textoStock(f.cantidad, f.unidad)}</span></span>
              <input inputMode="decimal" aria-label={`Cuánto se manda de ${f.material}`} value={cantidades[f.material_id] ?? ''}
                onChange={(e) => setCantidades({ ...cantidades, [f.material_id]: e.target.value })}
                className={`${CAMPO} !w-[88px] text-right font-mono`} data-testid="mover-cantidad" />
            </li>
          ))}
        </ul>
      </div>
      <Campo rotulo="Quién recibe (nombre)">
        <input value={recibe} maxLength={120} onChange={(e) => setRecibe(e.target.value)} className={CAMPO} data-testid="mover-recibe" />
      </Campo>
      <Campo rotulo="Observaciones">
        <input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} className={CAMPO} data-testid="mover-nota" />
      </Campo>
      {error && <p role="alert" className="text-[12.5px] text-neg" data-testid="mover-error">{error}</p>}
      <Boton type="submit" variante="primaria" disabled={pendiente} data-testid="mover-confirmar" className="max-lg:min-h-[48px] max-lg:w-full">
        {pendiente ? 'Emitiendo…' : 'Mover y emitir remito'}
      </Boton>
    </form>
  )
}
