// LOS CHIPS DE LA PANTALLA 24, sobre la pestaña Compras.
//
// Reusa `Filtros` de `ds/` —la misma pastilla medida contra este mismo canónico el 24/08— en vez de
// dibujar una segunda: dos definiciones del mismo objeto es justo lo que un sistema de componentes
// existe para evitar.

import { Filtros } from '@/shared/components/ds'
import { FILTROS, ROTULO, type FiltroSheet } from '../services/comprasSheet'

export function FiltrosSheet({
  conteos, activo, hrefDe, sueltos,
}: {
  conteos: Record<FiltroSheet, number>
  activo: FiltroSheet
  hrefDe: (f: FiltroSheet) => string
  /** Cuántos comprobantes están guardados sin fila. Su chip sólo aparece si hay alguno. */
  sueltos: number
}) {
  const visibles = FILTROS.filter((f) => f !== 'sueltos' || sueltos > 0)
  return (
    <Filtros
      testid="filtros-compras-sheet"
      opciones={visibles.map((f) => ({
        href: hrefDe(f),
        activo: f === activo,
        testid: `chip-${f}`,
        label: (
          <>
            {ROTULO[f]}
            <span className={`font-mono text-[10.5px] tabular-nums ${f === activo ? 'text-white/65' : 'text-faint'}`}>
              {(f === 'sueltos' ? sueltos : conteos[f]).toLocaleString('es-AR')}
            </span>
          </>
        ),
      }))}
    />
  )
}
