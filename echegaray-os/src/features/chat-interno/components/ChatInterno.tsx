'use client'

import { useRef, useState } from 'react'
import { Aviso, Boton, CAMPO, Eyebrow, Nulo, TituloPantalla } from '@/shared/components/ds'
import { fechaHora } from '@/shared/utils/fecha'
import type { ChatRespuesta, ChatTurno } from '../types'

// UI del chat interno (F7). Pregunta → POST /api/chat-interno → respuesta ya formateada (texto). Esta
// UI NO calcula ni interpreta números: sólo pinta strings que el backend armó. Guarda `typeof`: si algo
// no es string, no se renderiza (nunca un objeto como nodo React). 0-API: el backend es determinístico.
//
// ═══ QUÉ ES ESTA PANTALLA Y QUÉ NO ES (20/08/2026) ═══
//
// El handoff 3d dibuja OTRA cosa con el mismo nombre: un chat entre PERSONAS, un canal por obra, con
// no leídos y con lo decidido anclado a la actividad. Eso no existe todavía —no hay tabla de mensajes,
// ni canales, ni no leídos— y dibujarlo sería una maqueta que no guarda nada: el primer mensaje que
// alguien escriba se pierde, y el que lo escribió va a creer que su jefe de obra lo leyó.
//
// Lo que sí existe es esto: preguntarle al OS y que conteste leyendo las tablas que ya materializó,
// sin inventar un peso y sin llamar a ninguna API. Se lo lleva al lenguaje visual del handoff, se
// dice en la pantalla qué es, y el chat por obra queda declarado como lo que es: pendiente.

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
    <div className="border-t border-line pt-3" data-testid="chat-respuesta">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[16px] font-semibold text-ink">{texto(r.titulo)}</span>
        {/* El título YA dice «No tengo esa capacidad todavía» (lo arma el route handler). Acá va
            la marca corta: repetir la frase entera al lado de sí misma se lee como un error. */}
        {!r.cubierta && (
          <span className="text-[12.5px] text-warn" data-testid="chat-no-cubierta">
            sin capacidad
          </span>
        )}
      </div>
      {r.intro && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{texto(r.intro)}</p>}

      {r.datos.length > 0 && (
        <ul className="mt-3 divide-y divide-[#EFEEEA] border-t border-[#EFEEEA]">
          {r.datos.map((d, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span className="text-[13px] text-ink-soft">{texto(d.etiqueta)}</span>
              <span className="flex items-baseline gap-3">
                {d.estado === 'sin_datos' ? (
                  <Nulo>{texto(d.valor) || 'aún sin datos'}</Nulo>
                ) : (
                  <span className="font-mono text-[12.5px] tabular-nums text-ink">{texto(d.valor)}</span>
                )}
                {d.fuente && <span className="text-[11px] text-faint">{texto(d.fuente)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {r.nota && <p className="mt-2.5 text-[12.5px] text-muted">{texto(r.nota)}</p>}
      {r.capturadoEn && <p className="mt-1 text-[11px] text-faint">Datos al {fechaHora(r.capturadoEn)}</p>}
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
        prev.map((t) => (t.id === id ? { ...t, respuesta: data.respuesta ?? null, error: data.error ?? null } : t)),
      )
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No pude conectar con el OS'
      setTurnos((prev) => prev.map((t) => (t.id === id ? { ...t, error: mensaje } : t)))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 py-6 lg:px-10">
        <div className="max-w-[680px]" data-testid="chat-interno">
          <TituloPantalla>Chat del OS</TituloPantalla>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Preguntale al OS por caja, cobranzas, obligaciones, obras o el scorecard: contesta con lo que ya calculó,
            sin inventar, y si no tiene la capacidad te lo dice. La conversación por obra entre personas —canales,
            no leídos, mensajes anclados a una actividad— todavía no existe.
          </p>

          {turnos.length === 0 && (
            <div className="mt-5" data-testid="chat-sugerencias">
              <Eyebrow>Lo que puedo contestar hoy</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-2">
                {SUGERENCIAS.map((s) => (
                  <Boton key={s} variante="secundaria" onClick={() => void preguntar(s)}>
                    {s}
                  </Boton>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-6" data-testid="chat-hilo">
            {turnos.map((t) => (
              <div key={t.id} className="flex flex-col gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-faint">Vos</span>
                  <span className="text-[13px] text-ink" data-testid="chat-pregunta">
                    {t.pregunta}
                  </span>
                </div>
                {t.respuesta && <RespuestaVista r={t.respuesta} />}
                {t.error && (
                  <Aviso tono="neg" titulo="El OS no pudo contestar." testid="chat-error">
                    {t.error}
                  </Aviso>
                )}
                {!t.respuesta && !t.error && <p className="text-[12.5px] text-faint">Consultando el OS…</p>}
              </div>
            ))}
          </div>

          <form
            className="mt-6 flex gap-2 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              void preguntar(texto0)
            }}
          >
            <input
              value={texto0}
              onChange={(e) => setTexto0(e.target.value)}
              placeholder="Escribí tu pregunta…"
              className={CAMPO}
              data-testid="chat-input"
              aria-label="Tu pregunta"
            />
            <Boton type="submit" variante="primaria" disabled={pending || !texto0.trim()} data-testid="chat-enviar">
              {pending ? 'Consultando…' : 'Preguntar'}
            </Boton>
          </form>
        </div>
      </div>
    </div>
  )
}
