'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import {
  setUbicacionAction,
  uploadFotoAction,
  createHerramientaAction,
  deleteHerramientaAction,
  type ActionState,
} from '../services/herramientasActions'
import type { Herramienta } from '../services/herramientasService'

const initial: ActionState = { error: null }

// Color por tipo de ubicación: base (almacén/taller) vs en obra.
function ubicacionTone(u: string | null): string {
  const s = (u || '').toUpperCase()
  if (s === 'ALMACEN' || s === 'ALMACÉN') return 'bg-slate-100 text-slate-700'
  if (s === 'TALLER') return 'bg-violet-100 text-violet-700'
  if (!s) return 'bg-gray-100 text-gray-500'
  return 'bg-sky-100 text-sky-700' // en obra
}

export function HerramientasManager({ herramientas, ubicaciones }: { herramientas: Herramienta[]; ubicaciones: string[] }) {
  const [q, setQ] = useState('')
  const [ubiFiltro, setUbiFiltro] = useState('')
  const [mostrarAlta, setMostrarAlta] = useState(false)

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    return herramientas
      .filter((h) => (ubiFiltro ? (h.ubicacion_actual || '') === ubiFiltro : true))
      .filter((h) => (term ? `${h.nombre} ${h.ubicacion_actual}`.toLowerCase().includes(term) : true))
  }, [herramientas, q, ubiFiltro])

  const conFoto = herramientas.filter((h) => h.imagen_url).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar herramienta o ubicación…"
            className="w-full rounded-lg border border-gray-300 py-2 pr-3 pl-9 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
            aria-label="Buscar"
          />
        </div>
        <select
          value={ubiFiltro}
          onChange={(e) => setUbiFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          aria-label="Filtrar por ubicación"
        >
          <option value="">Todas las ubicaciones</option>
          {ubicaciones.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <button
          onClick={() => setMostrarAlta((v) => !v)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          <span className="text-base leading-none">＋</span> Nueva herramienta
        </button>
      </div>

      {mostrarAlta && <AltaHerramienta ubicaciones={ubicaciones} onDone={() => setMostrarAlta(false)} />}

      <p className="text-xs text-gray-400">
        {filtradas.length} de {herramientas.length} herramienta(s) · {conFoto} con foto
      </p>

      {filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
          {herramientas.length === 0 ? 'Sin herramientas. Agregá la primera.' : 'Ninguna coincide con el filtro.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtradas.map((h) => (
            <HerramientaCard key={h.id_herramienta} h={h} ubicaciones={ubicaciones} />
          ))}
        </div>
      )}
    </div>
  )
}

function HerramientaCard({ h, ubicaciones }: { h: Herramienta; ubicaciones: string[] }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      <Foto h={h} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-900" title={h.nombre}>
            {h.nombre}
          </div>
        </div>
        <UbicacionSelect h={h} ubicaciones={ubicaciones} />
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ubicacionTone(h.ubicacion_actual)}`}>
            {h.ubicacion_actual || 'sin ubicación'}
          </span>
          <BorrarBtn h={h} />
        </div>
      </div>
    </div>
  )
}

function Foto({ h }: { h: Herramienta }) {
  const [, upload, uploading] = useActionState(uploadFotoAction, initial)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <form ref={formRef} action={upload} className="relative aspect-square bg-gray-100">
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      {h.imagen_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={h.imagen_url} alt={h.nombre} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-300">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18a1.5 1.5 0 001.5-1.5V5.25A1.5 1.5 0 0021 3.75H3a1.5 1.5 0 00-1.5 1.5v13.5A1.5 1.5 0 003 20.25z" />
          </svg>
          <span className="text-[11px]">sin foto</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        name="foto"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={() => formRef.current?.requestSubmit()}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute right-2 bottom-2 rounded-full bg-white/90 p-1.5 text-gray-700 shadow ring-1 ring-gray-200 hover:bg-white disabled:opacity-50"
        aria-label={h.imagen_url ? 'Cambiar foto' : 'Subir foto'}
        title={h.imagen_url ? 'Cambiar foto' : 'Subir foto'}
      >
        {uploading ? (
          <span className="block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M10 3a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V4a1 1 0 011-1z" />
          </svg>
        )}
      </button>
    </form>
  )
}

function UbicacionSelect({ h, ubicaciones }: { h: Herramienta; ubicaciones: string[] }) {
  const [, setUbi, saving] = useActionState(setUbicacionAction, initial)
  return (
    <form action={setUbi} className="flex">
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      <select
        name="ubicacion_actual"
        defaultValue={h.ubicacion_actual || ''}
        disabled={saving}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-xs text-gray-700 focus:border-gray-900 focus:outline-none disabled:opacity-50"
        aria-label="Cambiar ubicación"
      >
        {!ubicaciones.includes(h.ubicacion_actual || '') && h.ubicacion_actual && (
          <option value={h.ubicacion_actual}>{h.ubicacion_actual}</option>
        )}
        {ubicaciones.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </form>
  )
}

function BorrarBtn({ h }: { h: Herramienta }) {
  const [, del, deleting] = useActionState(deleteHerramientaAction, initial)
  return (
    <form
      action={del}
      onSubmit={(e) => {
        if (!confirm(`¿Borrar "${h.nombre}"?`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="id_herramienta" value={h.id_herramienta} />
      <button type="submit" disabled={deleting} className="rounded p-1 text-gray-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Borrar">
        {deleting ? '…' : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M8.75 1a1 1 0 00-.95.68L7.4 3H4a1 1 0 000 2h12a1 1 0 100-2h-3.4l-.4-1.32A1 1 0 0011.25 1h-2.5zM5 7a1 1 0 011 1v7a1 1 0 102 0V8a1 1 0 112 0v7a1 1 0 102 0V8a1 1 0 112 0v7a3 3 0 01-3 3H8a3 3 0 01-3-3V7z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </form>
  )
}

function AltaHerramienta({ ubicaciones, onDone }: { ubicaciones: string[]; onDone: () => void }) {
  const [state, action, creating] = useActionState(createHerramientaAction, initial)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset()
      onDone()
    }
  }, [state, onDone])
  return (
    <form ref={formRef} action={action} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-xs font-medium text-gray-500 sm:col-span-2">
          Nombre
          <input name="nombre" required placeholder="Taladro Bosch" className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none" />
        </label>
        <label className="flex flex-col text-xs font-medium text-gray-500">
          Ubicación
          <input name="ubicacion_actual" list="ubis-list" defaultValue="ALMACEN" className="mt-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none" />
          <datalist id="ubis-list">
            {ubicaciones.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={creating} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
          {creating ? 'Agregando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-gray-500 hover:text-gray-800">
          Cancelar
        </button>
        {state.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  )
}
