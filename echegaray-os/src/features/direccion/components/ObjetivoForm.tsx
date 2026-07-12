'use client'

import { useRef, useState, useTransition } from 'react'
import { cargarObjetivo } from '../services/actions'

export function ObjetivoForm() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const res = await cargarObjetivo(fd)
      if (res.ok) {
        setMsg({ ok: true, text: 'Objetivo enviado al Director IA.' })
        formRef.current?.reset()
      } else {
        setMsg({ ok: false, text: res.error ?? 'Error' })
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input
        name="title" placeholder="Título breve (opcional)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <textarea
        name="goal" required rows={3}
        placeholder="Objetivo de Dirección: qué querés lograr. El Director lo interpreta, prioriza, planifica y asigna a especialistas."
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <label className="text-xs text-slate-500">Prioridad
          <input name="priority" type="number" defaultValue={0} min={0} max={100}
            className="ml-2 w-16 rounded border border-slate-200 px-2 py-1 text-sm" />
        </label>
        <button type="submit" disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Enviando…' : 'Dar objetivo al Director'}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </form>
  )
}
