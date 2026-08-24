'use client'

// UNA FILA DEL ÁRBOL DE LA OBRA — pantalla 03.
//
// ═══ LA JERARQUÍA SE LEE POR PESO Y SANGRÍA, NO POR COLOR ═══
//
// Rubro y sector en versalitas de 11,5px/600; nivel y frente en 12,5px/600; la actividad en 12,5px
// normal. 15px de sangría por nivel, con tope a los seis.
//
// ═══ ABRIR ES UN CALLBACK, NO UNA NAVEGACIÓN (23/08 · Design §16) ═══
//
// El nombre y el avance abren el panel EN EL CLIENTE: el material ya vino con el árbol y un viaje
// al servidor por clic era lo que hacía tardar segundos el gesto más usado de la pantalla.
//
// ═══ EL CARRIL DE TIEMPO, ALINEADO 1:1 CON LA FILA ═══
//
// Plan como pista gris, real hasta HOY (pos terminada · grafito en curso · warn vencida), línea
// amarilla de hoy. Sin fechas no se dibuja barra: el hueco ES el dato. El Gantt operable (arrastre,
// dependencias gráficas) es la vista Cronograma; esto es leer el tiempo sin salir del árbol.

import { Estado, Td, Tr } from '@/shared/components/ds'
import { cantidad as fmtCantidad, fechaCorta, porcentaje } from './formato'
import { estadoDeFila, type ClaveEstado, type FilaVisible } from '../services/vistaArbol'
import { ejecutorDe } from '../services/wbs'
import type { TonoEstado } from '@/shared/components/ds'
import type { Solapa } from '../services/solapasTarea'

const TONO: Record<ClaveEstado, TonoEstado> = {
  impedimento: 'neg',
  hecha: 'pos',
  en_curso_critica: 'warn',
  en_curso: 'curso',
  sin_analisis: 'warn',
  sin_cuadrilla: 'warn',
  sin_plan: 'pendiente',
  pendiente: 'pendiente',
}

export interface CarrilDeFila {
  plan: { l: number; w: number }
  real: { l: number; w: number; tono: 'pos' | 'ink' | 'warn' } | null
  hoy: number
}

const REAL_TONO = { pos: 'bg-pos', ink: 'bg-accent', warn: 'bg-warn' } as const

/** La barra de 4px. Verde al llegar a 100, warn en el camino crítico, grafito el resto. */
function BarraAvance({ pct, critica }: { pct: number; critica: boolean }) {
  const color = pct >= 100 ? 'bg-pos' : critica ? 'bg-warn' : 'bg-accent'
  return (
    <span className="h-1 w-full min-w-[36px] overflow-hidden rounded-full bg-surface-sunken">
      <span className={`block h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </span>
  )
}

export function FilaWbs({
  fila, abierta, seleccionada, seleccionable, alSeleccionar, alPlegar, alAbrir, carril, conCarril,
}: {
  fila: FilaVisible
  abierta: boolean
  seleccionada: boolean
  seleccionable: boolean
  alSeleccionar: (v: boolean) => void
  alPlegar: () => void
  /** Abre el panel en el cliente; `sol` fuerza la solapa (el % abre en Avance). */
  alAbrir: (sol?: Solapa) => void
  carril: CarrilDeFila | null
  /** La columna del carril existe para toda la tabla o para nadie: si la obra no tiene rango de
   *  fechas, no se dibuja ni la celda vacía. */
  conCarril: boolean
}) {
  const n = fila.nodo
  const est = estadoDeFila(n, fila.avance)
  const sangria = Math.min(n.nivel, 6) * 15
  const jerarquia = n.es_contenedor
    ? n.nivel === 0
      ? 'text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink'
      : 'text-[12.5px] font-semibold text-ink'
    : 'text-[12.5px] text-ink-soft'

  return (
    <Tr compacta seleccionada={abierta} className={n.nivel === 0 ? 'bg-surface-quiet' : ''}>
      <Td className="w-6">
        {/* La casilla va SÓLO en las actividades: un contenedor no se mide, se agrega. Y va como
            hermana del enlace, nunca adentro: un input dentro de un link deja el clic en cualquiera
            de los dos según el navegador. */}
        {!n.es_contenedor && (
          <input
            type="checkbox"
            checked={seleccionada}
            disabled={!seleccionable}
            onChange={(e) => alSeleccionar(e.target.checked)}
            aria-label={`Seleccionar ${n.nombre}`}
            data-testid={`sel-${n.id}`}
            className="h-3.5 w-3.5 shrink-0 accent-marca disabled:opacity-30"
          />
        )}
      </Td>

      <Td>
        <span className="flex items-center gap-1.5" style={{ paddingLeft: sangria }}>
          {fila.plegable ? (
            <button
              type="button"
              onClick={alPlegar}
              aria-expanded={!fila.plegado}
              aria-label={`${fila.plegado ? 'Desplegar' : 'Plegar'} ${n.nombre}`}
              data-testid={`caret-${n.id}`}
              className="w-3 shrink-0 text-[11px] text-faint hover:text-ink"
            >{fila.plegado ? '▸' : '▾'}</button>
          ) : <span className="w-3 shrink-0" aria-hidden />}
          <button type="button" onClick={() => alAbrir()} data-testid={`fila-${n.id}`}
            className={`${jerarquia} text-left hover:underline`}>
            {n.nombre}
          </button>
          {n.partida_codigo && (
            <span className="hidden shrink-0 font-mono text-[10px] text-faint lg:inline">{n.partida_codigo}</span>
          )}
          {n.es_subcontrato && (
            <span className="shrink-0 rounded border border-line px-1 text-[9.5px] text-muted">SUB</span>
          )}
        </span>
      </Td>

      <Td num className="w-[100px] whitespace-nowrap">
        {n.es_contenedor ? '' : (fmtCantidad(n.cantidad_objetivo, n.unidad)
          ?? <span className="font-sans text-[11.5px] text-faint">sin cargar</span>)}
      </Td>

      <Td className="w-[132px]">
        {/* EL AVANCE ES UNA PUERTA: tocarlo abre el panel en la solapa Avance. El contenedor no la
            ofrece: su avance se agrega, no se carga. */}
        {n.es_contenedor ? (
          fila.avance === null
            ? <span className="text-[11.5px] text-faint">sin avance</span>
            : (
              <span className="flex items-center gap-2">
                <BarraAvance pct={fila.avance} critica={n.es_critica} />
                <span className="w-[42px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-soft">
                  {porcentaje(fila.avance)}
                </span>
              </span>
            )
        ) : (
          <button type="button" onClick={() => alAbrir('avance')}
            aria-label={`Avance de ${n.nombre}`} data-testid={`avance-${n.id}`}
            className="group flex w-full items-center gap-2">
            {fila.avance === null ? (
              <span className="text-[11.5px] text-faint group-hover:text-ink group-hover:underline">sin avance</span>
            ) : (
              <>
                <BarraAvance pct={fila.avance} critica={n.es_critica} />
                <span className="w-[42px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-soft group-hover:underline">
                  {porcentaje(fila.avance)}
                </span>
              </>
            )}
          </button>
        )}
      </Td>

      <Td num className="hidden w-[84px] lg:table-cell">
        {(() => {
          const f = fechaCorta(n.es_contenedor ? fila.agregado?.fin_plan ?? null : n.fin_plan)
          if (!f) return <span className="font-sans text-[11px] text-faint">sin plan</span>
          const alerta = est.clave === 'en_curso_critica' || est.clave === 'sin_analisis'
          return <span className={`text-[11px] ${alerta ? 'text-warn' : ''}`}>{f}</span>
        })()}
      </Td>

      {/* LA COLUMNA ES «QUIÉN LO HACE», Y ESO ES LA CUADRILLA O EL SUBCONTRATISTA. El responsable
          —una persona— está en el panel de la tarea, que es donde se lo asigna. */}
      <Td className="hidden w-[124px] text-[11.5px] lg:table-cell">
        {n.es_contenedor ? '' : ejecutorDe(n) ?? <span className="text-faint">sin asignar</span>}
      </Td>

      <Td className="w-[112px]">
        <Estado tono={TONO[est.clave]} clave={est.clave} testid={`estado-${n.id}`}>{est.label}</Estado>
      </Td>

      {conCarril && (
        <Td className="hidden w-[280px] md:table-cell">
          <span className="relative block h-[14px] w-full" data-testid={carril ? `carril-${n.id}` : undefined}>
            {carril && (
              <>
                <span className="absolute top-[4.5px] h-[5px] rounded-[2px] bg-[#EAE7E6]"
                  style={{ left: `${carril.plan.l}%`, width: `${carril.plan.w}%` }} />
                {carril.real && (
                  <span className={`absolute top-[8px] h-[5px] rounded-[2px] ${REAL_TONO[carril.real.tono]}`}
                    style={{ left: `${carril.real.l}%`, width: `${carril.real.w}%` }} />
                )}
                <span className="absolute inset-y-0 w-[1.5px] bg-marca" style={{ left: `${carril.hoy}%` }} aria-hidden />
              </>
            )}
          </span>
        </Td>
      )}
    </Tr>
  )
}
