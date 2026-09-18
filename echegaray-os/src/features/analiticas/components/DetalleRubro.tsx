// QUÉ CONTIENE UN RUBRO — lo que el dueño pidió el 18/09/2026: «que cada cosa quede aclarada diciendo
// qué contiene cada uno en detalle». Un `<details>` nativo (sin JavaScript, sirve en el teléfono) con
// las dos patas: los insumos del documento de cotización y los grupos del gasto (familias de Compras,
// proveedores, quincenas). Nunca dibuja un cero: lo que no hay se dice con su palabra.
import { millones } from '../services/formato'
import type { ConsumoRubro } from '../services/consumo'
import type { ItemPresupuestado, RubroPresupuestado } from '../services/presupuesto'

const TOPE = 14

/** `$ 1,23 M` o, por debajo del millón, `$ 123.456`: un insumo de $ 4.000 no se lee como «$ 0,00 M». */
export function importe(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  if (Math.abs(n) >= 1e6) return millones(n)
  return `${n < 0 ? '−' : ''}$ ${Math.round(Math.abs(n)).toLocaleString('es-AR')}`
}

const cantidad = (d: ItemPresupuestado): string | null =>
  d.cantidad != null && d.unidad ? `${d.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${d.unidad}` : d.unidad ?? null

export function DetalleRubro({ rotulo, definicion, presupuesto, consumo, fuente, consumido, abierto = false }: {
  rotulo: string
  /** La definición de una línea del rubro; en la cabecera del panel, no arriba del número. */
  definicion?: string | null
  presupuesto: RubroPresupuestado | null
  consumo: ConsumoRubro | null
  /** «Cotizacion Final.xlsm · 27/07/2026»: de dónde salió lo presupuestado. */
  fuente: string | null
  /** Lo consumido del rubro, para la línea de cifras del encabezado. */
  consumido?: number | null
  abierto?: boolean
}) {
  const dentro = (presupuesto?.detalle ?? []).filter((d) => !d.fueraDeOferta)
  const fuera = (presupuesto?.detalle ?? []).filter((d) => d.fueraDeOferta)
  const grupos = consumo?.detalle ?? []
  const fueraTotal = fuera.reduce((a, d) => a + d.importe, 0)
  return (
    <details open={abierto || undefined} className="group min-w-0 rounded-control border border-line bg-surface-quiet/40" data-testid={`detalle-${rotulo}`}>
      <summary className="cursor-pointer list-none px-3.5 py-3">
        {/* 390 px (18/09/2026): las cifras en una sola línea empujaban scroll horizontal; parten renglón. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[13px] font-semibold text-ink">
            <span className="mr-1 inline-block text-faint transition-transform group-open:rotate-90">›</span>{rotulo}
          </span>
          <span className="whitespace-nowrap text-[11.5px] tabular-nums text-muted">
            cotizado {importe(presupuesto?.monto ?? null) ?? <span className="text-faint">—</span>} · consumido {importe(consumido ?? consumo?.monto ?? null) ?? <span className="text-faint">—</span>}
          </span>
        </div>
        {definicion ? <p className="mt-1 text-[11.5px] leading-snug text-muted">{definicion}</p> : null}
      </summary>
      <div className="grid gap-4 border-t border-line px-3.5 py-3 text-[11.5px] leading-snug sm:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1 font-medium text-ink">En la cotización{fuente ? <span className="font-normal text-faint"> · {fuente}</span> : null}</div>
          {presupuesto?.monto == null ? (
            <p className="text-faint">{presupuesto?.motivo ?? 'sin presupuesto de este rubro'}</p>
          ) : dentro.length === 0 ? (
            <p className="text-faint">{presupuesto.monto === 0 ? 'previsto en cero: ningún insumo de este rubro' : 'sin detalle por insumo'}</p>
          ) : (
            <ul className="flex flex-col gap-px">
              {dentro.slice(0, TOPE).map((d, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 tabular-nums">
                  <span className="truncate text-ink" title={[d.item, d.porque].filter(Boolean).join(' — ')}>
                    {d.item}{d.parte ? <span className="text-faint"> · {d.parte}</span> : null}
                    {d.ajuste ? <span className="text-warn"> · ajuste</span> : null}
                    {d.sinEvidencia ? <span className="text-warn"> · sin evidencia de rubro</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-right text-muted">{cantidad(d) ? <span className="text-faint">{cantidad(d)} · </span> : null}{importe(d.importe)}</span>
                </li>
              ))}
              {dentro.length > TOPE ? <li className="text-faint">y {dentro.length - TOPE} más</li> : null}
            </ul>
          )}
          {fuera.length ? (
            <p className="mt-2 text-faint">
              Fuera de la oferta ({importe(fueraTotal)}): {fuera.slice(0, 5).map((d) => d.item).join(', ')}{fuera.length > 5 ? ` y ${fuera.length - 5} más` : ''}.
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="mb-1 font-medium text-ink">En el gasto{consumo ? <span className="font-normal text-faint"> · {consumo.n} {rotulo === 'Mano de obra' ? (consumo.n === 1 ? 'quincena' : 'quincenas') : (consumo.n === 1 ? 'comprobante' : 'comprobantes')}</span> : null}</div>
          {!consumo || consumo.monto == null ? (
            <p className="text-faint">sin movimiento</p>
          ) : (
            <ul className="flex flex-col gap-px">
              {grupos.slice(0, TOPE).map((g, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 tabular-nums">
                  <span className="truncate text-ink">
                    {g.grupo}
                    {g.horas != null ? <span className="text-faint"> · {Math.round(g.horas).toLocaleString('es-AR')} h · {g.n} {g.n === 1 ? 'persona' : 'personas'}</span> : <span className="text-faint"> · {g.n}</span>}
                    {g.estimado ? <span className="text-warn"> · estimada</span> : null}
                    {g.horasSinDato ? <span className="text-warn"> · {Math.round(g.horasSinDato)} h sin tarifa</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-right text-muted">{importe(g.monto)}</span>
                </li>
              ))}
              {grupos.length > TOPE ? <li className="text-faint">y {grupos.length - TOPE} más</li> : null}
            </ul>
          )}
        </div>
      </div>
    </details>
  )
}
