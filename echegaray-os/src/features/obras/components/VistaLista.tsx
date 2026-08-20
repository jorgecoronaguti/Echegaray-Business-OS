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
import { CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import type { Actividad } from '../types'
import { UNIDADES } from '../types'
import { EstadoChip } from './EstadoChip'
import { C, Fila, Tabla, Vacio } from './tablas'
import { fecha as fmtFecha } from './formato'

const num = (n: number | null | undefined) =>
  n == null ? null : n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

const SinCargar = () => <span className="text-faint">sin cargar</span>

export function VistaLista({
  actividades, onAbrir, medir,
}: {
  actividades: Actividad[]
  onAbrir?: (id: string) => void
  /** Guardar unidad y cantidad objetivo de TODAS las filas de una vez. Sin ella, las dos columnas
   *  quedan de lectura: campos que no persisten son peores que campos que no existen. */
  medir?: AccionFormulario
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

  const cuerpo = (
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
                {/* SE EDITA ACÁ MISMO. Esta vista existe para cargar en volumen: si para poner una
                    unidad hay que abrir el panel, es más rápido el Excel. */}
                <C>
                  {medir
                    ? (
                        <input
                          name={`unidad_${a.id}`} defaultValue={a.unidad ?? ''} list="unidades-lista"
                          maxLength={12} className={`${CTRL} w-[74px] py-1`} data-testid="lista-unidad"
                          aria-label={`Unidad de ${a.nombre}`}
                        />
                      )
                    : (a.unidad ?? <SinCargar />)}
                </C>
                <C num>
                  {medir
                    ? (
                        <span className="flex items-baseline justify-end gap-1">
                          {/* Lo ejecutado NO se edita: sale de los partes. Se muestra al lado para
                              que quien carga el objetivo vea contra qué va. */}
                          {a.cantidad_ejecutada != null && (
                            <span className="tabular-nums text-faint">{num(a.cantidad_ejecutada)}/</span>
                          )}
                          <input
                            name={`cantidad_${a.id}`} defaultValue={a.cantidad_objetivo ?? ''}
                            inputMode="decimal" className={`${CTRL} w-[86px] py-1 text-right`}
                            data-testid="lista-cantidad" aria-label={`Cantidad objetivo de ${a.nombre}`}
                          />
                        </span>
                      )
                    : a.cantidad_objetivo == null
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

  if (!medir) return cuerpo
  return (
    <FormAccion accion={medir} testid="form-medicion-lote" enviar="Guardar medición" mensajeOk="Guardado.">
      {cuerpo}
      <datalist id="unidades-lista">
        {UNIDADES.map((u) => <option key={u} value={u} />)}
      </datalist>
      <p className="mt-1 text-[11px] text-faint">
        Con unidad y cantidad objetivo, el avance de esa actividad pasa a calcularse desde la
        producción que se carga en Ejecución. Vaciar las dos la devuelve a declarar el avance a mano.
      </p>
    </FormAccion>
  )
}
