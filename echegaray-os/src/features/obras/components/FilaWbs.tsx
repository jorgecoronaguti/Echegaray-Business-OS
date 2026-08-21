'use client'

// UNA FILA DEL ÁRBOL DE LA OBRA — pantalla 03.
//
// ═══ LA JERARQUÍA SE LEE POR PESO Y SANGRÍA, NO POR COLOR ═══
//
// Rubro y sector en versalitas de 11,5px/600; nivel y frente en 12,5px/600; la actividad en 12,5px
// normal. 15px de sangría por nivel. Con N niveles habilitados desde el 21/08 la sangría se topa a
// los seis: más adentro la columna del nombre deja de tener ancho para el nombre.
//
// ═══ LA BARRA DE AVANCE SÓLO SI EL NÚMERO ES UNA FRACCIÓN DE 0 A 100 ═══
//
// «sin plan» no lleva barra: una pista vacía se lee como 0 %, que es exactamente lo que la regla de
// NULL prohíbe. Y una barra debajo de `+16 d`, de HH o de un importe no significa nada.

import Link from 'next/link'
import { Estado, Td, Tr } from '@/shared/components/ds'
import { cantidad as fmtCantidad, fechaCorta, porcentaje } from './formato'
import { estadoDeFila, type ClaveEstado, type FilaVisible } from '../services/vistaArbol'
import type { TonoEstado } from '@/shared/components/ds'

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
  fila, abierta, seleccionada, seleccionable, alSeleccionar, alPlegar, hrefBase,
}: {
  fila: FilaVisible
  abierta: boolean
  seleccionada: boolean
  seleccionable: boolean
  alSeleccionar: (v: boolean) => void
  alPlegar: () => void
  /** La URL de la fila conserva la vista y el buscador: abrir el panel no puede reordenar la lista. */
  hrefBase: string
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
    <Tr compacta seleccionada={abierta} className={n.es_contenedor ? 'bg-surface-quiet' : ''}>
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
          <Link href={`${hrefBase}&act=${n.id}`} data-testid={`fila-${n.id}`} className={`${jerarquia} hover:underline`}>
            {n.nombre}
          </Link>
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
        {fila.avance === null ? (
          <span className="text-[11.5px] text-faint">sin avance</span>
        ) : (
          <span className="flex items-center gap-2">
            <BarraAvance pct={fila.avance} critica={n.es_critica} />
            <span className="w-[42px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-soft">
              {porcentaje(fila.avance)}
            </span>
          </span>
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

      <Td className="hidden w-[124px] text-[11.5px] lg:table-cell">
        {n.es_contenedor ? '' : n.responsable ?? <span className="text-faint">sin asignar</span>}
      </Td>

      <Td className="w-[112px]">
        <Estado tono={TONO[est.clave]} clave={est.clave} testid={`estado-${n.id}`}>{est.label}</Estado>
      </Td>
    </Tr>
  )
}
