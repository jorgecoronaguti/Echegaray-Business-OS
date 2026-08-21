// LA CASCADA DE PRECIO A ANCHO COMPLETO — pantalla 15.
//
// Costo directo `+` indirectos `+` gastos generales `+` margen `+` impuestos `=` precio de venta.
// Los signos entre bloques no son decoración: son la única explicación de por qué el último número
// es más grande que el primero, y sin ellos la fila se lee como cinco métricas sueltas.
//
// Ninguno de estos importes se calcula acá. Salen de `cotizacion_cascada`, que es la ÚNICA cascada
// del sistema. En el Excel esta misma cuenta vivía dos veces y no coincidían.

import { Nulo } from '@/shared/components/ds'
import type { PresupuestoCascada } from '../types'
import { escalonesDe } from '../services/cascada'
import { plata, porcentajeDeFraccion } from '../services/formato'

export function CascadaPrecio({ p }: { p: PresupuestoCascada }) {
  const escalones = escalonesDe(p)
  return (
    <div
      data-testid="cascada-precio"
      className="flex flex-wrap items-stretch gap-x-2 gap-y-3 border-b border-line py-4"
    >
      {escalones.map((e, i) => (
        <div key={e.clave} className="flex min-w-0 items-stretch gap-x-2">
          {i > 0 && (
            <span aria-hidden className="self-center text-[15px] font-medium text-faint">
              {e.final ? '=' : '+'}
            </span>
          )}
          <div className="min-w-0 px-1" data-escalon={e.clave}>
            <div className="whitespace-nowrap text-[10px] uppercase tracking-[0.05em] text-faint">
              {e.rotulo}
              {e.pct !== null && (
                <span className="ml-1 font-mono tabular-nums">{porcentajeDeFraccion(e.pct, 'auto')}</span>
              )}
            </div>
            <div
              className={`mt-0.5 font-mono font-semibold tabular-nums ${
                e.final ? 'text-[22px] text-ink' : e.clave === 'costo_directo' ? 'text-[19px] text-ink' : 'text-[17px] text-ink-soft'
              }`}
            >
              {plata(e.monto) ?? <Nulo>sin cargar</Nulo>}
            </div>
            <div className="text-[11px] text-faint">{e.subtitulo}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
