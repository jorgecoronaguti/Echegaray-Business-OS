'use client'

import { useRef, useState } from 'react'
import type { ChatRespuesta, ChatTurno } from '../types'

// UI del chat interno (F7). Pregunta → POST /api/chat-interno → respuesta ya formateada (texto). Esta
// UI NO calcula ni interpreta números: sólo pinta strings que el backend armó. Guarda `typeof`: si algo
// no es string, no se renderiza (nunca un objeto como nodo React). 0-API: el backend es determinístico.

const SUGERENCIAS = [
  '¿Cuánto tengo en caja hoy?',
  '¿Qué tengo por cobrar este mes?',
  '¿Cuánto tengo que pagar?',
  'Dame el scorecard de finanzas',
  '¿Cómo va el avance de las obras?',
] as const

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function RespuestaVista({ r }: { r: ChatRespuesta }) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${r.cubierta ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'}`}
      data-testid="chat-respuesta"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{texto(r.titulo)}</span>
        {!r.cubierta && (
          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900" data-testid="chat-no-cubierta">
            sin capacidad
          </span>
        )}
      </div>
      {r.intro && <p className="mt-1 text-gray-600">{texto(r.intro)}</p>}
      {r.datos.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
          {r.datos.map((d, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
              <span className="text-gray-700">{texto(d.etiqueta)}</span>
              <span className="flex items-baseline gap-2">
                {d.valor && (
                  <span className={`font-mono font-medium ${d.estado === 'sin_datos' ? 'text-gray-400' : 'text-gray-900'}`}>
                    {texto(d.valor)}
                  </span>
                )}
                {d.fuente && <span className="text-[10px] text-gray-400">{texto(d.fuente)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {r.nota && <p className="mt-2 text-xs text-gray-500">{texto(r.nota)}</p>}
      {r.capturadoEn && (
        <p className="mt-1 text-[10px] text-gray-400">Datos al {new Date(r.capturadoEn).toLocaleString('es-AR')}</p>
      )}
    </div>
  )
}

export function ChatInterno() {
  const [texto0, setTexto0] = useState('')
  const [turnos, setTurnos] = useState<ChatTurno[]>([])
  const [pending, setPending] = useState(false)
  // Contador monotónico para la key del turno (evita Date.now/Math.random en el árbol de render).
  const contador = useRef(0)

  async function preguntar(preguntaRaw: string) {
    const pregunta = preguntaRaw.trim()
    if (!pregunta || pending) return
    contador.current += 1
    const id = `turno-${contador.current}`
    setTurnos((prev) => [...prev, { id, pregunta, respuesta: null, error: null }])
    setTexto0('')
    setPending(true)
    try {
      const res = await fetch('/api/chat-interno', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: pregunta }),
      })
      const data = (await res.json()) as { respuesta?: ChatRespuesta; error?: string }
      setTurnos((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, respuesta: data.respuesta ?? null, error: data.error ?? null } : t,
        ),
      )
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No pude conectar con el OS'
      setTurnos((prev) => prev.map((t) => (t.id === id ? { ...t, error: mensaje } : t)))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4" data-testid="chat-interno">
      <h1 className="text-lg font-semibold">Chat del OS</h1>
      <p className="mt-1 text-sm text-gray-600">
        Preguntá sobre caja, cobranzas, obligaciones, obras o el scorecard. Respondo con lo que el OS ya
        calculó — sin inventar. Si no tengo la capacidad, te lo digo.
      </p>

      {turnos.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="chat-sugerencias">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => preguntar(s)}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4" data-testid="chat-hilo">
        {turnos.map((t) => (
          <div key={t.id} className="flex flex-col gap-2">
            <div className="self-end rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white" data-testid="chat-pregunta">
              {t.pregunta}
            </div>
            {t.respuesta && <RespuestaVista r={t.respuesta} />}
            {t.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="chat-error">
                {t.error}
              </div>
            )}
            {!t.respuesta && !t.error && <div className="text-xs text-gray-400">Consultando el OS…</div>}
          </div>
        ))}
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void preguntar(texto0)
        }}
      >
        <input
          value={texto0}
          onChange={(e) => setTexto0(e.target.value)}
          placeholder="Escribí tu pregunta…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          data-testid="chat-input"
        />
        <button
          type="submit"
          disabled={pending || !texto0.trim()}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          data-testid="chat-enviar"
        >
          Preguntar
        </button>
      </form>
    </div>
  )
}
