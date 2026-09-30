'use client'

import { useState, useTransition } from 'react'
import { Boton, Campo, CAMPO } from '@/shared/components/ds'
import { UNIDADES } from '../logica/pedidos'
import { esTaller, obrasAcopiables } from '../logica/acopio'
import { leerCantidad, type Destino } from '../logica/stock'
import { ingresarMaterialAction } from '../services/stockAcciones'

// INGRESAR MATERIAL SIN PEDIDO — la segunda puerta del stock (dueño, 29/09 y 30/09/2026: Material con
// control de stock, calcando el inventario de Herramientas).
//
// Sirve para lo que ya está en el Taller o en una obra (stock inicial) y para la compra directa sin pedido.
// El ORIGEN es obligatorio: una entrada sin decir de dónde vino no se puede auditar. La regla (quién puede,
// qué lugar vale, cantidad positiva) la aplica `ingresar_material` en Postgres; acá sólo se avisa antes.
// Si queda en el Taller y ya se sabe para qué obra es, se acopia ahí (dueño, 30/09/2026): el lugar sigue siendo
// el Taller, el destino es otro eje. El cliente no se pide: se deduce de la obra.
// Lo mismo en las dos caras: la computadora lo abre en el panel lateral, el teléfono en su página.

const ORIGENES = ['Stock inicial', 'Compra directa', 'Devolución'] as const

export function FormIngresarMaterial({ destinos, lugarInicial = '', alHacer, idForm = 'form-ingresar-material' }: {
  destinos: Destino[]
  lugarInicial?: string
  alHacer: () => void
  idForm?: string
}) {
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState<string>('un')
  const [lugar, setLugar] = useState(lugarInicial)
  const [cantidad, setCantidad] = useState('')
  const [origen, setOrigen] = useState('')
  const [paraObra, setParaObra] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const acopia = esTaller(destinos, lugar)
  const obras = obrasAcopiables(destinos)

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault()
    const n = leerCantidad(cantidad)
    if (nombre.trim().length < 2) return setError('Escribí qué material es')
    if (!lugar) return setError('Elegí dónde queda: el Taller o una obra')
    if (n == null || n <= 0) return setError('Poné una cantidad mayor a cero')
    if (origen.trim().length < 3) return setError('Decí de dónde viene (compra directa, stock inicial…)')
    setError(null)
    startTransition(async () => {
      const r = await ingresarMaterialAction({ nombre: nombre.trim(), unidad, lugar, cantidad: n, origen: origen.trim(), paraObra: acopia && paraObra ? paraObra : null })
      if (r.error) return setError(r.error)
      alHacer()
    })
  }

  return (
    <form id={idForm} onSubmit={enviar} className="space-y-4" data-testid="form-ingresar">
      <Campo rotulo="Material">
        <input value={nombre} maxLength={160} onChange={(e) => setNombre(e.target.value)} className={CAMPO}
          placeholder="Ej.: cemento, hierro del 8, cerámico 45×45" data-testid="ingresar-nombre" />
      </Campo>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
        <Campo rotulo="Cantidad">
          <input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            className={`${CAMPO} text-right font-mono`} data-testid="ingresar-cantidad" />
        </Campo>
        <Campo rotulo="Unidad">
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className={CAMPO} data-testid="ingresar-unidad">
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </div>
      <Campo rotulo="Queda en">
        <select value={lugar} onChange={(e) => setLugar(e.target.value)} className={CAMPO} data-testid="ingresar-lugar">
          <option value="">Elegí el Taller o una obra</option>
          {destinos.map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
        </select>
      </Campo>
      {acopia && (
        <Campo rotulo="Es para la obra (opcional)">
          <select value={paraObra} onChange={(e) => setParaObra(e.target.value)} className={CAMPO} data-testid="ingresar-para-obra">
            <option value="">Libre: sin obra asignada</option>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="De dónde viene">
        <input value={origen} maxLength={400} onChange={(e) => setOrigen(e.target.value)} className={CAMPO}
          placeholder="Compra directa en…, stock inicial, devolución de…" data-testid="ingresar-origen" />
        <div className="mt-2 flex flex-wrap gap-2">
          {ORIGENES.map((o) => (
            <button key={o} type="button" onClick={() => setOrigen(o)}
              className="h-[32px] rounded-control border border-line px-3 text-[12.5px] text-muted hover:bg-surface-quiet">{o}</button>
          ))}
        </div>
      </Campo>
      {error && <p role="alert" className="text-[12.5px] text-neg" data-testid="ingresar-error">{error}</p>}
      <Boton type="submit" variante="primaria" disabled={pendiente} data-testid="ingresar-confirmar" className="max-lg:min-h-[48px] max-lg:w-full">
        {pendiente ? 'Guardando…' : 'Ingresar al stock'}
      </Boton>
    </form>
  )
}
