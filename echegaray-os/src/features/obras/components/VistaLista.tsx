'use client'

// LISTA — la vista más eficiente para administrar muchas actividades de una vez.
//
// El Gantt sirve para ver el tiempo; la lista sirve para CARGAR. Cuando hay que ponerle unidad,
// cantidad y responsable a cuarenta actividades, arrastrar barras es el peor camino posible.
//
// ═══ AGRUPADA POR RUBRO, NO ORDENADA POR RUBRO ═══
//
// La jerarquía ya existe en los datos (`tipo = 'resumen'` + `codigo_padre`). Se muestra como
// encabezado de grupo y no como una columna repetida cuarenta veces: la columna gasta ancho en
// decir lo mismo una y otra vez, el encabezado lo dice una sola.
//
// LO QUE FALTA SE VE. Una actividad sin unidad, sin cantidad o sin fecha lo dice con «sin cargar» en
// gris — nunca con un cero, que se confundiría con «cero metros ejecutados».

import { useMemo } from 'react'
import type { Actividad } from '../types'
import { ESTADO_LABEL } from '../types'
import { C, Fila, Tabla, Vacio } from './tablas'
import { fecha as fmtFecha } from './formato'

const num = (n: number | null | undefined) =>
  n == null ? null : n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

const SinCargar = () => <span className="text-faint">sin cargar</span>

/** El tono del estado. Rojo SÓLO para bloqueada, que es el único problema real de esta columna. */
function EstadoChip({ estado }: { estado: string }) {
  const tono = estado === 'bloqueada' ? 'text-neg' : estado === 'hecha' ? 'text-pos' : 'text-muted'
  return <span className={`text-[12px] ${tono}`}>{ESTADO_LABEL[estado as keyof typeof ESTADO_LABEL] ?? estado}</span>
}

export function VistaLista({
  actividades, onAbrir,
}: {
  actividades: Actividad[]
  onAbrir?: (id: string) => void
}) {
  const grupos = useMemo(() => {
    const ejecutables = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada)
    const m = new Map<string, Actividad[]>()
    for (const a of ejecutables) {
      const clave = a.rubro ?? a.seccion ?? 'Sin rubro'
      const filas = m.get(clave) ?? []
      filas.push(a)
      m.set(clave, filas)
    }
    return [...m.entries()].map(([rubro, filas]) => ({
      rubro,
      filas: filas.sort((x, y) => x.orden - y.orden),
    }))
  }, [actividades])

  if (grupos.length === 0) return <Vacio>Esta obra todavía no tiene actividades.</Vacio>

  return (
    <div className="space-y-5" data-testid="vista-lista">
      {grupos.map((g) => (
        <section key={g.rubro}>
          <h3 className="mb-1.5 flex items-baseline gap-2 text-[12px] font-medium uppercase tracking-wide text-muted">
            {g.rubro}
            <span className="text-[11px] font-normal normal-case text-faint">{g.filas.length}</span>
          </h3>
          <Tabla
            testid="tabla-lista"
            cols={[{ k: 'Actividad' }, { k: 'Unidad' }, { k: 'Cantidad', num: true },
              { k: 'Inicio' }, { k: 'Fin' }, { k: 'Avance', num: true }, { k: 'Estado' }]}
          >
            {g.filas.map((a) => (
              <Fila key={a.id}>
                <C>
                  <button
                    type="button" onClick={() => onAbrir?.(a.id)} data-testid="abrir-actividad"
                    className="text-left text-ink hover:underline"
                  >{a.nombre}</button>
                </C>
                <C>{a.unidad ?? <SinCargar />}</C>
                <C num>
                  {a.cantidad_objetivo == null
                    ? <SinCargar />
                    : (
                        <span>
                          {num(a.cantidad_ejecutada ?? 0)}
                          <span className="text-faint">/{num(a.cantidad_objetivo)}</span>
                        </span>
                      )}
                </C>
                <C>{a.inicio_plan ? fmtFecha(a.inicio_plan) : <SinCargar />}</C>
                <C>{a.fin_plan ? fmtFecha(a.fin_plan) : <SinCargar />}</C>
                <C num>{a.avance_pct == null ? <SinCargar /> : `${num(a.avance_pct)}%`}</C>
                <C><EstadoChip estado={a.estado_operativo} /></C>
              </Fila>
            ))}
          </Tabla>
        </section>
      ))}
    </div>
  )
}
