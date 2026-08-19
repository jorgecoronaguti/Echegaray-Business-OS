'use client'

// TABLERO — las mismas actividades, ordenadas por en qué punto están.
//
// ═══ LA TARJETA DICE MUY POCO A PROPÓSITO ═══
//
// Nombre, rubro y la fecha que importa. Nada más. Una tarjeta cargada de datos deja de escanearse:
// el tablero sirve para ver DÓNDE se amontona el trabajo, y para eso hay que poder barrer cinco
// columnas con la vista en dos segundos. El detalle está a un clic, en el panel.
//
// ═══ «BLOQUEADA» NO SE ARRASTRA ═══
//
// Las otras cuatro columnas son un estado que alguien decide. Bloqueada NO: sale de tener un
// impedimento abierto. Por eso sus tarjetas no se pueden mover con los botones —moverlas dejaría la
// actividad diciendo «en curso» con el impedimento todavía sin resolver— y en su lugar la tarjeta
// dice cuántos impedimentos tiene. Se destraba resolviéndolos, que es lo que hay que hacer.
//
// SIN DRAG AND DROP. Un arrastre que falla en el teléfono —donde se usa la obra— es peor que dos
// botones que andan siempre. El cambio de estado va por las flechas de la tarjeta.

import { useMemo } from 'react'
import type { Actividad } from '../types'
import { COLUMNAS_TABLERO, ESTADO_LABEL } from '../types'
import type { ResultadoAccion } from '@/shared/components/ui'
import { BotonAccion } from '@/shared/components/ui'
import { fecha as fmtFecha } from './formato'

const MOVIBLES = ['pendiente', 'lista', 'en_curso', 'hecha'] as const

export function VistaTablero({
  actividades, cambiarEstado, onAbrir,
}: {
  actividades: Actividad[]
  cambiarEstado: (actividadId: string, estado: string) => Promise<ResultadoAccion>
  onAbrir?: (id: string) => void
}) {
  const columnas = useMemo(() => {
    const ejecutables = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada)
    return COLUMNAS_TABLERO.map((estado) => ({
      estado,
      filas: ejecutables.filter((a) => a.estado_operativo === estado).sort((x, y) => x.orden - y.orden),
    }))
  }, [actividades])

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="vista-tablero">
      {columnas.map((c) => (
        <section key={c.estado} data-testid={`columna-${c.estado}`} className="min-w-0">
          <h3 className="mb-2 flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
            <span className="text-[12px] font-medium text-ink">{ESTADO_LABEL[c.estado]}</span>
            <span className="text-[11px] tabular-nums text-faint">{c.filas.length}</span>
          </h3>
          <div className="space-y-1.5">
            {c.filas.length === 0 && <p className="text-[11px] text-faint">—</p>}
            {c.filas.map((a) => {
              const i = MOVIBLES.indexOf(a.estado as (typeof MOVIBLES)[number])
              const trabada = c.estado === 'bloqueada'
              return (
                <article key={a.id} data-testid="tarjeta" className="rounded-md border border-line bg-surface px-2.5 py-2">
                  <button
                    type="button" onClick={() => onAbrir?.(a.id)}
                    className="block w-full text-left text-[12px] leading-snug text-ink hover:underline"
                  >{a.nombre}</button>
                  <p className="mt-0.5 truncate text-[11px] text-faint">{a.rubro ?? 'sin rubro'}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted">
                      {trabada
                        ? <span className="text-neg">{a.impedimentos_abiertos} impedimento(s)</span>
                        : a.fin_plan ? fmtFecha(a.fin_plan) : <span className="text-faint">sin fecha</span>}
                    </span>
                    {!trabada && (
                      <span className="flex shrink-0 gap-1">
                        {i > 0 && (
                          <BotonAccion accion={cambiarEstado} args={[a.id, MOVIBLES[i - 1]]} testid="atras">←</BotonAccion>
                        )}
                        {i >= 0 && i < MOVIBLES.length - 1 && (
                          <BotonAccion accion={cambiarEstado} args={[a.id, MOVIBLES[i + 1]]} testid="adelante">→</BotonAccion>
                        )}
                      </span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
