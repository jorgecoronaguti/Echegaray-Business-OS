// LOS PRESUPUESTOS DE ESTE CLIENTE — solapa «Presupuestos» del canónico 26.
//
// El mockup dibuja una lista, no una tabla: ícono de estado · nombre · una línea gris con la
// lectura del estado · monto a la derecha. Es la forma correcta acá porque la comparación entre
// presupuestos de un mismo cliente se hace por ESTADO («¿cuál quedó sin contestar?»), no por
// columnas: quien quiere comparar cifras entra a la cartera, que ya es esa tabla.
//
// ═══ NO SE CALCULA NADA ═══
//
// El precio sale de `cotizacion_cascada`, que es la única definición de la cascada del OS. La tasa
// de conversión que el mockup pone en la cabecera se cuenta sobre los presupuestos CERRADOS
// —ganados sobre ganados + perdidos—: incluir los que todavía están abiertos daría una tasa que
// baja sola con cada cotización nueva, que es exactamente lo contrario de lo que mide.
//
// FRONTERA: acá no se muestra margen. Es la prohibición viva del resumen (canon 23/08): el margen
// se lee en el presupuesto, con su cascada al lado, no en una lista donde no se puede auditar.

import Link from 'next/link'
import { Nulo, Num, Vacio } from '@/shared/components/ds'
import { plata } from '@/features/obras/components/formato'
import { lecturaEstado } from '@/features/presupuestos/services/estado'
import type { PresupuestoCascada } from '@/features/presupuestos/types'

/** Ganados sobre cerrados. `null` cuando ninguno cerró: sin cerrados no hay tasa, hay silencio. */
export function tasaDeConversion(ps: PresupuestoCascada[]): number | null {
  const ganados = ps.filter((p) => p.estado === 'adjudicada').length
  const perdidos = ps.filter((p) => p.estado === 'perdida').length
  const cerrados = ganados + perdidos
  return cerrados === 0 ? null : Math.round((ganados / cerrados) * 100)
}

const TONO: Record<string, string> = {
  pos: 'text-pos', neg: 'text-neg', warn: 'text-warn', info: 'text-info', nulo: 'text-faint',
}

export function FichaPresupuestos({ presupuestos }: { presupuestos: PresupuestoCascada[] }) {
  if (presupuestos.length === 0) {
    return <Vacio>Este cliente no tiene presupuestos cargados.</Vacio>
  }
  const tasa = tasaDeConversion(presupuestos)
  return (
    <div data-testid="ficha-presupuestos">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] text-faint">
          {presupuestos.length === 1 ? '1 presupuesto' : `${presupuestos.length} presupuestos`}
        </span>
        {/* SIN CERRADOS NO SE ESCRIBE UNA TASA: «0 %» sobre tres presupuestos abiertos diría que se
            perdieron, y no se perdió ninguno todavía. */}
        <span className="text-[11.5px] text-muted">
          {tasa === null
            ? 'ninguno cerrado todavía'
            : <>tasa de conversión <Num className="text-[12px] text-ink">{tasa} %</Num></>}
        </span>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {presupuestos.map((p) => {
          const e = lecturaEstado(p.estado)
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/presupuestos/${p.id}`}
                  prefetch={false}
                  data-testid="presupuesto-del-cliente"
                  className="block truncate text-[12.5px] text-ink hover:underline"
                >
                  {p.obra_nombre?.trim() || p.numero || 'sin nombre'}
                </Link>
                <div className="mt-0.5 truncate text-[11px]">
                  <span className={TONO[e.tono] ?? 'text-faint'}>{e.label}</span>
                  {p.version > 1 && <span className="text-faint"> · rev {p.version}</span>}
                  {!p.vigente && <span className="text-faint"> · no vigente</span>}
                </div>
              </div>
              {/* NULL NO ES $ 0: un presupuesto sin cascada cerrada no vale cero, no se sabe cuánto
                  vale. Publicarlo en cero lo haría comparable con los demás, y no lo es. */}
              <span className="shrink-0">
                {p.precio_venta == null
                  ? <Nulo>sin precio</Nulo>
                  : <Num className="text-[12px] text-ink">{plata(p.precio_venta)}</Num>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
