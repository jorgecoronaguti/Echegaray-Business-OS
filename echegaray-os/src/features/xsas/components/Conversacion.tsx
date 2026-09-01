'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// LA CONVERSACIÓN CON XSAS — la caja donde se le pide trabajo al OS en lenguaje normal.
//
// ═══ QUÉ HACE ESTA PANTALLA Y QUÉ NO ═══
//
// Manda el texto a `/api/xsas` y muestra lo que vuelve. No elige capacidades, no arma prompts, no
// conoce una sola skill: eso es del gateway, que vive en el OS. Si esta pantalla supiera qué skill
// usar, el conocimiento estaría acá adentro y no en el cerebro — que es exactamente el error que el
// producto quiere evitar.
//
// ═══ LA LÍNEA DE ABAJO DE CADA RESPUESTA ═══
//
// Dice con qué se resolvió y SI se usó el razonador. Es la única forma de que se pueda comprobar,
// sin abrir un log, que el trabajo cotidiano no está pagando un modelo. Va discreta a propósito.

interface Capacidades {
  nivel: number | null
  skills: string[]
  tools: string[]
  via: string | null
  /** Por qué hizo falta el razonador. Lo pone el gateway; NULL cuando no escaló. */
  razon?: string | null
}

interface RespuestaXsas {
  ok?: boolean
  estado?: string
  respuesta?: string | null
  datos?: unknown
  capacidades?: Capacidades
  llm?: { modelo?: string; proveedor?: string } | null
  degradacion?: string | null
  error?: { tipo?: string; mensaje?: string } | string | null
  links?: { titulo?: string; url?: string }[]
  ms?: number
  contextoRechazado?: string[]
}

interface Turno {
  id: string
  quien: 'yo' | 'xsas'
  texto: string
  meta?: RespuestaXsas
  ms?: number
}

const EJEMPLOS = [
  '¿qué podés hacer?',
  '¿cómo venimos?',
  '¿cuánta plata hay en caja hoy?',
  '¿qué vence esta semana?',
]

const idNuevo = () => (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()))

/** El nivel con el que se resolvió, en palabras. 0 y 1 no pagan modelo. */
const NIVEL_TEXTO: Record<number, string> = {
  0: 'determinístico',
  1: 'capacidad del OS',
  2: 'razonador liviano',
  3: 'razonamiento',
}

function LineaDeTraza({ r, ms }: { r: RespuestaXsas; ms?: number }) {
  const c = r.capacidades
  const usoModelo = Boolean(r.llm?.modelo)
  const partes: string[] = []
  if (c?.nivel != null) partes.push(NIVEL_TEXTO[c.nivel] ?? `nivel ${c.nivel}`)
  if (c?.tools?.length) partes.push(c.tools.join(', '))
  else if (c?.skills?.length) partes.push(c.skills.join(', '))
  else if (c?.via) partes.push(c.via)
  return (
    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
      XSAS · {partes.join(' · ') || 'sin capacidad'}
      {' · Reasoner: '}
      <span className={usoModelo ? 'text-amber-600' : 'text-emerald-600'}>{usoModelo ? 'SÍ' : 'NO'}</span>
      {usoModelo && c?.razon ? ` (${c.razon})` : ''}
      {typeof ms === 'number' ? ` · ${ms} ms` : ''}
      {r.degradacion ? ` · DEGRADADO: ${r.degradacion}` : ''}
    </p>
  )
}

export function Conversacion({ obraId, obraNombre }: { obraId?: string; obraNombre?: string }) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  // Una sola correlación por conversación: la traza del OS puede reconstruir el hilo entero.
  const correlacion = useRef<string>(idNuevo())

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turnos, enviando])

  const enviar = useCallback(async (mensaje: string) => {
    const limpio = mensaje.trim()
    if (!limpio || enviando) return
    setTexto('')
    setTurnos((t) => [...t, { id: idNuevo(), quien: 'yo', texto: limpio }])
    setEnviando(true)
    const t0 = performance.now()
    try {
      const res = await fetch('/api/xsas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mensaje: limpio,
          origen: '/xsas',
          correlation_id: correlacion.current,
          ...(obraId ? { entidad: { obra_id: obraId }, contexto: { obra: obraNombre } } : {}),
        }),
      })
      const cuerpo = (await res.json()) as RespuestaXsas
      const ms = Math.round(performance.now() - t0)
      const texto = cuerpo.respuesta
        ?? (typeof cuerpo.error === 'string' ? cuerpo.error : cuerpo.error?.mensaje)
        ?? 'XSAS contestó sin texto.'
      setTurnos((t) => [...t, { id: idNuevo(), quien: 'xsas', texto, meta: cuerpo, ms }])
    } catch (e) {
      setTurnos((t) => [...t, {
        id: idNuevo(), quien: 'xsas',
        texto: `No se pudo alcanzar XSAS: ${e instanceof Error ? e.message : 'error de red'}`,
      }])
    } finally {
      setEnviando(false)
    }
  }, [enviando, obraId, obraNombre])

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {turnos.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-600">
              Pedile lo que necesites en lenguaje normal. XSAS elige solo qué capacidad del OS usa —
              no hace falta saber qué skill corresponde.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EJEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => enviar(e)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {turnos.map((t) => (
          <div key={t.id} className={t.quien === 'yo' ? 'flex justify-end' : ''}>
            <div
              className={
                t.quien === 'yo'
                  ? 'max-w-[80%] rounded-xl bg-slate-900 px-4 py-2 text-sm text-white'
                  : 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3'
              }
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.texto}</p>
              {t.quien === 'xsas' && t.meta && <LineaDeTraza r={t.meta} ms={t.ms} />}
              {t.quien === 'xsas' && t.meta?.links?.length ? (
                <ul className="mt-2 space-y-1">
                  {t.meta.links.map((l, i) => (
                    <li key={i}>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                        {l.titulo ?? l.url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm text-slate-500">XSAS está trabajando…</p>
          </div>
        )}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void enviar(texto) }}
        className="border-t border-slate-200 pt-3"
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto) }
          }}
          rows={2}
          placeholder="Escribí lo que necesitás… (Enter envía, Shift+Enter salta de línea)"
          className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Los archivos todavía no entran por acá: se procesan por el bot @xsas de Mattermost.
          </span>
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {enviando ? 'Trabajando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}
