'use client'

import { useActionState } from 'react'
import type { ClasificacionCostoObra } from '../types'
import type { Obra } from '@/features/obras/types'
import { ConfianzaBadge } from '@/shared/components/ConfianzaBadge'
import { confirmarClasificacionAction, marcarSinObraAplicableAction, type ActionState } from '../services/actions'

const initialState: ActionState = { error: null }

function money(v: number) {
  return `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function FilaClasificacion({ item, obras }: { item: ClasificacionCostoObra; obras: Obra[] }) {
  const [state, formAction, isPending] = useActionState(confirmarClasificacionAction, initialState)
  const [descartarState, descartarAction, descartarPending] = useActionState(marcarSinObraAplicableAction, initialState)
  const sugerida = obras.find((o) => o.id === item.obra_sugerida_id)

  return (
    <li className="rounded border p-3" data-testid="clasificacion-costo-fila">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{item.concepto}</p>
          <p className="text-xs text-gray-500">{item.fecha} — {money(item.monto)}</p>
        </div>
        <ConfianzaBadge naturaleza={item.confianza_sugerencia} />
      </div>

      <p className="mt-2 text-sm">
        <span className="font-medium">Sugerencia: </span>
        {sugerida ? sugerida.nombre : 'Sin sugerencia confiable — requiere elegir manualmente'}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-gray-400">Por qué esta sugerencia</summary>
        <p className="mt-1 text-xs text-gray-500">{item.regla_aplicada}</p>
      </details>

      <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="clasificacion_id" value={item.id} />
        <select name="obra_id" defaultValue={item.obra_sugerida_id ?? ''} className="rounded border px-2 py-1 text-sm" required>
          <option value="" disabled>
            Elegir obra…
          </option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-green-400 bg-green-50 px-2 py-1 text-xs font-medium text-green-800 hover:bg-green-100 disabled:opacity-50"
          data-testid="confirmar-clasificacion-btn"
        >
          {isPending ? 'Confirmando…' : 'Confirmar obra'}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}

      <form action={descartarAction} className="mt-1">
        <input type="hidden" name="clasificacion_id" value={item.id} />
        <button
          type="submit"
          disabled={descartarPending}
          className="text-xs text-gray-500 underline disabled:opacity-50"
        >
          {descartarPending ? 'Marcando…' : 'No corresponde a ninguna obra'}
        </button>
      </form>
      {descartarState.error && <p className="mt-1 text-xs text-red-700">{descartarState.error}</p>}
    </li>
  )
}

export function ColaClasificacionCostos({ pendientes, obras }: { pendientes: ClasificacionCostoObra[]; obras: Obra[] }) {
  const total = pendientes.reduce((acc, c) => acc + c.monto, 0)
  const conSugerencia = pendientes.filter((c) => c.obra_sugerida_id).length

  return (
    <div data-testid="cola-clasificacion-costos">
      <p className="text-sm text-gray-600">
        {pendientes.length} gasto(s) sin obra confirmada ({money(total)} total) — {conSugerencia} con sugerencia
        automática, {pendientes.length - conSugerencia} requieren elegir manualmente.
      </p>
      <ul className="mt-3 space-y-3">
        {pendientes.map((item) => (
          <FilaClasificacion key={item.id} item={item} obras={obras} />
        ))}
        {pendientes.length === 0 && <p className="text-sm text-gray-500">Sin gastos pendientes de clasificar.</p>}
      </ul>
    </div>
  )
}
