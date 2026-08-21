'use client'

import { useActionState, useMemo, useState } from 'react'
import { Buscador } from '@/shared/components/ds'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { asignarComprobanteObraAction, type ActionState } from '../services/costosActions'
import type { ComprobanteConSugerencia } from '../services/costosObraService'

const initial: ActionState = { error: null }

function money(n: number | null): string {
  return (n ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}
function fecha(f: string | null): string {
  if (!f) return '—'
  const d = new Date(f)
  return isNaN(d.getTime()) ? f : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Fila({ c, obras }: { c: ComprobanteConSugerencia; obras: string[] }) {
  const [state, asignar, pend] = useActionState(asignarComprobanteObraAction, initial)
  const sug = c.sugerencia
  // Propone, no aplica: pre-seleccionamos la obra sugerida, pero el dueño confirma con el botón
  // y puede cambiarla. El chip muestra la EVIDENCIA (N de M comprobantes previos del proveedor).
  return (
    <form action={asignar} data-testid="fila-comprobante" className="flex flex-wrap items-center gap-3 px-4 py-3">
      <input type="hidden" name="id" value={c.id} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{c.emisor_nombre || 'Sin nombre'}</div>
        <div className="truncate text-xs text-gray-500">
          {fecha(c.fecha_emision)} · {c.numero || 's/n'} {c.emisor_cuit ? `· CUIT ${c.emisor_cuit}` : ''}
        </div>
        {sug && (
          <div
            className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
              sug.unanime ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
            title={`Basado en tu historial: ${sug.veces} de ${sug.deTotal} comprobantes de este proveedor fueron a "${sug.obra}". El OS lo propone, vos confirmás.`}
          >
            🔎 Sugerido: {sug.obra} · {sug.veces}/{sug.deTotal} previos
          </div>
        )}
      </div>
      <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">{money(c.imp_total)}</div>
      <select
        name="obra_texto"
        required
        defaultValue={sug?.obra ?? ''}
        className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
      >
        <option value="" disabled>
          Asignar a obra…
        </option>
        {obras.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pend}
        className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-50"
      >
        {pend ? 'Asignando…' : sug ? 'Confirmar' : 'Asignar'}
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  )
}

export function AsignarComprobantes({ comprobantes, obras }: { comprobantes: ComprobanteConSugerencia[]; obras: string[] }) {
  // FILTRO EN MEMORIA Y SIN DEBOUNCE: los comprobantes sin asignar ya viajaron enteros —la pantalla
  // los necesita todos para dibujar sus totales—, así que buscar es un `filter` instantáneo. Un
  // debounce acá sería introducir una espera sin ningún viaje que ahorrar.
  //
  // SE BUSCA POR PROVEEDOR, CUIT Y NÚMERO porque son los tres datos que trae el papel que se está
  // mirando: quien asigna tiene la factura delante y busca por lo que ahí dice.
  const [texto, setTexto] = useState('')
  const visibles = useMemo(
    () => comprobantes.filter((c) => contieneEnAlguno([c.emisor_nombre, c.emisor_cuit, c.numero], texto)),
    [comprobantes, texto],
  )

  if (comprobantes.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400 shadow-sm">
        No hay comprobantes de compra sin asignar. Todo el costo de ARCA está atribuido a una obra.
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {comprobantes.length > 1 && (
        <Buscador
          value={texto}
          onChange={setTexto}
          placeholder="Buscar proveedor, CUIT o número"
          testid="buscar-comprobante"
          className="max-w-[320px]"
        />
      )}
      {visibles.length === 0 ? (
        <div
          data-testid="comprobantes-sin-resultado"
          className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-400 shadow-sm"
        >
          Ningún comprobante sin asignar coincide con «{texto}».
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {visibles.map((c) => (
            <Fila key={c.id} c={c} obras={obras} />
          ))}
        </div>
      )}
    </div>
  )
}
