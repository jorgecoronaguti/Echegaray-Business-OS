// LA COMPOSICIÓN DE LA PARTIDA, EN TRES SECCIONES — la usan la 15 (panel) y la 16 (pantalla).
//
// Un solo componente para las dos porque es el mismo dato con distinta densidad. Escribirlo dos
// veces garantiza que dentro de un mes el panel y la pantalla muestren dos desgloses distintos de
// la misma partida — y quien los vea no va a saber cuál creer.
//
// ═══ LO QUE NO TIENE PRECIO SE DICE, NO SE SUMA COMO CERO ═══
//
// Un recurso sin precio cargado en la base maestra deja la línea en «sin precio». El total de la
// sección la excluye y el pie cuenta cuántas hay. Sumarla como cero daría un total más chico que
// el real, plausible y equivocado.

import { Nulo } from '@/shared/components/ds'
import type { Desglose, Seccion } from '../services/composicion'
import { cantidad as fCantidad, importe, porcentaje } from '../services/formato'

const ROTULO: Record<Seccion['clave'], string> = {
  mano_obra: 'text-pos',
  materiales: 'text-faint',
  equipos: 'text-faint',
  otros: 'text-faint',
}

export function TablaComposicion({
  desglose,
  compacta = false,
  testid = 'composicion',
}: {
  desglose: Desglose
  /** El panel de la 15 va apretado; la pantalla 16 muestra los encabezados de columna. */
  compacta?: boolean
  testid?: string
}) {
  if (desglose.secciones.length === 0) {
    return (
      <p className="py-4 text-[12.5px] text-warn" data-testid={`${testid}-vacia`}>
        Sin análisis cargado: esta partida no tiene composición. Se cotiza igual, y queda como deuda
        de carga hasta que alguien la complete.
      </p>
    )
  }

  return (
    <div data-testid={testid}>
      {desglose.secciones.map((s) => (
        <section key={s.clave} className="mt-3.5 first:mt-0">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className={`text-[10px] font-medium uppercase tracking-[0.06em] ${ROTULO[s.clave]}`}>
              {s.rotulo}
            </h4>
            {s.sinPrecio > 0 && (
              <span className="text-[10px] text-warn" data-testid="sin-precio">
                {s.sinPrecio} sin precio
              </span>
            )}
          </div>

          {!compacta && (
            <div className="mt-1 grid grid-cols-[minmax(130px,1fr)_76px_44px_80px_90px] gap-x-2 border-b border-[#EFEEEA] pb-1 text-[10px] uppercase tracking-[0.05em] text-faint">
              <span>{s.primeraColumna}</span>
              <span className="text-right">Cant.</span>
              <span>Un.</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Subtotal</span>
            </div>
          )}

          {s.lineas.map((l, i) => (
            <div
              key={`${l.recurso_codigo ?? l.recurso_nombre}-${i}`}
              data-testid="linea-composicion"
              className={`grid items-baseline gap-x-2 border-b border-[#EFEEEA] py-1.5 ${
                compacta
                  ? 'grid-cols-[1fr_48px_60px_72px]'
                  : 'grid-cols-[minmax(130px,1fr)_76px_44px_80px_90px]'
              } ${l.tipo === 'carga_social' ? 'bg-[#FEF9E6]' : ''}`}
            >
              <span className="min-w-0 text-[12px] text-ink-soft">
                {l.recurso_nombre}
                {/* El desperdicio no es un detalle estético: explica por qué el precio de la línea
                    no es el precio de lista del insumo. */}
                {l.desperdicio !== null && l.desperdicio > 0 && (
                  <span className="block text-[10px] text-faint">
                    desperdicio {porcentaje(l.desperdicio * 100, 'auto')}
                  </span>
                )}
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums text-ink-soft">
                {fCantidad(l.cantidad)}
              </span>
              {!compacta && <span className="text-[11px] text-muted">{l.unidad ?? '—'}</span>}
              <span className="text-right font-mono text-[11px] tabular-nums text-muted">
                {l.tipo === 'carga_social' ? <span className="text-[10px] text-faint">calculado</span>
                  : importe(l.costo_unitario) ?? <span className="text-[10px] text-warn">sin precio</span>}
              </span>
              <span className={`text-right font-mono text-[11px] tabular-nums ${l.tipo === 'carga_social' ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                {importe(l.subtotal) ?? <Nulo>—</Nulo>}
              </span>
            </div>
          ))}

          <div className="flex items-baseline justify-between gap-3 pt-1.5">
            <span className="text-[11.5px] text-muted">Total {s.rotulo.toLowerCase()}</span>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">
              {importe(s.total) ?? <Nulo>sin cargar</Nulo>}
            </span>
          </div>
        </section>
      ))}
    </div>
  )
}
