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
// ═══ TRES COLUMNAS: ACTIVIDAD · ESTADO · % (canónico 03) ═══
//
// Cantidad y Cuadrilla salieron de la fila el 24/08: el canónico le da el ancho al Gantt, y esos
// dos datos ya se leen —y se EDITAN— en el panel de la actividad, que es donde se decide sobre
// ellos. Dejarlos también acá era pagar 224px de la columna central por un duplicado de sólo
// lectura. Plazo no se pierde nunca: cuando la pantalla es angosta y el Gantt no entra, la columna
// vuelve (`xl:hidden`) — el mismo `verFechas = !verGantt` del canónico.
//
// El nombre se TRUNCA con un tope en px, no con `min-w-0`: la tabla es `table-layout:auto`, así que
// un nombre largo con `white-space:nowrap` y sin tope ensancha la columna, empuja Estado y % fuera
// del ancho de la lista y los deja detrás del scroll (QA 24/08 — la fila se veía sin estado).

import { Estado, Td, Tr } from '@/shared/components/ds'
import { fechaCorta, porcentaje } from './formato'
import { estadoDeFila, type ClaveEstado, type FilaVisible } from '../services/vistaArbol'
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

export function FilaWbs({
  fila, abierta, seleccionada, seleccionable, alSeleccionar, alPlegar, alAbrir, conGantt,
}: {
  fila: FilaVisible
  abierta: boolean
  seleccionada: boolean
  seleccionable: boolean
  alSeleccionar: (v: boolean) => void
  alPlegar: () => void
  /** Abre el panel en el cliente; `sol` fuerza la solapa (el % abre en Avance). */
  alAbrir: (sol?: Solapa) => void
  /** Con Gantt al lado, la fecha de plan se lee en la barra y la columna Plazo sobra. */
  conGantt: boolean
}) {
  const n = fila.nodo
  const est = estadoDeFila(n, fila.avance)
  const sangria = Math.min(n.nivel, 6) * 15
  const jerarquia = n.es_contenedor
    ? n.nivel === 0
      ? 'text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink'
      : 'text-[12.5px] font-semibold text-ink'
    : 'text-[12.5px] text-ink-soft'
  // El 100 en verde y el resto en tinta: el canónico usa el color del % para que la columna se
  // pueda barrer de arriba abajo buscando lo terminado sin leer un solo número.
  const tinta = fila.avance === null ? 'text-faint' : fila.avance >= 100 ? 'text-[#067647]' : 'text-ink'

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
            className={`${jerarquia} truncate text-left hover:underline max-w-[380px] xl:max-w-[140px] 2xl:max-w-[240px]`}>
            {n.nombre}
          </button>
          {n.partida_codigo && (
            <span className="hidden shrink-0 font-mono text-[10px] text-faint 2xl:inline">{n.partida_codigo}</span>
          )}
          {n.es_subcontrato && (
            <span className="shrink-0 rounded border border-line px-1 text-[9.5px] text-muted">SUB</span>
          )}
        </span>
      </Td>

      <Td className="w-[116px]">
        <Estado tono={TONO[est.clave]} clave={est.clave} testid={`estado-${n.id}`}>{est.label}</Estado>
      </Td>

      {/* PLAZO SÓLO SIN GANTT: con el Gantt al lado, la misma fecha se lee dos veces. */}
      <Td num className={`w-[84px] ${conGantt ? 'xl:hidden' : ''}`}>
        {(() => {
          const f = fechaCorta(n.es_contenedor ? fila.agregado?.fin_plan ?? null : n.fin_plan)
          if (!f) return <span className="font-sans text-[11px] text-faint">sin plan</span>
          const alerta = est.clave === 'en_curso_critica' || est.clave === 'sin_analisis'
          return <span className={`text-[11px] ${alerta ? 'text-warn' : ''}`}>{f}</span>
        })()}
      </Td>

      <Td num className="w-[52px] whitespace-nowrap">
        {/* EL AVANCE ES UNA PUERTA: tocarlo abre el panel en la solapa Avance. El contenedor no la
            ofrece: su avance se agrega, no se carga. */}
        {n.es_contenedor ? (
          <span className={`text-[11.5px] font-semibold ${tinta}`}>
            {fila.avance === null ? '—' : porcentaje(fila.avance)}
          </span>
        ) : (
          <button type="button" onClick={() => alAbrir('avance')}
            aria-label={`Avance de ${n.nombre}`} data-testid={`avance-${n.id}`}
            className={`text-[11.5px] hover:underline ${tinta}`}>
            {fila.avance === null ? '—' : porcentaje(fila.avance)}
          </button>
        )}
      </Td>
    </Tr>
  )
}
