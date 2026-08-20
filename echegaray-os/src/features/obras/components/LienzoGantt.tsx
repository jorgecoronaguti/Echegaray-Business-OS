'use client'

// EL LIENZO DEL GANTT — la mitad derecha del workspace: cabecera de calendario y barras.
//
// ═══ POR QUÉ NO ES UN SVG ═══
//
// Lo era. El problema no es el SVG: es que la tabla de la izquierda se dibuja en FLUJO y el lienzo
// POSICIONA, y con dos modelos de caja distintos la alineación 1:1 se sostiene por casualidad. Acá
// las dos mitades leen la misma `disposicionDeFilas` y las dos usan cajas de borde incluido, así
// que la fila `i` de la tabla y la barra `i` del calendario caen en el mismo píxel por
// construcción, no por ajuste.
//
// ═══ SÓLO SE DIBUJA LO QUE EXISTE ═══
//
// `design/screens/planificacion-gantt.md`: barra de plan, relleno de avance, baseline, HOY, hitos,
// dependencias e impedimentos — **si existen**. Una baseline dibujada donde nadie selló diría que
// el desvío es cero; una barra sin fechas diría que la actividad está planificada. Sin fechas no
// hay barra: se escribe el motivo, que es lo único cierto.

import { Fragment } from 'react'
import type { Dependencia } from '../types'
import type { Disposicion, Fila } from '../services/cronograma'
import type { construirEscala } from '../services/escala'

type Escala = ReturnType<typeof construirEscala>

const TRACK = '#EAE7E6'
const BASE = '#D7D5CF'
const DEP = '#DAD6D5'
const ALTO_BARRA = 12

export interface DatosLienzo {
  filas: readonly Fila[]
  disp: Disposicion
  escala: Escala
  /** Los días de la ventana, ya resueltos a ISO por el Gantt: acá no se hace aritmética de fechas. */
  finesDeSemana: number[]
  hoyIso: string
  seleccionada: string | null
  alSeleccionar: (id: string) => void
  dependencias: readonly Dependencia[]
  conImpedimento: ReadonlySet<string>
}

/** La cabecera: mes, día y el carril de hitos. 72px, los mismos que el encabezado de la tabla. */
export function CabeceraGantt({ escala, hoyIso, hitos }: {
  escala: Escala
  hoyIso: string
  hitos: { fecha: string; nombre: string }[]
}) {
  const { x, px, ancho, meses, ticks, porDia } = escala
  const xHoy = x(hoyIso)
  const hoyVisible = xHoy >= 0 && xHoy <= ancho
  return (
    <div className="relative h-[72px] shrink-0 border-b border-line" style={{ width: ancho }}>
      {meses.map((m) => (
        <div
          key={m.label + m.x0}
          className="absolute top-[10px] flex h-4 items-center text-[10.5px] font-semibold capitalize tracking-[0.04em] text-muted"
          style={{ left: m.x0 + 2 }}
        >{m.label}</div>
      ))}
      {ticks.map((t) => (
        <div
          key={'d' + t.x}
          className={`absolute top-[30px] flex h-5 items-center justify-center font-mono text-[10px] tabular-nums ${
            t.finde ? 'text-line-strong' : 'text-muted'
          }`}
          style={{ left: t.x, width: porDia ? px : undefined }}
        >{t.label}</div>
      ))}
      {hitos.map((h) => (
        <div
          key={h.fecha + h.nombre}
          className="absolute top-[52px] flex h-4 items-center gap-1.5"
          style={{ left: Math.max(0, x(h.fecha) - 3) }}
          data-testid="hito-gantt"
        >
          <span className="h-[7px] w-[7px] shrink-0 rotate-45 bg-ink" />
          <span className="whitespace-nowrap text-[10px] font-semibold text-ink-soft">{h.nombre}</span>
        </div>
      ))}
      {hoyVisible && (
        <div
          className="absolute top-[52px] flex h-4 items-center rounded-[2px] bg-marca px-[5px] text-[10px] font-semibold tracking-[0.06em] text-ink"
          style={{ left: Math.max(0, xHoy - 8) }}
          data-testid="bandera-hoy"
        >HOY</div>
      )}
    </div>
  )
}

/** Una fila del calendario: la barra de su actividad, o el motivo por el que no hay barra. */
function FilaLienzo({ f, i, d }: { f: Fila; i: number; d: DatosLienzo }) {
  const { disp, escala, seleccionada, alSeleccionar, conImpedimento } = d
  const top = disp.tops[i] ?? 0
  const centro = top + disp.alto / 2
  const comun = 'absolute left-0 right-0'
  if (f.tipo === 'grupo') {
    const g = f.grupo
    if (!g.inicio) return null
    const x0 = escala.x(g.inicio)
    const w = Math.max(6, escala.x(g.fin ?? g.inicio) + escala.px - x0)
    // El rubro no es trabajo: es el paraguas de sus hijas. Por eso una regla fina y no una barra.
    return <div className="absolute h-[2px] bg-line" style={{ left: x0, width: w, top: centro - 1 }} />
  }
  const a = f.actividad
  const sel = seleccionada === a.id
  const fondo = sel ? 'bg-marca/[0.07]' : ''
  if (!a.inicio_plan) {
    return (
      <div
        className={`${comun} flex cursor-pointer items-center ${fondo}`}
        style={{ top, height: disp.alto }}
        onClick={() => alSeleccionar(a.id)}
      >
        <span className="pl-3 text-[11px] text-faint" data-testid="sin-barra">sin fechas de plan</span>
      </div>
    )
  }
  const x0 = escala.x(a.inicio_plan)
  const x1 = escala.x(a.fin_plan ?? a.inicio_plan) + escala.px
  const w = Math.max(ALTO_BARRA, x1 - x0)
  const pct = a.avance_pct == null ? null : Math.max(0, Math.min(100, Number(a.avance_pct)))
  return (
    <div
      className={`${comun} cursor-pointer ${fondo}`}
      style={{ top, height: disp.alto }}
      onClick={() => alSeleccionar(a.id)}
      data-testid="fila-gantt"
      data-actividad={a.id}
    >
      {a.tipo === 'hito' ? (
        <span className="absolute h-[9px] w-[9px] rotate-45 bg-ink" style={{ left: x0 - 4, top: disp.alto / 2 - 4 }} />
      ) : (
        <>
          <div
            className="absolute overflow-hidden rounded-[2px]"
            style={{ left: x0, width: w, top: disp.alto / 2 - ALTO_BARRA / 2, height: ALTO_BARRA, background: TRACK }}
          >
            {pct !== null && pct > 0 && (
              <div className={`h-full ${pct >= 100 ? 'bg-pos' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
            )}
          </div>
          {/* LA LÍNEA BASE, SÓLO SI ESTÁ SELLADA. Punteada y debajo de la barra: es contra qué se
              mide el desvío, y dibujarla donde no existe diría que el desvío es cero. */}
          {a.inicio_base && a.fin_base && (
            // EL PUNTEADO ES UN BORDE, NO UN GRADIENTE. Con `repeating-linear-gradient` el
            // resultado se ve igual, pero el handoff prohíbe los gradientes sin excepciones y la
            // regla ejecutable los busca por `background-image` — sin distinguir el que decora del
            // que dibuja una línea de puntos. Una excepción "pero éste es distinto" es exactamente
            // como una regla absoluta deja de serlo.
            <div
              className="absolute border-t-2 border-dotted"
              style={{
                left: escala.x(a.inicio_base),
                width: Math.max(4, escala.x(a.fin_base) + escala.px - escala.x(a.inicio_base)),
                top: disp.alto / 2 + ALTO_BARRA / 2 + 2,
                borderColor: BASE,
              }}
              data-testid="baseline-gantt"
            />
          )}
          {conImpedimento.has(a.id) && (
            <span
              className="absolute h-0 w-0 border-x-4 border-b-[7px] border-x-transparent border-b-neg"
              style={{ left: x0 + w - 14, top: disp.alto / 2 - ALTO_BARRA / 2 - 9 }}
              data-testid="impedimento-gantt"
            />
          )}
          <span
            className={`absolute font-mono text-[10px] tabular-nums ${pct === null ? 'text-line-strong' : 'text-muted'}`}
            style={{ left: x0 + w + 8, top: disp.alto / 2 - 6, lineHeight: '12px' }}
          >{pct === null ? '—' : `${Math.round(pct)}%`}</span>
        </>
      )}
    </div>
  )
}

/** Las precedencias en L, con su flecha. Sin fechas en alguna de las dos puntas no se dibuja. */
function Precedencias({ d }: { d: DatosLienzo }) {
  const y = new Map<string, number>()
  d.filas.forEach((f, i) => {
    if (f.tipo === 'actividad') y.set(f.actividad.id, (d.disp.tops[i] ?? 0) + d.disp.alto / 2)
  })
  const porId = new Map(d.filas.flatMap((f) => (f.tipo === 'actividad' ? [[f.actividad.id, f.actividad]] : [])))
  return (
    <>
      {d.dependencias.map((dep) => {
        const o = porId.get(dep.origen_id); const t = porId.get(dep.destino_id)
        const y1 = y.get(dep.origen_id); const y2 = y.get(dep.destino_id)
        const finO = o?.fin_plan ?? o?.inicio_plan
        if (!o || !t || y1 == null || y2 == null || !finO || !t.inicio_plan) return null
        const x1 = d.escala.x(finO) + d.escala.px
        const x2 = d.escala.x(t.inicio_plan)
        const codo = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 8))
        return (
          <Fragment key={dep.id}>
            <div className="absolute h-px" style={{ left: x1, width: Math.max(0, codo - x1), top: y1, background: DEP }} />
            <div className="absolute w-px" style={{ left: codo, top: Math.min(y1, y2), height: Math.abs(y2 - y1), background: DEP }} />
            <div className="absolute h-px" style={{ left: codo, width: Math.max(0, x2 - codo), top: y2, background: DEP }} />
            <div
              className="absolute h-0 w-0 border-y-[3px] border-l-4 border-y-transparent"
              style={{ left: x2 - 4, top: y2 - 3, borderLeftColor: DEP }}
            />
          </Fragment>
        )
      })}
    </>
  )
}

/** El cuerpo: bandas de fin de semana, filas, precedencias y la línea de HOY. */
export function CuerpoGantt({ d }: { d: DatosLienzo }) {
  const { escala, disp, hoyIso } = d
  const xHoy = escala.x(hoyIso)
  const hoyVisible = xHoy >= 0 && xHoy <= escala.ancho
  return (
    <div className="relative" style={{ width: escala.ancho, height: disp.total + 24 }} data-testid="lienzo-gantt">
      {d.finesDeSemana.map((x) => (
        <div key={'fs' + x} className="absolute bottom-0 top-0 bg-surface-quiet" style={{ left: x, width: escala.px * 2 }} />
      ))}
      {d.filas.map((f, i) => <FilaLienzo key={f.clave} f={f} i={i} d={d} />)}
      <Precedencias d={d} />
      {hoyVisible && (
        <div
          className="absolute bottom-0 top-0 bg-marca"
          style={{ left: xHoy, width: 1.5 }}
          data-testid="linea-hoy"
        />
      )}
    </div>
  )
}
