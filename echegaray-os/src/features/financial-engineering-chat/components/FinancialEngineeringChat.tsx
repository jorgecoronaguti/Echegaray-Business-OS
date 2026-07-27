'use client'

import { useRef, useState } from 'react'
import type { LecturaLente, RespuestaAPI, RespuestaFEMultiexperto, TurnoFE } from '../types'

// UI del FINANCIAL ENGINEERING MULTI-EXPERTO (FE1). Pregunta → POST /api/financial-engineering-chat →
// tres lecturas expertas (contador, abogado, financiero) grounded en sus skills + la comparación
// (coincidencias / conflictos). Es SÓLO-LECTURA: interpreta el Flujo de Fondos, no lo toca.
//
// Esta UI NO calcula ni interpreta números: sólo pinta strings que el backend armó. Guarda `texto()`:
// si algo no es string, no se renderiza (nunca un objeto como nodo React).

const SUGERENCIAS = [
  '¿Conviene pagar hoy a los proveedores o esperar?',
  '¿Cómo está la caja esta semana y qué riesgos hay?',
  '¿Me conviene entrar al descubierto para cubrir un pago?',
  '¿Qué obligaciones vencidas debería priorizar?',
] as const

const ESTILO_LENTE: Record<string, { chip: string; borde: string }> = {
  contador: { chip: 'bg-sky-100 text-sky-800', borde: 'border-sky-200' },
  abogado: { chip: 'bg-violet-100 text-violet-800', borde: 'border-violet-200' },
  financiero: { chip: 'bg-emerald-100 text-emerald-800', borde: 'border-emerald-200' },
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

// Render de un texto multipárrafo/viñetas como líneas (sin markdown pesado): respeta saltos de línea.
function Parrafos({ contenido }: { contenido: string }) {
  const lineas = contenido.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div className="space-y-1">
      {lineas.map((l, i) => (
        <p key={i} className="text-sm leading-relaxed text-gray-700">
          {texto(l)}
        </p>
      ))}
    </div>
  )
}

function LenteCard({ lente }: { lente: LecturaLente }) {
  const est = ESTILO_LENTE[lente.id] ?? { chip: 'bg-gray-100 text-gray-700', borde: 'border-gray-200' }
  return (
    <div className={`rounded-lg border ${est.borde} bg-white p-3`} data-testid={`lente-${lente.id}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${est.chip}`}>{texto(lente.titulo)}</span>
        <span className="text-[11px] text-gray-500">{texto(lente.persona)}</span>
      </div>
      {lente.error ? (
        <p className="text-sm text-amber-700" data-testid={`lente-${lente.id}-error`}>
          Lente no disponible: {texto(lente.error)}
        </p>
      ) : (
        <Parrafos contenido={texto(lente.texto)} />
      )}
      {lente.skills.length > 0 && (
        <p className="mt-2 border-t border-gray-100 pt-1.5 text-[10px] text-gray-400">
          grounded en: {lente.skills.map(texto).join(' · ')}
        </p>
      )}
    </div>
  )
}

function Comparacion({ r }: { r: RespuestaFEMultiexperto }) {
  const c = r.comparacion
  if (c.error && !c.coincidencias.length && !c.conflictos.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="comparacion">
        <h3 className="mb-1 text-sm font-semibold text-gray-800">Comparación entre lentes</h3>
        <p className="text-sm text-gray-500">{texto(c.error)}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 p-3" data-testid="comparacion">
      <h3 className="mb-2 text-sm font-semibold text-gray-800">Comparación entre lentes</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div data-testid="comparacion-coincidencias">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Coincidencias</p>
          {c.coincidencias.length ? (
            <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
              {c.coincidencias.map((x, i) => (
                <li key={i}>{texto(x)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Sin coincidencias registradas.</p>
          )}
        </div>
        <div data-testid="comparacion-conflictos">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Conflictos</p>
          {c.conflictos.length ? (
            <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
              {c.conflictos.map((x, i) => (
                <li key={i}>{texto(x)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Sin conflictos entre las lentes.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function RespuestaVista({ r }: { r: RespuestaFEMultiexperto }) {
  return (
    <div className="space-y-3" data-testid="fe-respuesta">
      <div className="grid gap-3 lg:grid-cols-3">
        {r.lecturas.map((l) => (
          <LenteCard key={l.id} lente={l} />
        ))}
      </div>
      <Comparacion r={r} />
      <details className="rounded-lg border border-gray-200 bg-white p-3">
        <summary className="cursor-pointer text-[12px] font-medium text-gray-600">Ver el contexto financiero leído (sólo-lectura)</summary>
        <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600">{texto(r.contextoTexto)}</pre>
      </details>
      <p className="text-right text-[10px] text-gray-400">
        Razonado bajo demanda · {r.costoTotalUsd !== null ? `costo ≈ US$${r.costoTotalUsd.toFixed(3)}` : 'costo no informado'}
      </p>
    </div>
  )
}

export function FinancialEngineeringChat() {
  const [pregunta, setPregunta] = useState('')
  const [turnos, setTurnos] = useState<TurnoFE[]>([])
  const [enviando, setEnviando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  async function enviar(texto: string) {
    const q = texto.trim()
    if (!q || enviando) return
    setEnviando(true)
    const id = crypto.randomUUID()
    setTurnos((prev) => [...prev, { id, pregunta: q, respuesta: null, error: null, cargando: true }])
    setPregunta('')
    try {
      const res = await fetch('/api/financial-engineering-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pregunta: q }),
      })
      const data = (await res.json()) as RespuestaAPI
      setTurnos((prev) =>
        prev.map((t) =>
          t.id === id
            ? data.ok
              ? { ...t, respuesta: data.respuesta, error: null, cargando: false }
              : { ...t, respuesta: null, error: data.error + (data.contextoTexto ? `\n\n${data.contextoTexto}` : ''), cargando: false }
            : t,
        ),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error de red'
      setTurnos((prev) => prev.map((t) => (t.id === id ? { ...t, error: `No pude consultar: ${msg}`, cargando: false } : t)))
    } finally {
      setEnviando(false)
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  return (
    <div className="space-y-4">
      {turnos.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="fe-sugerencias">
          <p className="mb-2 text-sm text-gray-600">
            Preguntá sobre el Flujo de Fondos y te doy la lectura del <b>contador</b>, el <b>abogado</b> y el{' '}
            <b>financiero</b>, más dónde coinciden y dónde chocan. Es sólo-lectura: interpreto, no toco la planilla.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => enviar(s)}
                className="rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-700 hover:bg-gray-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {turnos.map((t) => (
          <div key={t.id} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg bg-gray-900 px-3 py-2 text-sm text-white" data-testid="fe-pregunta">
                {texto(t.pregunta)}
              </div>
            </div>
            {t.cargando && (
              <p className="text-sm text-gray-500" data-testid="fe-cargando">
                Consultando a las tres lentes…
              </p>
            )}
            {t.error && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="fe-error">
                <pre className="whitespace-pre-wrap font-sans">{texto(t.error)}</pre>
              </div>
            )}
            {t.respuesta && <RespuestaVista r={t.respuesta} />}
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          enviar(pregunta)
        }}
        className="flex gap-2"
      >
        <input
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Preguntá sobre el Flujo de Fondos…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          data-testid="fe-input"
          disabled={enviando}
        />
        <button
          type="submit"
          disabled={enviando || !pregunta.trim()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          data-testid="fe-enviar"
        >
          {enviando ? '…' : 'Preguntar'}
        </button>
      </form>
    </div>
  )
}
