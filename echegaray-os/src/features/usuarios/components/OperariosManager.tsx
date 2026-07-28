'use client'

import { useActionState, useState } from 'react'
import {
  crearOperarioAction,
  borrarOperarioAction,
  resetPasswordOperarioAction,
  type OperarioActionState,
} from '../services/operariosActions'
import type { Operario } from '../services/operariosService'
import { siteUrl } from '@/lib/site-url'

const initial: OperarioActionState = { error: null }

// Muestra la credencial recién generada (una sola vez) con botón para copiar.
function Credencial({ email, password }: { email: string; password: string }) {
  const [copiado, setCopiado] = useState(false)
  const texto = `Echegaray OS — acceso\nWeb: ${siteUrl()}/login\nUsuario: ${email}\nClave: ${password}`
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <p className="font-medium text-emerald-800">Cuenta creada — pasale estos datos al operario:</p>
      <pre className="mt-2 rounded bg-white/70 p-2 text-xs whitespace-pre-wrap text-gray-800">{texto}</pre>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        }}
        className="mt-2 rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
      >
        {copiado ? 'Copiado ✓' : 'Copiar'}
      </button>
      <p className="mt-1 text-[11px] text-emerald-700">La clave no se vuelve a mostrar. Si se pierde, usá “Reset clave”.</p>
    </div>
  )
}

export function OperariosManager({ operarios }: { operarios: Operario[] }) {
  const [state, crear, creando] = useActionState(crearOperarioAction, initial)

  return (
    <div className="space-y-5">
      <form action={crear} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Nuevo operario</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col text-xs font-medium text-gray-500 sm:col-span-1">
            Nombre
            <input name="nombre" required placeholder="Juan Pérez" className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none" />
          </label>
          <label className="flex flex-col text-xs font-medium text-gray-500 sm:col-span-2">
            Email
            <input name="email" type="email" required placeholder="juan@ecsas.com.ar" className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none" />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={creando} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
            {creando ? 'Creando…' : 'Crear operario'}
          </button>
          {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
        </div>
        {state.ok && state.email && state.password && (
          <div className="mt-3">
            <Credencial email={state.email} password={state.password} />
          </div>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
              <th className="px-4 py-2.5">Nombre</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {operarios.map((o) => (
              <OperarioRow key={o.id} o={o} />
            ))}
            {operarios.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  Todavía no hay operarios. Creá el primero arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OperarioRow({ o }: { o: Operario }) {
  const [resetState, reset, reseteando] = useActionState(resetPasswordOperarioAction, initial)
  const [, borrar, borrando] = useActionState(borrarOperarioAction, initial)
  return (
    <>
      <tr className="hover:bg-gray-50/60">
        <td className="px-4 py-2.5 font-medium text-gray-900">{o.nombre}</td>
        <td className="px-4 py-2.5 text-gray-600">{o.email || '—'}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-2">
            <form action={reset}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="email" value={o.email ?? ''} />
              <button type="submit" disabled={reseteando} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-gray-900 disabled:opacity-50">
                {reseteando ? '…' : 'Reset clave'}
              </button>
            </form>
            <form
              action={borrar}
              onSubmit={(e) => {
                if (!confirm(`¿Borrar al operario ${o.nombre}?`)) e.preventDefault()
              }}
            >
              <input type="hidden" name="id" value={o.id} />
              <button type="submit" disabled={borrando} className="rounded px-2 py-1 text-xs text-gray-400 hover:text-rose-600 disabled:opacity-50">
                {borrando ? '…' : 'Borrar'}
              </button>
            </form>
          </div>
        </td>
      </tr>
      {resetState.ok && resetState.email && resetState.password && (
        <tr>
          <td colSpan={3} className="px-4 pb-3">
            <Credencial email={resetState.email} password={resetState.password} />
          </td>
        </tr>
      )}
    </>
  )
}
