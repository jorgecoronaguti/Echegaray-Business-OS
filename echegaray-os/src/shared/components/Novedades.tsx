'use client'

// LA CAMPANITA DE LA BARRA DE APLICACIÓN — pantalla 00 del canónico.
//
// ═══ MEDIDO DEL MOCKUP ═══
//
// `00 · Home Navegación.dc.html`: botón 28×28, radio 6, `color:#6B6B67`, hover `#F2F1ED`; SVG 15×15
// `strokeWidth="2"`; y el punto en `position:absolute;top:5px;right:6px;width:5px;height:5px;
// borderRadius:3px;background:#B42318`. Va literal.
//
// ═══ QUÉ ES UNA «NOVEDAD» ACÁ ═══
//
// Lo que pide trabajo hoy y tiene dónde arreglarse: los mismos chips que publica la home de
// Administración (`chipsDeAtencion`). No es una bandeja de mensajes ni un historial: el OS no tiene
// ninguna de las dos, y dibujar una campanita sobre una bandeja inexistente era exactamente lo que
// este header evitaba. El porqué completo, en `services/novedadesActions.ts`.
//
// La lectura se pide DESPUÉS de hidratar: el header sigue saliendo por streaming sin esperar a nadie.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getNovedades } from '@/features/administracion/services/novedadesActions'
import {
  cuantasNovedades, estadoDeCampana, hayPunto, leyendaCampana, type LecturaNovedades,
} from '@/features/administracion/services/novedades'

export function Novedades() {
  const [abierto, setAbierto] = useState(false)
  const [lectura, setLectura] = useState<LecturaNovedades>(null)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    getNovedades().then((r) => { if (vivo) setLectura(r) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  const estado = estadoDeCampana(lectura)
  const chips = lectura?.ok ? lectura.chips : []
  const total = cuantasNovedades(chips)
  const texto = leyendaCampana(estado, lectura && !lectura.ok ? lectura.error : null)

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        data-testid="novedades"
        data-estado={estado}
        title={estado === 'con_novedades' ? `${total} ${total === 1 ? 'cosa pide' : 'cosas piden'} trabajo` : 'Novedades'}
        aria-label="Novedades"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`relative flex h-[28px] w-[28px] items-center justify-center rounded-md transition-colors ${
          abierto ? 'bg-[#F2F1ED] text-ink' : 'text-muted hover:bg-[#F2F1ED] hover:text-ink'
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M18 15V10a6 6 0 10-12 0v5l-1.5 3h15z" />
          <path d="M10 21h4" />
        </svg>
        {hayPunto(estado) && (
          <span
            data-testid="punto-novedades"
            className="absolute right-[6px] top-[5px] h-[5px] w-[5px] rounded-[3px] bg-[#B42318]"
          />
        )}
      </button>

      {abierto && (
        <div
          role="menu"
          data-testid="panel-novedades"
          className="absolute right-0 top-full z-40 mt-1.5 w-[340px] overflow-hidden rounded-[10px] border border-line bg-surface shadow-pop"
        >
          <div className="flex items-baseline gap-2 border-b border-line px-3 py-2">
            <span className="text-[12px] font-semibold text-ink">Pide trabajo</span>
            {estado === 'con_novedades' && (
              <span className="font-mono text-[11px] tabular-nums text-faint">{total}</span>
            )}
          </div>
          {texto ? (
            <p
              data-testid={`novedades-${estado}`}
              className={`px-3 py-3 text-[12px] ${estado === 'error' || estado === 'sin_lectura' ? 'text-neg' : 'text-muted'}`}
            >
              {texto}
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              {chips.map((c) => (
                // CADA UNO LLEVA AL FILTRO QUE LO PRODUJO, no a la pantalla en general: el `href`
                // lo trae `chipsDeAtencion`, que es el mismo que usa la banda de `/administracion`.
                <Link
                  key={c.clave}
                  href={c.href}
                  prefetch={false}
                  onClick={() => setAbierto(false)}
                  data-testid={`novedad-${c.clave}`}
                  className="flex items-center gap-2 border-b border-[#F5F4F0] px-3 py-2 last:border-0 hover:bg-surface-quiet"
                >
                  <span className={`shrink-0 font-mono text-[13px] font-semibold tabular-nums ${c.tono === 'neg' ? 'text-neg' : 'text-warn'}`}>
                    {c.numero}
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] text-ink-soft">{c.texto}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
