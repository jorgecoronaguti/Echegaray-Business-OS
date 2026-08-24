'use client'

// ═══ EL GANTT DE LA PANTALLA 03 — LA COLUMNA CENTRAL, NO UN CARRIL COMPRIMIDO ═══
//
// El canónico 03 pone el tiempo en el centro de la pantalla con ESCALA DE DÍAS: cabecera con el mes
// y los días 01…31, el día de hoy en amarillo, y una barra por fila alineada 1:1 con la tabla de la
// izquierda. Hasta el 24/08 esto era una columna de 280px metida DENTRO de la tabla: a 280px un mes
// entero medía 9px y la barra de una actividad de tres días era un punto — se veía que había algo,
// nunca CUÁNDO. Un día vale 24px o el Gantt no informa nada.
//
// Por eso el Gantt vive AFUERA de la tabla, como hermano en un flex: es el único modo de que tenga
// su propio scroll horizontal (una obra de un año mide 8.760px) sin arrastrar de costado la lista
// de actividades, que es la que ancla la lectura. El precio es que la alineación fila-a-fila deja
// de ser gratis: la paga `h-fila-compacta` (38px), el mismo token que usa `Tr compacta`, y por eso
// ninguna de las dos alturas puede escribirse a mano acá.
//
// La pista siempre es el PLAN y el relleno el avance medido. Sin fechas de plan no se dibuja barra
// y se escribe el motivo: el hueco es un dato —esa actividad no está planificada— y una barra
// inventada desde «hoy» lo taparía.

import type { ReactNode } from 'react'
import {
  DIA_PX, conectoresEnL, type BarraGantt, type EscalaGantt, type RelacionEnGantt, type TonoBarra,
} from '../services/gantt'

export { DIA_PX }
export type { BarraGantt, EscalaGantt, TonoBarra }

/** Los tonos del canónico: la pista es el plan, el relleno lo hecho. Verde 100 · azul en curso ·
 *  ámbar crítica o vencida · gris lo que todavía no arrancó. */
const TONO: Record<TonoBarra, { fill: string; pista: string; borde: string }> = {
  pos: { fill: '#067647', pista: '#E6F3EB', borde: '#CDE7D7' },
  curso: { fill: '#175CD3', pista: '#E4EEFC', borde: '#CFE0FA' },
  warn: { fill: '#B54708', pista: '#FBEFE1', borde: '#F0E1CD' },
  plan: { fill: '#D7D5CF', pista: '#F0EFEB', borde: '#E7E6E2' },
}

const DIA_MS = 86_400_000
/** El alto de fila del canónico. Es `h-fila-compacta` en CSS: los dos números tienen que ser el
 *  mismo o la tabla y el carril se despegan una fila cada veinte. */
const ALTO_FILA = 38

export interface FilaGantt {
  id: string
  barra: BarraGantt | null
  /** POR QUÉ no hay barra. Sin esto, la fila vacía parece un error de dibujo. */
  motivo: string | null
  abierta: boolean
  alAbrir: () => void
}

const utc = (ms: number) => new Date(ms)

/** Los meses del rango con su ancho en días: el rótulo «Agosto 2025» del canónico. */
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

/** La cabecera: banda del mes arriba, día abajo, HOY en amarillo. Ocupa exactamente `h-thead` para
 *  que arranque a la misma altura que el encabezado de la tabla de la izquierda. */
function Cabecera({ e }: { e: EscalaGantt }) {
  const dias = Array.from({ length: e.dias }, (_, i) => i)
  return (
    <div className="h-thead border-b border-[#EFEEEA] bg-surface-quiet">
      <div className="flex h-3">
        {mesesDe(e).map((m) => (
          <div key={m.key} style={{ width: m.dias * DIA_PX }}
            className="shrink-0 overflow-hidden whitespace-nowrap border-r border-line px-1 text-[9.5px] font-medium text-ink-soft">
            {m.label}
          </div>
        ))}
      </div>
      <div className="flex h-5 items-center">
        {dias.map((i) => {
          const ms = e.desde + i * DIA_MS
          const hoy = e.hoy === i
          return (
            <div key={i} style={{ width: DIA_PX }}
              className={`flex h-4 shrink-0 items-center justify-center font-mono text-[9.5px] tabular-nums ${
                hoy ? 'rounded-[4px] bg-marca font-semibold text-ink'
                  : esFinde(ms) ? 'text-faint' : 'text-muted'}`}>
              {String(utc(ms).getUTCDate()).padStart(2, '0')}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** La grilla del fondo en DOS gradientes en vez de N divs: una obra de un año son 365 columnas de
 *  día, y dibujarlas como nodos costaba más DOM que todas las filas juntas. El período semanal es
 *  regular (7 días), así que el sombreado de fin de semana se resuelve corriendo el gradiente
 *  tantos días como haya hasta el lunes. */
function fondoDeGrilla(e: EscalaGantt): { backgroundImage: string; backgroundPosition: string } {
  const semana = 7 * DIA_PX
  const lunes = (utc(e.desde).getUTCDay() + 6) % 7
  return {
    backgroundImage: [
      `repeating-linear-gradient(to right, transparent 0 ${5 * DIA_PX}px, #FAFAF8 ${5 * DIA_PX}px ${semana}px)`,
      `repeating-linear-gradient(to right, transparent 0 ${DIA_PX - 1}px, #F5F4F0 ${DIA_PX - 1}px ${DIA_PX}px)`,
    ].join(','),
    backgroundPosition: `${-lunes * DIA_PX}px 0, 0 0`,
  }
}

function Barra({ b }: { b: BarraGantt }) {
  const c = TONO[b.tono]
  const x = b.dia * DIA_PX
  const w = Math.max(DIA_PX * 0.5, b.dias * DIA_PX)
  if (b.resumen) {
    return (
      <span className="absolute top-1/2 -mt-[2.5px] block h-[5px] rounded-[2px] bg-[#B9B7B1]"
        style={{ left: x, width: w }} data-testid={`gantt-barra-${b.id}`} />
    )
  }
  return (
    <>
      <span data-testid={`gantt-barra-${b.id}`}
        className="absolute top-1/2 -mt-2 flex h-4 items-center overflow-hidden rounded-[4px] border"
        style={{ left: x, width: w, background: c.pista, borderColor: c.borde }}>
        <span className="h-full" style={{ width: `${b.avance}%`, background: c.fill }} />
      </span>
      {b.etiqueta && (
        <span className="absolute top-1/2 -mt-[7px] whitespace-nowrap font-mono text-[10.5px] font-semibold tabular-nums"
          style={{ left: x + w + 7, color: c.fill }}>{b.etiqueta}</span>
      )}
    </>
  )
}

/** ═══ LAS DEPENDENCIAS, EN L SOBRE LAS BARRAS (canónico 03) ═══
 *
 * UN SOLO SVG para las N flechas y no uno por fila: superpuesto al área de filas, sin capturar el
 * mouse (`pointer-events:none`) — las filas de abajo siguen abriendo el panel al clic.
 *
 * El TRAZO ES GRIS Y DE 1px A PROPÓSITO: la secuencia es contexto, no es el dato. Con el peso de
 * una barra, veinte flechas tapan la obra que vinieron a explicar.
 *
 * SIN RELACIONES NO SE DIBUJA NADA: ni el `<svg>` ni el `<defs>`. Un marcador de flecha definido y
 * nunca usado es un id global de más en cada pantalla que monte un Gantt. */
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
export function GanttTareas({ escala, filas, relaciones = [], encabezado }: {
  escala: EscalaGantt
  filas: readonly FilaGantt[]
  /** Las precedencias de la obra. Las que tengan una punta fuera de esta vista no se dibujan: media
   *  flecha apuntando al borde se lee como una dependencia hacia afuera de la obra. */
  relaciones?: readonly RelacionEnGantt[]
  /** Lo que va arriba de la primera fila si la tabla de al lado tiene algo antes del thead. */
  encabezado?: ReactNode
}) {
  const ancho = escala.dias * DIA_PX
  const hoyX = escala.hoy == null ? null : escala.hoy * DIA_PX + DIA_PX / 2
  return (
    <div className="relative min-w-0 flex-1 overflow-x-auto border-t border-l border-line"
      data-testid="gantt-tareas">
      {encabezado}
      {/* `min-w-full`: cuando la obra es más corta que el ancho disponible, la grilla y las filas
          igual llegan hasta el borde. Sin esto la mitad derecha quedaba en blanco y parecía que el
          Gantt se había cortado. Las barras se posicionan en px, así que no se estiran. */}
      <div style={{ width: ancho }} className="relative min-w-full">
        <Cabecera e={escala} />
        <div className="relative" style={{ height: filas.length * ALTO_FILA }}>
          <div className="absolute inset-0" style={fondoDeGrilla(escala)} aria-hidden />
          {hoyX != null && (
            <div className="absolute inset-y-0 z-10 w-[1.5px] bg-marca" style={{ left: hoyX }}
              data-testid="gantt-hoy" aria-hidden />
          )}
          {filas.map((f) => (
            <div key={f.id} onClick={f.alAbrir} data-testid={`gantt-fila-${f.id}`}
              className={`relative h-fila-compacta cursor-pointer border-b border-[#EFEEEA] ${
                f.abierta ? 'bg-surface-quiet' : 'hover:bg-surface-quiet'}`}>
              {f.barra ? <Barra b={f.barra} /> : f.motivo && (
                <span className="absolute left-2 top-1/2 -mt-[7px] whitespace-nowrap text-[10.5px] text-faint">
                  {f.motivo}
                </span>
              )}
            </div>
          ))}
          {/* ÚLTIMO Y NO PRIMERO: el orden del DOM es el que pone las flechas POR ENCIMA de las
              barras. Dibujadas antes, cada barra les pasaba por arriba y la L se cortaba. */}
          <Dependencias filas={filas} relaciones={relaciones} ancho={ancho} />
        </div>
      </div>
    </div>
  )
}
