'use client'

// EL GANTT DE LA OBRA — la tabla a la izquierda, las barras a la derecha, y el arrastre que avisa.
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
// ═══ TRES CAPAS SUPERPUESTAS, Y CADA UNA DICE OTRA COSA (mockup 07) ═══
//
// BASE lo que se prometió al sellar (hairline gris arriba, 4px) · PLAN la barra de 15px con su
// relleno de avance · PROYECCIÓN el mismo alto en punteado rojo. Superponerlas es el punto entero
// de la pantalla: el desvío es la DIFERENCIA entre capas, y en tres pantallas separadas hay que
// recordarlo de memoria. La base no se dibuja cuando no fue sellada — un hueco es el dato.
//
// ═══ LAS MEDIDAS SON LAS DEL MOCKUP, NO LAS DEL COMPONENTE ═══
//
// Fila 36px · cabecera 46px partida en 22 (período) + 24 (divisiones) · base `top:6 h:4 r:2` ·
// barra `top:13 h:15 r:4` · resumen de frente `top:18 h:5` · línea de hoy 1,5px amarilla. El color
// de la barra dice el estado: verde terminada, ámbar en curso y crítica, azul en curso, gris sin
// arrancar; el relleno es el avance declarado y el fondo tenue es lo que falta.
//
// El plegado de un frente es estado del navegador: cerrar un rubro no cambia el plan y no tiene por
// qué costar una vuelta al servidor.

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { IconoDependencia, IconoProblema } from '@/shared/components/iconos'
import type { EscalaCronograma } from '../services/escalaCronograma'
import { tramoDe } from '../services/escalaCronograma'
import { bandasDePeriodo, franjasNoLaborables } from '../services/bandaCronograma'
import { conectoresDe, type Conector, type DependenciaConector } from '../services/conectoresGantt'
import type { EstadoUrl, FilaVista } from '../services/vistaCronograma'
import { hrefCronograma } from '../services/vistaCronograma'
import { TablaCronogramaObra, estaSeleccionada } from './TablaCronogramaObra'

/** El alto de la fila y el de la cabecera son del canon visual de la 07 (`ROWH = 36`, cabecera de
 *  46 = 22 + 24). Los leen las DOS columnas —la tabla y el lienzo— desde acá: el día que se
 *  separen, la barra deja de estar en la fila de su actividad y ningún test lo nota. */
const ALTO_FILA = 36
const ALTO_HEAD = 46
const ALTO_PERIODO = 22

const fmt = (iso: string | null) =>
  (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

/** Cómo se pinta una barra según su estado. Los cuatro casos del mockup: terminada, en curso sobre
 *  el camino crítico, en curso, y sin arrancar. `relleno` es el avance ya ejecutado; `fondo` es lo
 *  que falta, y por eso es el mismo color rebajado y no un gris cualquiera. */
function pinturaDeBarra(f: FilaVista): { relleno: string; fondo: string; borde: string } {
  if (f.avancePct != null && f.avancePct >= 100) return { relleno: 'bg-pos', fondo: 'bg-pos-soft', borde: '--os-pos' }
  if (f.avancePct != null && f.avancePct > 0) {
    return f.critica
      ? { relleno: 'bg-warn', fondo: 'bg-warn-soft', borde: '--os-warn' }
      : { relleno: 'bg-info', fondo: 'bg-info-soft', borde: '--os-info' }
  }
  return { relleno: 'bg-line-strong', fondo: 'bg-surface-sunken', borde: '--os-line' }
}

/** El borde de la barra es su propio color REBAJADO, como en el mockup (#CDE7D7 sobre #E6F3EB). Va
 *  por `style` y no por clase porque es una mezcla calculada sobre un token: un hex nuevo por cada
 *  estado sería el sexto verde del sistema. */
const bordeDeBarra = (v: string) => `color-mix(in srgb, var(${v}) 30%, #ffffff)`

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
  /** Los días que ESTA obra trabaja (isodow). Los otros se sombrean: sin eso, diez días de barra
   *  sobre el calendario no se distinguen de diez días de trabajo. */
  diasHabiles?: readonly number[]
}

export function LienzoCronogramaObra({
  filas, escala, diasVentana, obraId, estadoUrl, dependencias = [], diasHabiles = [],
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
  const francos = useMemo(
    () => franjasNoLaborables(escala.desde, escala.hasta, diasHabiles),
    [escala.desde, escala.hasta, diasHabiles],
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
    router.push(hrefDe({ sel: id, mover: dias === 0 ? null : dias }))
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
      <div className="flex overflow-hidden rounded-card border border-line bg-surface" data-testid="cronograma">
        <TablaCronogramaObra
          filas={filasVisibles} seleccionada={seleccionada} hrefDe={hrefDe}
          cerrados={cerrados} plegar={plegar} altoFila={ALTO_FILA} altoCabecera={ALTO_HEAD}
        />
        <div className="min-w-[560px] flex-1" ref={lienzo}>
          <Encabezado escala={escala} francos={francos} />
          <div className="relative">
            <Fondo escala={escala} francos={francos} />
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

/** Las columnas del calendario: la división de la escala y, detrás, los días que no se trabajan.
 *  Son referencia para leer una barra, no contenido: si se notan, compiten con las barras. */
function Fondo({ escala, francos }: { escala: EscalaCronograma; francos: { clave: string; izqPct: number; anchoPct: number }[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" data-testid="fondo-calendario">
      {francos.map((f) => (
        <span
          key={`franco-${f.clave}`}
          className="absolute inset-y-0 bg-surface-quiet"
          style={{ left: `${f.izqPct}%`, width: `${f.anchoPct}%` }}
        />
      ))}
      {escala.columnas.map((c) => (
        <span
          key={`guia-${c.posPct}`}
          className="absolute inset-y-0 w-px bg-[color:var(--os-surface-sunken)]"
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

/**
 * LA CABECERA DE DOS BANDAS (mockup 07): el período arriba, las divisiones de la escala abajo.
 *
 * Doce rótulos «S32 S33 S34…» no dicen en qué mes cae la obra. El mes va arriba porque es la
 * pregunta que se hace primero.
 */
function Encabezado({ escala, francos }: {
  escala: EscalaCronograma
  francos: { clave: string; izqPct: number; anchoPct: number }[]
}) {
  const periodos = bandasDePeriodo(escala.desde, escala.hasta, escala.unidad)
  return (
    <div className="relative border-b border-line bg-surface-quiet" style={{ height: ALTO_HEAD }}>
      <div className="relative" style={{ height: ALTO_PERIODO }}>
        {periodos.map((p) => (
          <span
            key={p.clave}
            className="absolute flex h-full items-center justify-center overflow-hidden whitespace-nowrap border-r border-line text-[11px] font-medium text-ink-soft"
            style={{ left: `${p.izqPct}%`, width: `${p.anchoPct}%` }}
          >
            {p.etiqueta}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height: ALTO_HEAD - ALTO_PERIODO }}>
        {francos.map((f) => (
          <span
            key={`franco-head-${f.clave}`}
            aria-hidden className="absolute inset-y-0 bg-surface-sunken"
            style={{ left: `${f.izqPct}%`, width: `${f.anchoPct}%` }}
          />
        ))}
        {escala.columnas.filter((c) => c.nueva).map((c) => (
          <span
            key={`${c.etiqueta}-${c.posPct}`}
            className="absolute bottom-1 font-mono text-[9.5px] tracking-[0.04em] text-muted tabular-nums"
            style={{ left: `${c.posPct}%`, paddingLeft: 4 }}
          >
            {c.etiqueta}
          </span>
        ))}
        {escala.hoyPosPct != null && (
          <span
            className="absolute bottom-0.5 -translate-x-1/2 rounded-[4px] bg-marca px-1.5 py-px font-mono text-[9.5px] font-semibold text-ink"
            style={{ left: `${escala.hoyPosPct}%` }}
          >
            hoy
          </span>
        )}
      </div>
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
  const pintura = pinturaDeBarra(fila)

  return (
    <div
      className={`relative border-b border-surface-sunken ${seleccionada ? 'bg-marca-soft' : 'hover:bg-surface-quiet'}`}
      style={{ height: ALTO_FILA }}
      data-fila={fila.clave}
    >
      {/* NULL NO ES CERO: una actividad sin fechas no se dibuja arrancando hoy, se dice. */}
      {!tramo && !esGrupo && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-warn">
          sin fechas · falta análisis
        </span>
      )}
      {/* LA BASE VA ARRIBA Y ES UN HAIRLINE: lo prometido no compite con lo que está pasando. */}
      {base && (
        <div
          aria-hidden data-testid="barra-base"
          className="absolute top-[6px] h-[4px] rounded-[2px] bg-line-strong"
          style={{ left: `${base.izqPct}%`, width: `${base.anchoPct}%` }}
        />
      )}
      {proyeccion && (
        <div
          aria-hidden data-testid="barra-proyeccion"
          className="absolute top-[13px] h-[15px] rounded-[4px] border-[1.5px] border-dashed border-neg"
          style={{ left: `${proyeccion.izqPct}%`, width: `${proyeccion.anchoPct}%` }}
        />
      )}
      {tramo && esGrupo && (
        <div
          aria-hidden data-testid="barra-resumen"
          className="absolute top-[18px] h-[5px] rounded-[2px] bg-line-strong"
          style={{ left: `${tramo.izqPct}%`, width: `${tramo.anchoPct}%` }}
        />
      )}
      {tramo && !esGrupo && (
        <div
          data-testid="barra-plan"
          className={`absolute top-[13px] h-[15px] overflow-hidden rounded-[4px] border ${pintura.fondo}`}
          style={{
            left: `${tramo.izqPct + desplPct}%`,
            width: `${tramo.anchoPct}%`,
            borderColor: bordeDeBarra(pintura.borde),
          }}
          onPointerDown={fila.actividadId ? (e) => alArrastrar(e, fila.actividadId!) : undefined}
          role={fila.actividadId ? 'button' : undefined}
          tabIndex={fila.actividadId ? 0 : undefined}
          aria-label={fila.actividadId
            ? `${fila.nombre}, del ${fmt(fila.inicio)} al ${fmt(fila.fin)}. Arrastrar para simular un corrimiento.`
            : undefined}
        >
          {fila.avancePct != null && fila.avancePct > 0 && (
            <div
              className={`h-full ${pintura.relleno}`}
              style={{ width: `${Math.min(100, fila.avancePct)}%` }}
            />
          )}
        </div>
      )}
      {/* EL ROMBO DEL HITO VA FUERA DE LA BARRA. Vivía adentro, con `-right-1` sobre un contenedor
          `overflow-hidden`: el navegador lo recortaba entero y ningún hito se veía nunca. */}
      {tramo && !esGrupo && fila.esHito && (
        <span
          aria-hidden data-testid="hito"
          className="absolute top-[20.5px] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-surface bg-ink"
          style={{ left: `calc(${tramo.izqPct + tramo.anchoPct}% + ${desplPct}%)` }}
        />
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
