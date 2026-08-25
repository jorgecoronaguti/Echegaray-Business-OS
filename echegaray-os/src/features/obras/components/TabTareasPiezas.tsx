'use client'

// LAS PIEZAS DE CHROME DE LA PANTALLA 03 — los dos botones de ícono de la barra de acciones, las
// seis celdas de la franja de KPI y los dos divisores arrastrables.
//
// Están acá porque `TabTareas.tsx` con todo adentro pasaba el tope de 500 líneas del repo. Todas
// las medidas salen de «03 · Obra Tareas.dc.html».

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { C, MONO } from './canon/tokens'
import { Ico } from './canon/Ico'
import { hh as fmtHH } from './formato'

/** Un botón de ícono de la barra de acciones: 28×28, radio 6, sin borde. */
export function IconoBarra({ titulo, testid, d, onClick }: {
  titulo: string; testid: string; d: ReactNode; onClick: () => void
}) {
  const [on, setOn] = useState(false)
  return (
    <button type="button" title={titulo} aria-label={titulo} data-testid={testid} onClick={onClick}
      onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}
      style={{
        width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'pointer', border: 'none',
        background: on ? '#F2F1ED' : 'transparent', color: on ? C.tinta : C.tintaSuave,
      }}>
      <Ico d={d} s={15} />
    </button>
  )
}

/** Una celda de la franja: rótulo 10,5px, número mono 20px/600, contexto al lado. */
export function Kpi({ t: rotulo, v, s, color = C.tinta }: {
  t: string; v: string | null; s: string; color?: string
}) {
  return (
    <div style={{ flex: 1, minWidth: '150px', padding: '11px 16px', borderRight: `1px solid ${C.bordeTarjeta}` }}>
      <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.04em' }}>{rotulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', marginTop: '2px', flexWrap: 'wrap' }}>
        {/* NULL NO ES CERO: «sin cargar» dicho con todas las letras, nunca un 0 que miente. */}
        {v === null
          ? <span style={{ fontSize: '12px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">sin cargar</span>
          : <span style={{ fontFamily: MONO, fontSize: '20px', fontWeight: 600, color, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{v}</span>}
        {s && <span style={{ fontSize: '11px', color: C.tenue, whiteSpace: 'nowrap' }}>{s}</span>}
      </div>
    </div>
  )
}

/** El desvío existe sólo si existen LOS DOS: contra un plan sin cargar, «+0» sería una mentira. */
export function KpiDesvio({ plan, real }: { plan: number | null; real: number | null }) {
  const d = plan != null && real != null ? real - plan : null
  return (
    <Kpi t="Desvío HH" s="vs plan" color={d != null && d > 0 ? C.warn : C.tinta}
      v={d == null ? null : `${d > 0 ? '+' : ''}${fmtHH(d)}`} />
  )
}

// ═══ LOS DOS DIVISORES ARRASTRABLES DEL MOCKUP ═══
//
// 5px entre la lista y el Gantt (banda plana que se pone amarilla al arrastrar) y 12px entre la
// tarjeta y el panel (con una manija de 3×34px adentro). Los topes son los del zip: la lista entre
// 300 y 900px, el panel entre 300 y 620px.

type Divisible = 'tabla' | 'panel'

export function useDivisores() {
  /** 500px es el `atBase` normal del mockup; 404px es el ancho que el mockup 04 le da al panel —el
   *  03 arranca en 376 y el 04 es la pantalla del panel, así que manda el 04. */
  const [anchoTabla, setAnchoTabla] = useState(500)
  const [anchoPanel, setAnchoPanel] = useState(404)
  const [arrastrando, setArrastrando] = useState<Divisible | null>(null)
  const inicio = useRef<{ k: Divisible; x: number; w: number } | null>(null)

  useEffect(() => {
    if (!arrastrando) return
    const mover = (e: MouseEvent) => {
      const d = inicio.current
      if (!d) return
      const dx = e.clientX - d.x
      if (d.k === 'tabla') setAnchoTabla(Math.max(300, Math.min(900, d.w + dx)))
      else setAnchoPanel(Math.max(300, Math.min(620, d.w - dx)))
    }
    const soltar = () => { inicio.current = null; setArrastrando(null) }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [arrastrando])

  const iniciar = (k: Divisible) => (e: React.MouseEvent) => {
    inicio.current = { k, x: e.clientX, w: k === 'tabla' ? anchoTabla : anchoPanel }
    setArrastrando(k)
  }
  return { anchoTabla, anchoPanel, arrastrando, iniciar }
}

export function Divisor({ ancho, activo, alArrastrar, titulo, manija = false }: {
  ancho: number; activo: boolean; alArrastrar: (e: React.MouseEvent) => void
  titulo: string; manija?: boolean
}) {
  return (
    <div onMouseDown={alArrastrar} title={titulo} role="separator" aria-orientation="vertical"
      data-testid={manija ? 'divisor-panel' : 'divisor-tabla'}
      style={{
        width: `${ancho}px`, flexShrink: 0, cursor: 'col-resize',
        display: manija ? 'flex' : undefined,
        alignItems: manija ? 'center' : undefined,
        justifyContent: manija ? 'center' : undefined,
        background: manija ? undefined : activo ? C.marca : C.tenueFondo,
        borderLeft: manija ? undefined : `1px solid ${C.borde}`,
        borderRight: manija ? undefined : `1px solid ${C.borde}`,
      }}>
      {manija && (
        <div style={{
          width: '3px', height: '34px', borderRadius: '2px',
          background: activo ? C.marca : C.bordeFuerte,
        }} />
      )}
    </div>
  )
}
