'use client'

import { useState, useTransition } from 'react'
import { decidirOperacion } from '../services/actions'
import { ESTADO_OP_COLOR, ESTADO_OP_LABEL, type PendingOperation } from '../types'

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString('es-AR', { hour12: false }) : '—'
}

export function OperacionCard({ op }: { op: PendingOperation }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [done, setDone] = useState(false)

  const isPending = op.status === 'awaiting_approval' && !done

  function decidir(action: 'approve' | 'reject') {
    setMsg(null)
    start(async () => {
      const res = await decidirOperacion({ id: op.id, action })
      if (res.ok) {
        setDone(true)
        setMsg({ ok: true, text: action === 'approve' ? 'Aprobada — el worker la ejecutará.' : 'Rechazada.' })
      } else {
        setMsg({ ok: false, text: res.error ?? 'Error' })
      }
    })
  }

  return (
    <li className="rounded-lg border border-slate-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{op.capability_slug}</span>
          <span className="text-sm text-slate-600">{op.agent_slug}</span>
          <span className="text-xs text-slate-400">· cuenta {op.account}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_OP_COLOR[op.status]}`}>
          {ESTADO_OP_LABEL[op.status]}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-400">{fmt(op.created_at)}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Block title="Destino">
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">{JSON.stringify(op.target, null, 2)}</pre>
        </Block>
        <Block title="Propuesta (borrador)">
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">{JSON.stringify(op.payload, null, 2)}</pre>
        </Block>
      </div>

      {op.error && <p className="mt-2 text-xs text-red-600">Error: {op.error}</p>}

      {isPending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button" onClick={() => decidir('approve')} disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Procesando…' : 'Aprobar y ejecutar'}
          </button>
          <button
            type="button" onClick={() => decidir('reject')} disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            Rechazar
          </button>
          {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>}
        </div>
      )}
      {!isPending && msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
    </li>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  )
}
