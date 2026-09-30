import { fechaCorta } from '../logica/acopio'
import { textoStock } from '../logica/stock'

// «MATERIAL ACOPIADO EN TALLER PARA ESTA OBRA» — el dato que la obra necesita para no volver a pedir lo que ya
// está guardado (dueño, 30/09/2026). Sin estado ni cliente: se dibuja igual en Obras › Operación › Pedidos y en
// el «Hoy» del jefe. Sin acopio no se dibuja nada: un bloque vacío permanente es ruido en 390 px.

export function AcopioDeLaObra({ items }: { items: Array<{ material: string; unidad: string | null; cantidad: number; desde: string | null }> | null }) {
  if (!items || items.length === 0) return null
  return (
    <section className="mt-6 max-md:mx-4" data-testid="acopio-de-la-obra">
      <h3 className="mb-1 border-b border-line pb-1.5 text-[12px] font-semibold text-muted">Material acopiado en el Taller para esta obra</h3>
      <ul>
        {items.map((i, k) => (
          <li key={`${i.material}-${k}`} className="flex min-h-[44px] items-center gap-3 border-b border-line/60 py-1 text-[14px] md:min-h-[36px] md:text-[13px]" data-testid="acopio-fila">
            <span className="min-w-0 flex-1 truncate text-ink">{i.material}</span>
            {i.desde && <span className="text-[12px] text-faint">desde {fechaCorta(i.desde)}</span>}
            <span className="font-mono tabular-nums text-ink">{textoStock(i.cantidad, i.unidad)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
