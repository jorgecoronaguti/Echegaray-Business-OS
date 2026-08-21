'use client'

// EL GANTT DE LA OBRA — panel fijo a la izquierda, barras a la derecha, y el arrastre que avisa.
//
// ═══ LO ÚNICO QUE CORRE EN EL NAVEGADOR ES EL GESTO ═══
//
// Arrastrar una barra no mueve nada y no calcula nada: mide cuántos días se corrió el puntero y
// navega a `?sel=<id>&mover=<días>`. La consecuencia —qué arrastra, cuánto corre el fin de obra,
// qué cuadrilla queda en conflicto— la calcula el servidor con el motor de camino crítico y vuelve
// en el popover. Si esa cuenta se hiciera acá habría dos cronogramas: el que el navegador dibuja
// mientras se arrastra y el que la base sabe. El primero siempre gana la discusión y siempre está
// mal.
//
// ═══ CUÁNTO ES UN DÍA EN PÍXELES ═══
//
// El lienzo es porcentual —`escalaCronograma.ts` posiciona todo en %— así que el ancho de un día
// depende del ancho real del contenedor, que sólo se conoce en el navegador. Se mide del elemento,
// no se asume: con una ventana angosta, asumir 1000px convertiría un arrastre de un día en cuatro.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { EscalaCronograma } from '../services/escalaCronograma'
import { tramoDe } from '../services/escalaCronograma'
import type { EstadoUrl, FilaVista } from '../services/vistaCronograma'
import { hrefCronograma } from '../services/vistaCronograma'

/** 34px por fila: es el alto del contrato visual, y el panel izquierdo usa EXACTAMENTE el mismo
 *  número. Si se separan, la barra deja de estar en la fila de su actividad y el Gantt miente sin
 *  dar ningún error. */
const ALTO_FILA = 34
const ALTO_HEAD = 34

const fmt = (iso: string | null) =>
  (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

/** UNA CABECERA DE FRENTE NUNCA ESTÁ SELECCIONADA. Su `actividadId` es null y la comparación
 *  `seleccionada === f.actividadId` daba verdadero con nada seleccionado —null === null—: las diez
 *  cabeceras aparecían resaltadas en amarillo como si el usuario las hubiera tocado todas. */
const estaSeleccionada = (f: FilaVista, sel: string | null) => f.actividadId != null && f.actividadId === sel

/** El color de la barra ejecutada. Verde sólo cuando terminó de verdad; naranja cuando está en el
 *  camino crítico; grafito el resto. El amarillo de la marca no pinta estado nunca. */
function colorEjecutado(f: FilaVista): string {
  if (f.avancePct != null && f.avancePct >= 100) return 'bg-pos'
  return f.critica ? 'bg-warn' : 'bg-accent'
}

export interface Props {
  filas: FilaVista[]
  escala: EscalaCronograma
  /** Días corridos de la ventana. Convierte el arrastre en píxeles a días. */
  diasVentana: number
  obraId: string
  /** El estado de la URL, PLANO. Una función no cruza la frontera servidor→cliente: la primera
   *  versión pasaba el constructor de links como prop y la pantalla entera moría en «A server
   *  error occurred», sin un solo link roto a la vista. */
  estadoUrl: EstadoUrl
}

export function LienzoCronogramaObra({ filas, escala, diasVentana, obraId, estadoUrl }: Props) {
  const seleccionada = estadoUrl.sel
  const hrefDe = (c: { sel?: string | null; mover?: number | null }) => hrefCronograma(obraId, estadoUrl, c)
  const router = useRouter()
  const lienzo = useRef<HTMLDivElement>(null)
  const [arrastre, setArrastre] = useState<{ id: string; dias: number } | null>(null)

  const diasDelGesto = (dx: number): number => {
    const ancho = lienzo.current?.clientWidth ?? 0
    if (!ancho) return 0
    return Math.round((dx / ancho) * diasVentana)
  }

  const alSoltar = (id: string, dx: number) => {
    const dias = diasDelGesto(dx)
    setArrastre(null)
    if (dias === 0) {
      router.push(hrefDe({ sel: id, mover: null }))
      return
    }
    router.push(hrefDe({ sel: id, mover: dias }))
  }

  const iniciarArrastre = (e: React.PointerEvent, id: string) => {
    const x0 = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
    const mover = (ev: PointerEvent) => setArrastre({ id, dias: diasDelGesto(ev.clientX - x0) })
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      alSoltar(id, ev.clientX - x0)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  return (
    <div className="flex overflow-x-auto rounded-card border border-line bg-surface" data-testid="cronograma">
      <PanelIzquierdo filas={filas} seleccionada={seleccionada} hrefDe={hrefDe} />
      <div className="min-w-[560px] flex-1 border-l border-line" ref={lienzo}>
        <Encabezado escala={escala} />
        <div className="relative">
          {escala.hoyPosPct != null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-[1.5px] bg-marca"
              style={{ left: `${escala.hoyPosPct}%` }}
            />
          )}
          {filas.map((f) => (
            <Renglon
              key={f.clave} fila={f} escala={escala} diasVentana={diasVentana}
              seleccionada={estaSeleccionada(f, seleccionada)}
              arrastreDias={arrastre?.id === f.actividadId ? arrastre.dias : null}
              alArrastrar={iniciarArrastre}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Encabezado({ escala }: { escala: EscalaCronograma }) {
  return (
    <div className="relative border-b border-line" style={{ height: ALTO_HEAD }}>
      {escala.columnas.filter((c) => c.nueva).map((c) => (
        <span
          key={`${c.etiqueta}-${c.posPct}`}
          className="absolute top-1/2 -translate-y-1/2 text-[9.5px] tracking-[0.04em] text-faint tnum"
          style={{ left: `${c.posPct}%`, paddingLeft: 4 }}
        >
          {c.etiqueta}
        </span>
      ))}
    </div>
  )
}

function PanelIzquierdo({ filas, seleccionada, hrefDe }: {
  filas: FilaVista[]
  seleccionada: string | null
  hrefDe: (c: { sel?: string | null; mover?: number | null }) => string
}) {
  return (
    <div className="w-[300px] shrink-0 lg:w-[360px]">
      <div
        className="grid items-center gap-2 border-b border-line px-3 text-[10px] uppercase tracking-[0.05em] text-faint"
        style={{ height: ALTO_HEAD, gridTemplateColumns: '1fr 62px 54px' }}
      >
        <span>Estructura</span>
        <span className="text-right">Días</span>
        <span className="text-right">%</span>
      </div>
      {filas.map((f) => (
        <Link
          key={f.clave}
          href={f.actividadId ? hrefDe({ sel: f.actividadId, mover: null }) : hrefDe({ sel: null, mover: null })}
          scroll={false}
          data-sel={estaSeleccionada(f, seleccionada) ? '1' : undefined}
          className={`grid items-center gap-2 px-3 hover:bg-surface-quiet ${
            estaSeleccionada(f, seleccionada) ? 'bg-marca-soft shadow-[inset_3px_0_0_var(--os-marca)]' : ''
          }`}
          style={{ height: ALTO_FILA, gridTemplateColumns: '1fr 62px 54px' }}
        >
          <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: f.nivel * 15 }}>
            <span className={`truncate ${f.nivel === 0 ? 'text-[12.5px] font-semibold text-ink' : 'text-[12.5px] text-ink-soft'}`}>
              {f.nombre}
            </span>
            {f.critica && (
              <span className="shrink-0 rounded-[3px] border border-warn px-1 text-[9.5px] leading-[14px] text-warn">
                crítica
              </span>
            )}
            {f.tieneImpedimento && <span className="shrink-0 text-[11px] text-neg" title="impedimento abierto">△</span>}
          </span>
          <span className="text-right text-[11px] text-ink-soft tnum">
            {f.duracion ?? <span className="text-faint">—</span>}
          </span>
          <span className={`text-right text-[11px] tnum ${f.avancePct == null ? 'text-faint' : 'text-ink-soft'}`}>
            {f.avancePct == null ? 'sin plan' : `${f.avancePct} %`}
          </span>
        </Link>
      ))}
    </div>
  )
}

interface RenglonProps {
  fila: FilaVista
  escala: EscalaCronograma
  diasVentana: number
  seleccionada: boolean
  arrastreDias: number | null
  alArrastrar: (e: React.PointerEvent, id: string) => void
}

function Renglon({ fila, escala, diasVentana, seleccionada, arrastreDias, alArrastrar }: RenglonProps) {
  const tramo = tramoDe(escala, fila.inicio, fila.fin)
  // El fantasma del arrastre se corre en % del lienzo, no en píxeles: el lienzo es porcentual y un
  // desplazamiento en px se despegaría de la barra en cuanto la ventana cambie de ancho.
  const desplPct = arrastreDias ? (arrastreDias / Math.max(1, diasVentana)) * 100 : 0
  const proyeccion = fila.fin && fila.finPlan && fila.fin > fila.finPlan
    ? tramoDe(escala, fila.finPlan, fila.fin)
    : null

  return (
    <div
      className={`relative border-b border-surface-sunken ${seleccionada ? 'bg-marca-soft' : 'hover:bg-surface-quiet'}`}
      style={{ height: ALTO_FILA }}
      data-fila={fila.clave}
    >
      {!tramo && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-warn">
          sin fechas · falta análisis
        </span>
      )}
      {proyeccion && (
        <div
          aria-hidden
          className="absolute top-1/2 h-[10px] -translate-y-1/2 rounded-[2px] bg-marca-track"
          style={{ left: `${proyeccion.izqPct}%`, width: `${proyeccion.anchoPct}%` }}
        />
      )}
      {tramo && (
        <div
          className="absolute top-1/2 h-[10px] -translate-y-1/2 rounded-[2px] bg-surface-sunken"
          style={{ left: `${tramo.izqPct + desplPct}%`, width: `${tramo.anchoPct}%` }}
          onPointerDown={fila.actividadId ? (e) => alArrastrar(e, fila.actividadId!) : undefined}
          role={fila.actividadId ? 'button' : undefined}
          tabIndex={fila.actividadId ? 0 : undefined}
          aria-label={fila.actividadId
            ? `${fila.nombre}, del ${fmt(fila.inicio)} al ${fmt(fila.fin)}. Arrastrar para simular un corrimiento.`
            : undefined}
        >
          {fila.avancePct != null && fila.avancePct > 0 && (
            <div
              className={`h-full rounded-[2px] ${colorEjecutado(fila)}`}
              style={{ width: `${Math.min(100, fila.avancePct)}%` }}
            />
          )}
          {fila.esHito && (
            <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-ink" aria-hidden />
          )}
          {fila.tieneImpedimento && (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none text-neg" aria-hidden>△</span>
          )}
        </div>
      )}
      {arrastreDias != null && arrastreDias !== 0 && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] font-semibold text-warn tnum">
          {arrastreDias > 0 ? `+${arrastreDias}` : arrastreDias} d
        </span>
      )}
    </div>
  )
}
