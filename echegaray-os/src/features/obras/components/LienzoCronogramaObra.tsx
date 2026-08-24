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
//
// ═══ TRES CAPAS SUPERPUESTAS, Y CADA UNA DICE OTRA COSA (Design 23/08 · 07) ═══
//
// BASE lo que se prometió al sellar (hairline gris arriba) · REAL/PLAN la barra con su relleno de
// avance · PROYECCIÓN el tramo punteado que el plan todavía no reconoce. Superponerlas es el punto
// entero de la pantalla: el desvío es la DIFERENCIA entre capas, y en tres pantallas separadas hay
// que recordarlo de memoria. La base no se dibuja cuando no fue sellada — un hueco es el dato.
//
// El plegado de un frente es estado del navegador: cerrar un rubro no cambia el plan y no tiene por
// qué costar una vuelta al servidor.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { IconoDependencia, IconoDesplegar, IconoProblema } from '@/shared/components/iconos'
import type { EscalaCronograma } from '../services/escalaCronograma'
import { tramoDe } from '../services/escalaCronograma'
import { conectoresDe, type Conector, type DependenciaConector } from '../services/conectoresGantt'
import type { EstadoUrl, FilaVista } from '../services/vistaCronograma'
import { hrefCronograma } from '../services/vistaCronograma'

/** El alto de la fila del Gantt es un TOKEN del sistema (`--os-row-h-compacta`), no un número de
 *  esta pantalla: la tabla de la izquierda se alinea 1:1 con las barras de la derecha, y el día que
 *  los dos números se separen la barra deja de estar en la fila de su actividad sin dar un error. */
const ALTO_FILA = 38
const ALTO_HEAD = 46

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

/** El desvío contra la base, en palabras. `null` NO es «en fecha»: es que nadie selló una base
 *  contra la cual estar en fecha, y decirlo «en fecha» convertiría una obra sin línea base en una
 *  obra perfectamente cumplida. */
function textoDesvio(d: number | null): { texto: string; clase: string } {
  if (d == null) return { texto: 'sin base', clase: 'text-faint' }
  if (d === 0) return { texto: 'en fecha', clase: 'text-pos' }
  if (d < 0) return { texto: `${d} d`, clase: 'text-pos' }
  return { texto: `+${d} d`, clase: d > 5 ? 'text-neg' : 'text-warn' }
}

/** Qué filas se ven con estos frentes cerrados. Una cabecera plegada se lleva sus hijas hasta la
 *  próxima cabecera: las filas vienen planas y el nivel es la única jerarquía que tienen. */
function visibles(filas: FilaVista[], cerrados: ReadonlySet<string>): FilaVista[] {
  const salida: FilaVista[] = []
  let ocultando = false
  for (const f of filas) {
    if (f.nivel === 0) {
      ocultando = cerrados.has(f.clave)
      salida.push(f)
      continue
    }
    if (!ocultando) salida.push(f)
  }
  return salida
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
  /** Las precedencias declaradas. Se dibujan en L sobre el lienzo: una dependencia que sólo vive en
   *  una lista obliga a reconstruir de memoria qué arrastra qué. */
  dependencias?: DependenciaConector[]
}

export function LienzoCronogramaObra({
  filas, escala, diasVentana, obraId, estadoUrl, dependencias = [],
}: Props) {
  const seleccionada = estadoUrl.sel
  const hrefDe = (c: { sel?: string | null; mover?: number | null }) => hrefCronograma(obraId, estadoUrl, c)
  const router = useRouter()
  const lienzo = useRef<HTMLDivElement>(null)
  const [arrastre, setArrastre] = useState<{ id: string; dias: number } | null>(null)
  const [cerrados, setCerrados] = useState<ReadonlySet<string>>(new Set())

  const filasVisibles = useMemo(() => visibles(filas, cerrados), [filas, cerrados])
  const { conectores, omitidas } = useMemo(
    () => conectoresDe(
      filasVisibles.map((f) => ({ actividadId: f.actividadId, tramo: tramoDe(escala, f.inicio, f.fin) })),
      dependencias,
      { altoFila: ALTO_FILA },
    ),
    [filasVisibles, dependencias, escala],
  )

  const plegar = (clave: string) => setCerrados((p) => {
    const s = new Set(p)
    if (s.has(clave)) s.delete(clave); else s.add(clave)
    return s
  })

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
    <div className="flex flex-col">
      <div className="flex overflow-x-auto rounded-card border border-line bg-surface" data-testid="cronograma">
        <PanelIzquierdo
          filas={filasVisibles} seleccionada={seleccionada} hrefDe={hrefDe}
          cerrados={cerrados} plegar={plegar}
        />
        <div className="min-w-[560px] flex-1 border-l border-line" ref={lienzo}>
          <Encabezado escala={escala} />
          <div className="relative">
            <Guias escala={escala} />
            {escala.hoyPosPct != null && (
              <div
                aria-hidden data-testid="linea-hoy"
                className="pointer-events-none absolute inset-y-0 z-[2] w-[1.5px] bg-marca"
                style={{ left: `${escala.hoyPosPct}%` }}
              />
            )}
            <Conectores conectores={conectores} />
            {filasVisibles.map((f) => (
              <Renglon
                key={f.clave} fila={f} escala={escala} diasVentana={diasVentana}
                verBase={estadoUrl.base}
                seleccionada={estaSeleccionada(f, seleccionada)}
                arrastreDias={arrastre?.id === f.actividadId ? arrastre.dias : null}
                alArrastrar={iniciarArrastre}
              />
            ))}
          </div>
        </div>
      </div>
      {/* Un Gantt con menos flechas de las que la obra tiene se lee como una obra con menos
          secuencia: cuando una precedencia no se puede dibujar, se cuenta. */}
      {omitidas > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint" data-testid="deps-omitidas">
          <IconoDependencia className="h-3.5 w-3.5" />
          {omitidas === 1
            ? '1 precedencia no se dibuja: una de sus puntas no está en esta vista o no tiene fechas.'
            : `${omitidas} precedencias no se dibujan: una de sus puntas no está en esta vista o no tiene fechas.`}
        </p>
      )}
    </div>
  )
}

/** Las divisiones de la escala, apenas visibles. Son referencia para leer una barra contra el
 *  calendario, no contenido: si se notan, compiten con las barras. */
function Guias({ escala }: { escala: EscalaCronograma }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {escala.columnas.map((c) => (
        <span
          key={`guia-${c.posPct}`}
          className="absolute inset-y-0 w-px bg-[color:var(--os-surface-quiet)]"
          style={{ left: `${c.posPct}%` }}
        />
      ))}
    </div>
  )
}

function Conectores({ conectores }: { conectores: Conector[] }) {
  if (!conectores.length) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]" data-testid="conectores">
      {conectores.map((c) => (
        <span key={c.clave}>
          {c.segmentos.map((s, i) => (
            <span
              key={i}
              className={`absolute ${c.invertido ? 'bg-neg' : 'bg-line-strong'}`}
              style={{
                left: `${s.izqPct}%`,
                width: s.altoPx ? '1px' : `${s.anchoPct}%`,
                top: s.topPx,
                height: s.altoPx || 1,
              }}
            />
          ))}
          <span
            className={`absolute h-0 w-0 border-y-[3px] border-l-[4px] border-y-transparent ${
              c.invertido ? 'border-l-neg' : 'border-l-[color:var(--os-line-strong)]'
            }`}
            style={{ left: `calc(${c.flecha.izqPct}% - 4px)`, top: c.flecha.topPx - 3 }}
          />
        </span>
      ))}
    </div>
  )
}

function Encabezado({ escala }: { escala: EscalaCronograma }) {
  return (
    <div
      className="relative border-b border-line bg-surface-quiet"
      style={{ height: ALTO_HEAD }}
    >
      <span className="absolute left-3 top-1.5 text-[10px] uppercase tracking-[0.05em] text-faint">
        {escala.unidad === 'dia' ? 'Días' : (escala.unidad === 'semana' ? 'Semanas' : 'Meses')}
      </span>
      {escala.columnas.filter((c) => c.nueva).map((c) => (
        <span
          key={`${c.etiqueta}-${c.posPct}`}
          className="absolute bottom-1.5 font-mono text-[9.5px] tracking-[0.04em] text-muted tabular-nums"
          style={{ left: `${c.posPct}%`, paddingLeft: 4 }}
        >
          {c.etiqueta}
        </span>
      ))}
      {escala.hoyPosPct != null && (
        <span
          className="absolute bottom-1 -translate-x-1/2 rounded-[4px] bg-marca px-1.5 py-px font-mono text-[9.5px] font-semibold text-ink"
          style={{ left: `${escala.hoyPosPct}%` }}
        >
          hoy
        </span>
      )}
    </div>
  )
}

function PanelIzquierdo({ filas, seleccionada, hrefDe, cerrados, plegar }: {
  filas: FilaVista[]
  seleccionada: string | null
  hrefDe: (c: { sel?: string | null; mover?: number | null }) => string
  cerrados: ReadonlySet<string>
  plegar: (clave: string) => void
}) {
  // La sangría sólo tiene sentido cuando hay de qué colgar: en la vista plana de actividades todas
  // las filas son del mismo nivel, y sangrarlas a todas es un margen izquierdo disfrazado de árbol.
  const hayGrupos = filas.some((f) => f.nivel === 0)
  return (
    <div className="w-[300px] shrink-0 lg:w-[340px]">
      <div
        className="flex items-end gap-2 border-b border-line bg-surface-quiet px-3 pb-2 text-[10px] uppercase tracking-[0.05em] text-faint"
        style={{ height: ALTO_HEAD }}
      >
        <span className="flex-1">Actividad</span>
        <span>Desvío</span>
      </div>
      {filas.map((f) => {
        const d = textoDesvio(f.desvio)
        const esGrupo = f.nivel === 0
        return (
          <div
            key={f.clave}
            className={`flex items-center gap-2 border-b border-surface-sunken px-3 ${
              estaSeleccionada(f, seleccionada) ? 'bg-marca-soft shadow-[inset_3px_0_0_var(--os-marca)]' : 'hover:bg-surface-quiet'
            }`}
            style={{ height: ALTO_FILA }}
          >
            {esGrupo
              ? (
                <button
                  type="button" onClick={() => plegar(f.clave)}
                  aria-expanded={!cerrados.has(f.clave)}
                  aria-label={`${cerrados.has(f.clave) ? 'Abrir' : 'Cerrar'} ${f.nombre}`}
                  className="shrink-0 text-faint hover:text-ink"
                >
                  <IconoDesplegar className={`h-3 w-3 transition-transform ${cerrados.has(f.clave) ? '-rotate-90' : ''}`} />
                </button>
                )
              : <span className="w-3 shrink-0" aria-hidden />}
            <Link
              href={f.actividadId ? hrefDe({ sel: f.actividadId, mover: null }) : hrefDe({ sel: null, mover: null })}
              scroll={false}
              data-sel={estaSeleccionada(f, seleccionada) ? '1' : undefined}
              className="flex min-w-0 flex-1 items-center gap-1.5"
              style={{ paddingLeft: hayGrupos && !esGrupo ? 14 : 0 }}
            >
              <span className={`truncate ${esGrupo
                ? 'text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink'
                : 'text-[12.5px] text-ink-soft'}`}
              >
                {f.nombre}
              </span>
              {/* CRÍTICA ES TEXTO, NO ICONO: el △ ya significa «impedimento abierto» en esta misma
                  fila, y el mismo dibujo para dos cosas distintas se lee mal justo cuando importa. */}
              {f.critica && (
                <span className="shrink-0 text-[10px] uppercase tracking-[0.04em] text-warn" data-testid="marca-critica">
                  crítica
                </span>
              )}
              {f.tieneImpedimento && (
                <span className="shrink-0 text-neg" title="Impedimento abierto">
                  <IconoProblema className="h-3.5 w-3.5" />
                </span>
              )}
            </Link>
            <span className={`shrink-0 font-mono text-[11.5px] tabular-nums ${d.clase}`} data-testid="desvio-fila">
              {d.texto}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface RenglonProps {
  fila: FilaVista
  escala: EscalaCronograma
  diasVentana: number
  verBase: boolean
  seleccionada: boolean
  arrastreDias: number | null
  alArrastrar: (e: React.PointerEvent, id: string) => void
}

function Renglon({ fila, escala, diasVentana, verBase, seleccionada, arrastreDias, alArrastrar }: RenglonProps) {
  const tramo = tramoDe(escala, fila.inicio, fila.fin)
  // El fantasma del arrastre se corre en % del lienzo, no en píxeles: el lienzo es porcentual y un
  // desplazamiento en px se despegaría de la barra en cuanto la ventana cambie de ancho.
  const desplPct = arrastreDias ? (arrastreDias / Math.max(1, diasVentana)) * 100 : 0
  const proyeccion = fila.fin && fila.finPlan && fila.fin > fila.finPlan
    ? tramoDe(escala, fila.finPlan, fila.fin)
    : null
  const base = verBase ? tramoDe(escala, fila.inicioBase, fila.finBase) : null
  const esGrupo = fila.nivel === 0

  return (
    <div
      className={`relative border-b border-surface-sunken ${seleccionada ? 'bg-marca-soft' : 'hover:bg-surface-quiet'}`}
      style={{ height: ALTO_FILA }}
      data-fila={fila.clave}
    >
      {!tramo && !esGrupo && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-warn">
          sin fechas · falta análisis
        </span>
      )}
      {/* LA BASE VA ARRIBA Y ES UN HAIRLINE: lo prometido no compite con lo que está pasando. */}
      {base && (
        <div
          aria-hidden data-testid="barra-base"
          className="absolute top-[7px] h-[4px] rounded-[2px] bg-line-strong"
          style={{ left: `${base.izqPct}%`, width: `${base.anchoPct}%` }}
        />
      )}
      {proyeccion && (
        <div
          aria-hidden data-testid="barra-proyeccion"
          className="absolute top-[15px] h-[14px] rounded-[3px] border border-dashed border-neg"
          style={{ left: `${proyeccion.izqPct}%`, width: `${proyeccion.anchoPct}%` }}
        />
      )}
      {tramo && esGrupo && (
        <div
          aria-hidden
          className="absolute top-[19px] h-[5px] rounded-[2px] bg-line-strong"
          style={{ left: `${tramo.izqPct}%`, width: `${tramo.anchoPct}%` }}
        />
      )}
      {tramo && !esGrupo && (
        <div
          className="absolute top-[15px] h-[14px] overflow-hidden rounded-[3px] border border-line bg-surface-sunken"
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
              className={`h-full ${colorEjecutado(fila)}`}
              style={{ width: `${Math.min(100, fila.avancePct)}%` }}
            />
          )}
          {fila.esHito && (
            <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-ink" aria-hidden />
          )}
        </div>
      )}
      {fila.tieneImpedimento && tramo && (
        <span
          className="absolute top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2 text-neg"
          style={{ left: `${tramo.izqPct + tramo.anchoPct / 2}%` }}
          title="Impedimento abierto"
        >
          <IconoProblema className="h-3.5 w-3.5" />
        </span>
      )}
      {arrastreDias != null && arrastreDias !== 0 && (
        <span className="absolute right-2 top-1/2 z-[3] -translate-y-1/2 font-mono text-[10.5px] font-semibold text-warn tabular-nums">
          {arrastreDias > 0 ? `+${arrastreDias}` : arrastreDias} d
        </span>
      )}
    </div>
  )
}
