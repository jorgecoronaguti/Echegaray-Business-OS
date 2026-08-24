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

/** La incidencia de la sección sobre el desglose, para el rótulo «N % del costo» del Design 23/08. */
const INCIDENCIA: Record<Seccion['clave'], keyof Desglose['incidencia'] | null> = {
  mano_obra: 'mano_obra',
  materiales: 'materiales',
  equipos: 'equipos',
  otros: null,
}

export function TablaComposicion({
  desglose,
  compacta = false,
  unidad = null,
  testid = 'composicion',
}: {
  desglose: Desglose
  /** El panel de la 15 va apretado; la pantalla 16 muestra los encabezados de columna. */
  compacta?: boolean
  /** La unidad de la partida, para el encabezado «CANT. / m²» del canon 16. Sin ella, «Cant.». */
  unidad?: string | null
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
        <section
          key={s.clave}
          className={compacta
            ? 'mt-3.5 first:mt-0'
            : 'mt-4 overflow-hidden rounded-card border border-line bg-surface first:mt-0'}
        >
          {/* EL SUBTOTAL VA EN LA CABECERA DE LA SECCIÓN, NO AL PIE (Design 23/08 · pantalla 16).
              Al pie obligaba a leer las cinco líneas para recién enterarse de cuánto pesa el bloque;
              arriba, «MATERIALES · 87 % del costo · $ 21.990,00» contesta antes de mirar el detalle,
              que es todo el punto de un análisis de precio unitario. */}
          <div className={`flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] ${
            compacta ? 'pb-1' : 'px-4 py-3'
          }`}>
            <h4 className="flex items-baseline gap-2">
              {/* EL NOMBRE DE LA FAMILIA EN TAMAÑO DE TÍTULO (canon 16), no en versalita de
                  encabezado de columna: cada tarjeta ES un bloque del precio unitario, y en
                  versalita competía de igual a igual con «INSUMO», que es sólo un rótulo. */}
              <span className={compacta
                ? `text-[10px] font-medium uppercase tracking-[0.06em] ${ROTULO[s.clave]}`
                : 'text-[15px] font-semibold text-ink'}
              >
                {compacta ? s.rotulo : s.rotulo.charAt(0) + s.rotulo.slice(1).toLowerCase()}
              </span>
              <Parte desglose={desglose} clave={s.clave} />
            </h4>
            <span className="flex items-baseline gap-2.5">
              {s.sinPrecio > 0 && (
                <span className="text-[10px] text-warn" data-testid="sin-precio">
                  {s.sinPrecio} sin precio
                </span>
              )}
              <span className={`font-mono font-semibold tabular-nums text-ink ${compacta ? 'text-[13px]' : 'text-[15px]'}`}>
                {importe(s.total) ?? <Nulo>sin cargar</Nulo>}
              </span>
            </span>
          </div>

          {!compacta && (
            <div className="grid grid-cols-[minmax(130px,1fr)_44px_86px_90px_100px] gap-x-2 border-b border-[#EFEEEA] bg-surface-quiet px-4 py-1.5 text-[10px] uppercase tracking-[0.05em] text-faint">
              <span>{s.primeraColumna}</span>
              <span>Un.</span>
              {/* «CANT. / m²» dice de una vez que el análisis es POR UNIDAD de la partida: sin el
                  divisor, 0,105 se lee como el cómputo entero y no como lo que entra en un m². */}
              <span className="text-right">{unidad ? `Cant. / ${unidad}` : 'Cant.'}</span>
              <span className="text-right">$ unit.</span>
              <span className="text-right">Subtotal</span>
            </div>
          )}

          {s.lineas.map((l, i) => (
            <div
              key={`${l.recurso_codigo ?? l.recurso_nombre}-${i}`}
              data-testid="linea-composicion"
              className={`grid items-baseline gap-x-2 border-b border-[#EFEEEA] last:border-0 ${
                compacta
                  ? 'grid-cols-[1fr_48px_60px_72px] py-1.5'
                  : 'grid-cols-[minmax(130px,1fr)_44px_86px_90px_100px] px-4 py-2'
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
              {!compacta && <span className="text-[11px] text-muted">{l.unidad ?? '—'}</span>}
              <span className={`text-right font-mono tabular-nums text-ink-soft ${compacta ? 'text-[11px]' : 'text-[11.5px]'}`}>
                {fCantidad(l.cantidad)}
              </span>
              <span className="text-right font-mono text-[11px] tabular-nums text-muted">
                {l.tipo === 'carga_social' ? <span className="text-[10px] text-faint">calculado</span>
                  : importe(l.costo_unitario) ?? <span className="text-[10px] text-warn">sin precio</span>}
              </span>
              <span className={`text-right font-mono text-[11px] tabular-nums ${l.tipo === 'carga_social' ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                {importe(l.subtotal) ?? <Nulo>—</Nulo>}
              </span>
            </div>
          ))}

        </section>
      ))}
    </div>
  )
}

function Parte({ desglose, clave }: { desglose: Desglose; clave: Seccion['clave'] }) {
  const k = INCIDENCIA[clave]
  const pct = k === null ? null : desglose.incidencia[k]
  if (pct === null) return null
  return (
    <span className="font-mono text-[10.5px] tabular-nums text-faint">
      {porcentaje(pct, 'auto')} del costo
    </span>
  )
}
