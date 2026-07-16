'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPedidoAction,
  setEstadoPedidoAction,
  updatePedidoAction,
  deletePedidoAction,
  type ActionState,
} from '../services/pedidosActions'
import type { PedidoMaterial } from '../services/pedidosMaterialesService'

const ESTADOS = ['PENDIENTE', 'PEDIDO', 'ENTREGADO'] as const
type Estado = (typeof ESTADOS)[number]

// Color SEMÁNTICO por estado (no es el acento de marca): rojo=falta, ámbar=en curso,
// verde=hecho. Se lee de un vistazo, que es lo que necesita el campo.
const ESTADO_STYLE: Record<string, { chip: string; dot: string; label: string }> = {
  PENDIENTE: { chip: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500', label: 'Pendiente' },
  PEDIDO: { chip: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500', label: 'Pedido' },
  ENTREGADO: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500', label: 'Entregado' },
}
const estadoStyle = (e: string | null) => ESTADO_STYLE[(e || '').toUpperCase()] ?? { chip: 'bg-gray-100 text-gray-600 ring-gray-500/20', dot: 'bg-gray-400', label: e || '—' }
const initial: ActionState = { error: null }

function fechaAR(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

export function PedidosManager({ pedidos, obras }: { pedidos: PedidoMaterial[]; obras: string[] }) {
  const [q, setQ] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<'TODOS' | Estado>('TODOS')
  const [obraFiltro, setObraFiltro] = useState<string>('')
  const [mostrarAlta, setMostrarAlta] = useState(false)

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    // Orden: primero lo accionable (Pendiente < Pedido < Entregado), luego por fecha desc.
    const rank: Record<string, number> = { PENDIENTE: 0, PEDIDO: 1, ENTREGADO: 2 }
    return pedidos
      .filter((p) => (estadoFiltro === 'TODOS' ? true : (p.estado || '').toUpperCase() === estadoFiltro))
      .filter((p) => (obraFiltro ? p.obra_texto === obraFiltro : true))
      .filter((p) => (term ? `${p.material} ${p.obra_texto}`.toLowerCase().includes(term) : true))
      .sort((a, b) => {
        const ra = rank[(a.estado || '').toUpperCase()] ?? 9
        const rb = rank[(b.estado || '').toUpperCase()] ?? 9
        if (ra !== rb) return ra - rb
        return (b.fecha || '').localeCompare(a.fecha || '')
      })
  }, [pedidos, q, estadoFiltro, obraFiltro])

  const conteo = useMemo(() => {
    const c = { PENDIENTE: 0, PEDIDO: 0, ENTREGADO: 0 }
    for (const p of pedidos) {
      const e = (p.estado || '').toUpperCase() as Estado
      if (e in c) c[e]++
    }
    return c
  }, [pedidos])

  return (
    <div className="space-y-4">
      {/* Datalist de obras compartido por los formularios (alta y edición). */}
      <datalist id="obras-list">
        {obras.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {/* KPIs accionables */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi n={conteo.PENDIENTE} label="Pendientes" tone="rose" active={estadoFiltro === 'PENDIENTE'} onClick={() => setEstadoFiltro(estadoFiltro === 'PENDIENTE' ? 'TODOS' : 'PENDIENTE')} />
        <Kpi n={conteo.PEDIDO} label="Pedidos" tone="amber" active={estadoFiltro === 'PEDIDO'} onClick={() => setEstadoFiltro(estadoFiltro === 'PEDIDO' ? 'TODOS' : 'PEDIDO')} />
        <Kpi n={conteo.ENTREGADO} label="Entregados" tone="emerald" active={estadoFiltro === 'ENTREGADO'} onClick={() => setEstadoFiltro(estadoFiltro === 'ENTREGADO' ? 'TODOS' : 'ENTREGADO')} />
      </div>

      {/* Toolbar: búsqueda + filtro de obra + nuevo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar material u obra…"
            className="w-full rounded-lg border border-gray-300 py-2 pr-3 pl-9 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
            aria-label="Buscar"
          />
        </div>
        <select
          value={obraFiltro}
          onChange={(e) => setObraFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          aria-label="Filtrar por obra"
        >
          <option value="">Todas las obras</option>
          {obras.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <button
          onClick={() => setMostrarAlta((v) => !v)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          aria-expanded={mostrarAlta}
        >
          <span className="text-base leading-none">＋</span> Nuevo pedido
        </button>
      </div>

      {mostrarAlta && <AltaPedido onDone={() => setMostrarAlta(false)} />}

      {/* Lista: tabla en desktop, tarjetas en mobile */}
      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            {pedidos.length === 0 ? 'Todavía no hay pedidos. Cargá el primero con “Nuevo pedido”.' : 'Ningún pedido coincide con el filtro.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Material</th>
                  <th className="px-4 py-2.5">Obra</th>
                  <th className="px-4 py-2.5 text-right">Cant.</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((p) => (
                  <FilaDesktop key={p.id_pedido} p={p} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="space-y-2 sm:hidden">
            {filtrados.map((p) => (
              <TarjetaMobile key={p.id_pedido} p={p} />
            ))}
          </div>
        </>
      )}
      <p className="text-center text-xs text-gray-400">
        {filtrados.length} de {pedidos.length} pedido(s) · edición nativa en el OS
      </p>
    </div>
  )
}

function Kpi({ n, label, tone, active, onClick }: { n: number; label: string; tone: 'rose' | 'amber' | 'emerald'; active: boolean; onClick: () => void }) {
  const ring = { rose: 'ring-rose-500', amber: 'ring-amber-500', emerald: 'ring-emerald-500' }[tone]
  const text = { rose: 'text-rose-600', amber: 'text-amber-600', emerald: 'text-emerald-600' }[tone]
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white p-3 text-left transition ${active ? `ring-2 ${ring} border-transparent` : 'border-gray-200 hover:border-gray-300'}`}
      aria-pressed={active}
    >
      <div className={`text-2xl font-bold ${text}`}>{n}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </button>
  )
}

function AltaPedido({ onDone }: { onDone: () => void }) {
  const [state, action, creating] = useActionState(createPedidoAction, initial)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset()
      onDone()
    }
  }, [state, onDone])
  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      data-testid="form-nuevo-pedido"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Campo label="Obra" className="lg:col-span-1">
          <input name="obra_texto" list="obras-list" required placeholder="San Francisco" className={inputCls} />
        </Campo>
        <Campo label="Material" className="lg:col-span-2">
          <input name="material" required placeholder="Cemento" className={inputCls} />
        </Campo>
        <Campo label="Cantidad">
          <input name="cantidad" type="number" step="0.01" min="0" required className={inputCls} />
        </Campo>
        <Campo label="Estado">
          <select name="estado" defaultValue="PENDIENTE" className={inputCls}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {estadoStyle(e).label}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={creating} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
          {creating ? 'Agregando…' : 'Guardar pedido'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-gray-500 hover:text-gray-800">
          Cancelar
        </button>
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  )
}

const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none'
function Campo({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col text-xs font-medium text-gray-500 ${className}`}>
      {label}
      {children}
    </label>
  )
}

function EstadoSelect({ p }: { p: PedidoMaterial }) {
  const [, setEstado, saving] = useActionState(setEstadoPedidoAction, initial)
  const st = estadoStyle(p.estado)
  return (
    <form action={setEstado} className="inline-flex">
      <input type="hidden" name="id_pedido" value={p.id_pedido} />
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${st.chip} ${saving ? 'opacity-50' : ''}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
        <select
          name="estado"
          defaultValue={(p.estado || 'PENDIENTE').toUpperCase()}
          disabled={saving}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="cursor-pointer border-0 bg-transparent p-0 pr-4 text-xs font-medium focus:ring-0 focus:outline-none"
          aria-label="Cambiar estado"
        >
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {estadoStyle(e).label}
            </option>
          ))}
        </select>
      </span>
    </form>
  )
}

function BorrarBtn({ p }: { p: PedidoMaterial }) {
  const [, del, deleting] = useActionState(deletePedidoAction, initial)
  return (
    <form
      action={del}
      onSubmit={(e) => {
        if (!confirm(`¿Borrar el pedido de ${p.material || 'material'}?`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id_pedido" value={p.id_pedido} />
      <button type="submit" disabled={deleting} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Borrar pedido">
        {deleting ? '…' : (
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M8.75 1a1 1 0 00-.95.68L7.4 3H4a1 1 0 000 2h12a1 1 0 100-2h-3.4l-.4-1.32A1 1 0 0011.25 1h-2.5zM5 7a1 1 0 011 1v7a1 1 0 102 0V8a1 1 0 112 0v7a1 1 0 102 0V8a1 1 0 112 0v7a3 3 0 01-3 3H8a3 3 0 01-3-3V7z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </form>
  )
}

// key sobre los valores editables → tras un guardado exitoso (revalidatePath cambia p),
// el componente remonta y `editando` vuelve a false sin efectos sincrónicos.
function editKey(p: PedidoMaterial) {
  return `${p.material}|${p.obra_texto}|${p.cantidad}`
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={label} title={label}>
      {children}
    </button>
  )
}
const iconEdit = (
  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
)

function FilaDesktop({ p }: { p: PedidoMaterial }) {
  const [editando, setEditando] = useState(false)
  const [, edit, saving] = useActionState(updatePedidoAction, initial)
  if (editando) {
    return (
      <tr key={editKey(p)} className="bg-amber-50/40">
        <td className="px-4 py-2 text-xs text-gray-400">editar</td>
        <td className="px-4 py-2" colSpan={4}>
          <form action={edit} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id_pedido" value={p.id_pedido} />
            <input name="material" defaultValue={p.material ?? ''} required placeholder="Material" className="min-w-[10rem] flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none" />
            <input name="obra_texto" list="obras-list" defaultValue={p.obra_texto ?? ''} required placeholder="Obra" className="w-40 rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none" />
            <input name="cantidad" type="number" step="0.01" min="0" defaultValue={p.cantidad ?? ''} required className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-gray-900 focus:outline-none" />
            <button type="submit" disabled={saving} className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50">{saving ? '…' : 'Guardar'}</button>
            <button type="button" onClick={() => setEditando(false)} className="text-xs text-gray-500 hover:text-gray-800">Cancelar</button>
          </form>
        </td>
        <td className="px-4 py-2"></td>
      </tr>
    )
  }
  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-2.5"><EstadoSelect p={p} /></td>
      <td className="px-4 py-2.5 font-medium text-gray-900">{p.material || '—'}</td>
      <td className="px-4 py-2.5 text-gray-600">{p.obra_texto || '—'}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{p.cantidad ?? '—'}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{fechaAR(p.fecha)}</td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex items-center gap-1">
          <IconBtn onClick={() => setEditando(true)} label="Editar">{iconEdit}</IconBtn>
          <BorrarBtn p={p} />
        </div>
      </td>
    </tr>
  )
}

function TarjetaMobile({ p }: { p: PedidoMaterial }) {
  const [editando, setEditando] = useState(false)
  const [, edit, saving] = useActionState(updatePedidoAction, initial)
  if (editando) {
    return (
      <form key={editKey(p)} action={edit} className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <input type="hidden" name="id_pedido" value={p.id_pedido} />
        <input name="material" defaultValue={p.material ?? ''} required placeholder="Material" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none" />
        <div className="flex gap-2">
          <input name="obra_texto" list="obras-list" defaultValue={p.obra_texto ?? ''} required placeholder="Obra" className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none" />
          <input name="cantidad" type="number" step="0.01" min="0" defaultValue={p.cantidad ?? ''} required className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-900 focus:outline-none" />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="flex-1 rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50">{saving ? '…' : 'Guardar'}</button>
          <button type="button" onClick={() => setEditando(false)} className="rounded px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800">Cancelar</button>
        </div>
      </form>
    )
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-gray-900">{p.material || '—'}</div>
          <div className="mt-0.5 text-sm text-gray-500">
            {p.obra_texto || 'sin obra'} · <span className="tabular-nums">{p.cantidad ?? '—'}</span> · {fechaAR(p.fecha)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={() => setEditando(true)} label="Editar">{iconEdit}</IconBtn>
          <BorrarBtn p={p} />
        </div>
      </div>
      <div className="mt-2"><EstadoSelect p={p} /></div>
    </div>
  )
}
