// LOS RECORTES DE COMPRAS — `v4A:208`, con el componente del patrón v2.
//
// ═══ POR QUÉ DEJA DE SER `Filtros` DE `ds/` ═══
//
// Ese chip es la PASTILLA CON BORDE del canon de agosto, que se llena de grafito al activarse. El
// canvas v4 no dibuja ninguna caja alrededor del recorte: escribe la palabra y su número en una
// línea, y marca el activo con el peso. `FiltrosSuaves` es esa decisión, ya portada y ya en
// producción en Personal y Proveedores — las dos hermanas de esta misma pestaña. Dibujar acá una
// tercera definición del mismo control es exactamente lo que un sistema de componentes evita.
//
// La diferencia contra el canvas queda declarada y es deliberada: el canvas no le pone NINGÚN fondo
// al activo (`v4A:208`, sólo `font-weight:500`) y `FiltrosSuaves` le pone #F2F1ED. Se elige la
// coherencia con las hermanas antes que los 4% de luminosidad de diferencia: un mismo control con
// dos aspectos en la misma pestaña se ve peor que el desvío contra el zip.

import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { FILTROS, ROTULO, type FiltroSheet } from '../services/comprasSheet'

export function FiltrosSheet({
  conteos, activo, hrefDe, sueltos, conteo,
}: {
  conteos: Record<FiltroSheet, number>
  activo: FiltroSheet
  hrefDe: (f: FiltroSheet) => string
  /** Cuántos comprobantes están guardados sin fila. Su chip sólo aparece si hay alguno. */
  sueltos: number
  /** `{ n, total }` — cuánto de la pestaña se está viendo. Lo escribe el patrón al final de la línea. */
  conteo: { n: number; total: number }
}) {
  const visibles = FILTROS.filter((f) => f !== 'sueltos' || sueltos > 0)
  return (
    <FiltrosSuaves
      testid="chip"
      conteo={conteo}
      opciones={visibles.map((f) => ({
        clave: f,
        etiqueta: ROTULO[f],
        href: hrefDe(f),
        activo: f === activo,
        cuenta: f === 'sueltos' ? sueltos : conteos[f],
      }))}
    />
  )
}
