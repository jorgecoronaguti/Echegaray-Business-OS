// SOLAPA `ANÁLISIS` — la composición por unidad. SÓLO SE RENDERIZA CON PERMISO ECONÓMICO.
//
// Quien la llama ya decidió eso (`FichaTarea`): acá no hay un `if` de permiso, porque un permiso
// chequeado en dos lugares es un permiso que algún día va a estar chequeado en uno solo.
//
// Las tres secciones del contrato —mano de obra, materiales, equipos— salen de `recurso.tipo`, que
// el modelo resuelve por UNIDAD y no por color: `hs` es mano de obra, `hr` es carga social. Los
// totales NO se suman acá: vienen de `analisis_costo`, que ya los calculó en Postgres.

import { Nulo } from '@/shared/components/ds'
import type { FichaTarea, LineaAnalisis } from '../types'
import { frescuraDePrecio, numero, porcentaje } from '../services/reglas'
import { CantidadEditable } from './CantidadEditable'
import { FechaPrecio, Plata, Rotulo } from './celdas'

const SECCIONES: { tipo: LineaAnalisis['tipo']; rotulo: string; color: string }[] = [
  { tipo: 'mano_obra', rotulo: 'Mano de obra', color: 'text-pos' },
  { tipo: 'material', rotulo: 'Materiales', color: 'text-faint' },
  { tipo: 'equipo', rotulo: 'Equipos', color: 'text-faint' },
  { tipo: 'otro', rotulo: 'Otros', color: 'text-faint' },
]

export function SolapaAnalisis({ ficha }: { ficha: FichaTarea }) {
  const { lineas, costo, tarea } = ficha
  const hoy = new Date().toISOString().slice(0, 10)

  if (!tarea.analisis_id || !lineas.length) {
    return (
      <p className="text-[12.5px] text-muted" data-testid="analisis-vacio">
        Sin composición cargada: esta tarea tipo no aporta HH ni costo a ningún presupuesto.
      </p>
    )
  }

  const cargas = lineas.filter((l) => l.tipo === 'carga_social')

  return (
    <div data-testid="analisis-tarea">
      <div className="flex items-baseline justify-between gap-3">
        <Rotulo>Composición por {tarea.unidad}</Rotulo>
        <span className="font-mono text-[10.5px] text-faint">versión {tarea.version ?? '—'}</span>
      </div>

      {SECCIONES.map((s) => {
        const filas = lineas.filter((l) => l.tipo === s.tipo)
        if (!filas.length) return null
        return (
          <section key={s.tipo} className="mt-4" data-testid={`seccion-${s.tipo}`}>
            <div className={`text-[10px] font-medium uppercase tracking-[0.05em] ${s.color}`}>{s.rotulo}</div>
            <ul className="mt-1.5">
              {filas.map((l) => (
                <li key={l.id} className="grid grid-cols-[1fr_78px_66px_78px] items-center gap-2 border-b border-[#EFEEEA] py-2 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-ink-soft" title={l.nombre}>{l.nombre}</span>
                    <span className="mt-0.5 block text-[10px] text-faint">
                      {l.codigo}
                      {l.desperdicio > 0 && ` · desperdicio ${porcentaje(l.desperdicio, 0)}`}
                    </span>
                  </span>
                  <CantidadEditable
                    tareaTipoId={tarea.id}
                    analisisId={tarea.analisis_id as string}
                    lineaId={l.id}
                    cantidad={l.cantidad}
                    unidad={l.unidad}
                  />
                  <span className="text-right">
                    {l.costo_base == null
                      ? <Nulo>sin cargar</Nulo>
                      : <span className="font-mono text-[11px] tabular-nums text-muted">{numero(l.costo_base, 0)}</span>}
                  </span>
                  <span className="text-right">
                    {l.costo_con_desperdicio == null
                      ? <Nulo>sin cargar</Nulo>
                      : <span className="font-mono text-[11px] tabular-nums text-ink-soft">
                          {numero(l.cantidad * l.costo_con_desperdicio, 0)}
                        </span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {/* La fila de cargas va con el fondo de «calculado»: no es un insumo que alguien compró. */}
      {cargas.length > 0 && (
        <div className="mt-3 rounded-card bg-[#FEF9E6] px-3 py-2" data-testid="fila-cargas">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-ink-soft">
              Cargas sociales · {cargas.length === 1 ? cargas[0].nombre : `${cargas.length} conceptos`}
            </span>
            <span className="font-mono text-[12px] font-semibold tabular-nums">
              {costo?.costo_cargas_sociales == null
                ? <Nulo>sin cargar</Nulo>
                : numero(costo.costo_cargas_sociales, 0)}
            </span>
          </div>
        </div>
      )}

      {/* EL COSTO UNITARIO NO SE SUMA ACÁ. Sale de `analisis_costo`: si se recalculara en el
          navegador habría dos definiciones del mismo número y algún día darían distinto. */}
      <div className="mt-3 border-t border-line-strong pt-2.5">
        <Total rotulo="Mano de obra" v={costo?.costo_mano_obra ?? null} />
        <Total rotulo="Materiales" v={costo?.costo_materiales ?? null} />
        <Total rotulo="Equipos" v={costo?.costo_equipos ?? null} />
        <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[#EFEEEA] pt-2">
          <span className="text-[13px] font-semibold text-ink">Costo unitario</span>
          <span className="font-mono text-[15px] font-semibold tabular-nums text-ink">
            {costo?.costo_directo == null ? <Nulo>sin cargar</Nulo> : `$ ${numero(costo.costo_directo, 0)}`}
          </span>
        </div>
      </div>

      {costo && costo.n_lineas_sin_precio > 0 && (
        <p className="mt-2 text-[11.5px] text-warn" data-testid="lineas-sin-precio">
          {costo.n_lineas_sin_precio} de {costo.n_lineas} líneas no tienen precio cargado: el costo unitario está incompleto.
        </p>
      )}
      {costo?.precio_mas_viejo && frescuraDePrecio(costo.precio_mas_viejo, hoy) === 'vieja' && (
        <p className="mt-1 text-[11.5px] text-warn">
          El precio más viejo de este análisis es del{' '}
          <FechaPrecio iso={costo.precio_mas_viejo} frescura="vieja" />.
        </p>
      )}
    </div>
  )
}

function Total({ rotulo, v }: { rotulo: string; v: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11.5px] text-faint">{rotulo}</span>
      <Plata v={v} decimales={0} falta="sin cargar" />
    </div>
  )
}
