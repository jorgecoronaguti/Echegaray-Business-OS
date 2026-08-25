'use client'

// ═══ EL GANTT DE LA PANTALLA 03 — PORTE LITERAL DE «03 · Obra Tareas.dc.html» ═══
//
// Las cuatro constantes del mockup son las de este archivo: `DAYW = 24`, `ROWH = 34`, cabecera de
// 44px partida en 20px de mes y 24px de días, y el hilo de HOY en `#FDC900` de 1,5px. Un día vale
// 24px o el Gantt deja de decir CUÁNDO, que es lo único que un Gantt sabe decir.
//
// El carril vive AFUERA de la tabla, como hermano en un flex: es el único modo de que tenga su
// propio scroll horizontal (una obra de un año mide 8.760px) sin arrastrar de costado la lista de
// actividades, que es la que ancla la lectura. El precio es que la alineación fila a fila deja de
// ser gratis: la pagan estos 34px, el MISMO número que usa la fila de la lista. Los dos no pueden
// escribirse a mano por separado — por eso `ALTO_FILA` se exporta y la lista lo importa.
//
// La pista siempre es el PLAN y el relleno el avance medido. Sin fechas de plan no se dibuja barra
// y se escribe el motivo: el hueco es un dato —esa actividad no está planificada— y una barra
// inventada desde «hoy» lo taparía.

import type { ReactNode } from 'react'
import {
  DIA_PX, conectoresEnL, type BarraGantt, type EscalaGantt, type RelacionEnGantt, type TonoBarra,
} from '../services/gantt'
import { C, MONO } from './canon/tokens'

export { DIA_PX }
export type { BarraGantt, EscalaGantt, TonoBarra }

/** Los tonos del canónico: la pista es el plan, el relleno lo hecho. Verde 100 · azul en curso ·
 *  ámbar crítica o vencida · gris lo que todavía no arrancó. Medidos en el mockup 03. */
const TONO: Record<TonoBarra, { fill: string; pista: string; borde: string }> = {
  pos: { fill: '#067647', pista: '#E6F3EB', borde: '#CDE7D7' },
  curso: { fill: '#175CD3', pista: '#E4EEFC', borde: '#CFE0FA' },
  warn: { fill: '#B54708', pista: '#FBEFE1', borde: '#F0E1CD' },
  plan: { fill: '#D7D5CF', pista: '#F0EFEB', borde: '#E7E6E2' },
}

const DIA_MS = 86_400_000
/** `ROWH` del mockup 03. La lista lo importa: dos alturas escritas a mano se despegan una fila
 *  cada veinte y el Gantt pasa a afirmar fechas que no son. */
export const ALTO_FILA = 34
/** La cabecera del mockup: 20px de banda de mes + 24px de banda de días. */
export const ALTO_CABECERA = 44

export interface FilaGantt {
  id: string
  barra: BarraGantt | null
  /** POR QUÉ no hay barra. Sin esto, la fila vacía parece un error de dibujo. */
  motivo: string | null
  abierta: boolean
  alAbrir: () => void
}

const utc = (ms: number) => new Date(ms)

/** Los meses del rango con su ancho en días: el rótulo «Agosto 2025» del mockup. */
function mesesDe(e: EscalaGantt): { key: number; label: string; dias: number }[] {
  const out: { key: number; label: string; dias: number }[] = []
  for (let i = 0; i < e.dias; i++) {
    const d = utc(e.desde + i * DIA_MS)
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth()
    const ultimo = out[out.length - 1]
    if (ultimo && ultimo.key === key) ultimo.dias += 1
    else {
      const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      out.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1).replace(' de ', ' '), dias: 1 })
    }
  }
  return out
}

function esFinde(ms: number): boolean {
  const d = utc(ms).getUTCDay()
  return d === 0 || d === 6
}

/** La cabecera: banda del mes arriba (20px, centrada, 11px/500), día abajo (24px, mono 9,5px),
 *  HOY en amarillo con `borderRadius:4px`. Mide 44px, igual que el encabezado de la lista. */
function Cabecera({ e }: { e: EscalaGantt }) {
  const dias = Array.from({ length: e.dias }, (_, i) => i)
  return (
    <div style={{ height: `${ALTO_CABECERA}px`, borderBottom: `1px solid ${C.borde}`, background: C.tenueFondo }}>
      <div style={{ display: 'flex', height: '20px' }}>
        {mesesDe(e).map((m) => (
          <div key={m.key} style={{
            width: m.dias * DIA_PX, flexShrink: 0, borderRight: `1px solid ${C.borde}`,
            fontSize: '11px', fontWeight: 500, color: C.tintaMedia, display: 'flex',
            alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap',
          }}>{m.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', height: '24px' }}>
        {dias.map((i) => {
          const ms = e.desde + i * DIA_MS
          const hoy = e.hoy === i
          return (
            <div key={i} style={{
              width: DIA_PX, flexShrink: 0, background: hoy ? C.marca : 'transparent',
              color: hoy ? C.tinta : esFinde(ms) ? C.apagado : C.tintaSuave,
              fontFamily: MONO, fontSize: '9.5px', fontWeight: hoy ? 600 : 400,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: hoy ? '4px' : 0,
            }}>
              {String(utc(ms).getUTCDate()).padStart(2, '0')}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** La grilla del fondo en DOS gradientes en vez de N divs: una obra de un año son 365 columnas de
 *  día, y dibujarlas como nodos costaba más DOM que todas las filas juntas. Los colores son los del
 *  mockup (`fondoCol` de fin de semana `#FAFAF8`, línea `#F1F0EC` / `#F5F4F0`). */
function fondoDeGrilla(e: EscalaGantt): { backgroundImage: string; backgroundPosition: string } {
  const semana = 7 * DIA_PX
  const lunes = (utc(e.desde).getUTCDay() + 6) % 7
  return {
    backgroundImage: [
      `repeating-linear-gradient(to right, transparent 0 ${5 * DIA_PX}px, ${C.tenueFondo} ${5 * DIA_PX}px ${semana}px)`,
      `repeating-linear-gradient(to right, transparent 0 ${DIA_PX - 1}px, ${C.bordeLista} ${DIA_PX - 1}px ${DIA_PX}px)`,
    ].join(','),
    backgroundPosition: `${-lunes * DIA_PX}px 0, 0 0`,
  }
}

/** La barra del mockup: `top:9px; height:16px; borderRadius:4px`, y el % en mono 10,5px/600 a 7px
 *  del extremo derecho. El contenedor es el corchete plano de 5px en `#B9B7B1`. */
function Barra({ b }: { b: BarraGantt }) {
  const c = TONO[b.tono]
  const x = b.dia * DIA_PX
  const w = Math.max(DIA_PX * 0.5, b.dias * DIA_PX)
  if (b.resumen) {
    return (
      <span data-testid={`gantt-barra-${b.id}`} style={{
        position: 'absolute', top: '15px', left: x, width: w, height: '5px',
        background: C.apagado, borderRadius: '2px',
      }} />
    )
  }
  return (
    <>
      <span data-testid={`gantt-barra-${b.id}`} style={{
        position: 'absolute', top: '9px', left: x, width: w, height: '16px', borderRadius: '4px',
        background: c.pista, border: `1px solid ${c.borde}`, overflow: 'hidden',
        display: 'flex', alignItems: 'center',
      }}>
        <span style={{ height: '100%', width: `${b.avance}%`, background: c.fill }} />
      </span>
      {b.etiqueta && (
        <span style={{
          position: 'absolute', top: '11px', left: x + w + 7, fontFamily: MONO, fontSize: '10.5px',
          fontWeight: 600, color: c.fill, whiteSpace: 'nowrap',
        }}>{b.etiqueta}</span>
      )}
    </>
  )
}

/** ═══ LAS DEPENDENCIAS, EN L SOBRE LAS BARRAS (canónico 03) ═══
 *
 * UN SOLO SVG para las N flechas y no uno por fila: superpuesto al área de filas, sin capturar el
 * mouse (`pointer-events:none`) — las filas de abajo siguen abriendo el panel al clic.
 *
 * El TRAZO ES GRIS Y DE 1,1px A PROPÓSITO (`stroke:#A8A6A0` del mockup): la secuencia es contexto,
 * no es el dato. Con el peso de una barra, veinte flechas tapan la obra que vinieron a explicar.
 *
 * SIN RELACIONES NO SE DIBUJA NADA: ni el `<svg>` ni el `<defs>`. */
function Dependencias({ filas, relaciones, ancho }: {
  filas: readonly FilaGantt[]
  relaciones: readonly RelacionEnGantt[]
  ancho: number
}) {
  const { conectores } = conectoresEnL(
    filas.map((f) => ({ id: f.id, barra: f.barra })), relaciones, { altoFila: ALTO_FILA },
  )
  if (conectores.length === 0) return null
  return (
    <svg width={ancho} height={filas.length * ALTO_FILA} data-testid="gantt-dependencias"
      className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-hidden>
      <defs>
        <marker id="gantt-flecha" viewBox="0 0 8 8" refX="6" refY="4"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 1l6 3-6 3z" fill="#A8A6A0" />
        </marker>
      </defs>
      {conectores.map((c) => (
        <path key={c.clave} d={c.d} fill="none" stroke="#A8A6A0" strokeWidth={1.1}
          markerEnd="url(#gantt-flecha)" data-testid={`gantt-dep-${c.clave}`} />
      ))}
    </svg>
  )
}

/**
 * El Gantt entero. Recibe filas ya resueltas —el cálculo de qué barra le toca a cada actividad vive
 * en `services/gantt.ts`, probado sin navegador— y sólo las dibuja.
 */
export function GanttTareas({ escala, filas, relaciones = [], verDeps = true, encabezado }: {
  escala: EscalaGantt
  filas: readonly FilaGantt[]
  /** Las precedencias de la obra. Las que tengan una punta fuera de esta vista no se dibujan: media
   *  flecha apuntando al borde se lee como una dependencia hacia afuera de la obra. */
  relaciones?: readonly RelacionEnGantt[]
  /** El conmutador de la barra del mockup 03: apagar las flechas sin perder las barras. */
  verDeps?: boolean
  /** Lo que va arriba de la primera fila si la tabla de al lado tiene algo antes del thead. */
  encabezado?: ReactNode
}) {
  const ancho = escala.dias * DIA_PX
  const hoyX = escala.hoy == null ? null : escala.hoy * DIA_PX + DIA_PX / 2
  return (
    <div data-testid="gantt-tareas"
      style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
      {encabezado}
      {/* `minWidth:100%`: cuando la obra es más corta que el ancho disponible, la grilla y las filas
          igual llegan hasta el borde. Sin esto la mitad derecha quedaba en blanco y parecía que el
          Gantt se había cortado. Las barras se posicionan en px, así que no se estiran. */}
      <div style={{ width: ancho, minWidth: '100%', position: 'relative' }}>
        <Cabecera e={escala} />
        <div style={{ position: 'relative', height: filas.length * ALTO_FILA }}>
          <div style={{ position: 'absolute', inset: 0, ...fondoDeGrilla(escala) }} aria-hidden />
          {hoyX != null && (
            <div data-testid="gantt-hoy" aria-hidden style={{
              position: 'absolute', top: 0, bottom: 0, left: hoyX, width: '1.5px',
              background: C.marca, zIndex: 10,
            }} />
          )}
          {filas.map((f) => (
            <div key={f.id} onClick={f.alAbrir} data-testid={`gantt-fila-${f.id}`}
              style={{
                position: 'relative', height: `${ALTO_FILA}px`,
                borderBottom: `1px solid ${C.bordeFila}`, cursor: 'pointer',
                background: f.abierta ? C.marcaSuave : 'transparent',
              }}>
              {f.barra ? <Barra b={f.barra} /> : f.motivo && (
                <span style={{
                  position: 'absolute', left: '8px', top: '10px', whiteSpace: 'nowrap',
                  fontSize: '10.5px', color: C.tenue,
                }}>{f.motivo}</span>
              )}
            </div>
          ))}
          {/* ÚLTIMO Y NO PRIMERO: el orden del DOM es el que pone las flechas POR ENCIMA de las
              barras. Dibujadas antes, cada barra les pasaba por arriba y la L se cortaba. */}
          {verDeps && <Dependencias filas={filas} relaciones={relaciones} ancho={ancho} />}
        </div>
      </div>
    </div>
  )
}
