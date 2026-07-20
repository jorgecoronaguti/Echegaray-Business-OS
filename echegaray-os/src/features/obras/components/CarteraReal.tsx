import type { ObraPanel } from '../services/obraPanelService'
import { ordenarCartera } from '../services/obraPanelService'

// Cartera real de obras, desde la fuente única (`obra_panel`). Muestra lo que el OS sabe y marca
// con "—" lo que no sabe: un dato faltante NUNCA se rellena con 0 ni se disfraza de resultado.

const money = (v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

const ESTADO_CLASS: Record<string, string> = {
  activa: 'bg-emerald-100 text-emerald-800',
  contratada: 'bg-sky-100 text-sky-800',
  pausada: 'bg-amber-100 text-amber-800',
  cerrada: 'bg-slate-200 text-slate-700',
}

export function CarteraReal({ obras }: { obras: ObraPanel[] }) {
  if (!obras.length) {
    return <p className="text-sm text-slate-500">No hay obras en el eje canónico.</p>
  }
  const orden = ordenarCartera(obras)
  const activas = orden.filter((o) => o.estado === 'activa')
  const costoActivas = activas.reduce((a, o) => a + o.costo_real, 0)

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Cartera de obras</h2>
        <p className="text-sm text-slate-600">
          {activas.length} activa{activas.length === 1 ? '' : 's'} · costo real acumulado {money(costoActivas)}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Obra</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3 text-right tabular-nums">Costo real</th>
              <th className="py-2 pr-3 text-right tabular-nums">Contratado</th>
              <th className="py-2 pr-3 text-right tabular-nums">Margen</th>
              <th className="py-2 text-right tabular-nums">Comprob.</th>
            </tr>
          </thead>
          <tbody>
            {orden.map((o) => (
              <tr key={o.obra_id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-900">{o.obra_nombre}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[o.estado] ?? 'bg-slate-100 text-slate-700'}`}>
                    {o.estado}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(o.costo_real)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                  {o.monto_contratado === null ? <span title="El OS no tiene el monto contratado de esta obra">—</span> : money(o.monto_contratado)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {o.margen_sobre_contratado_pct === null ? (
                    <span className="text-slate-400" title="Falta el contratado o el costo real: sin las dos puntas no hay margen que calcular">—</span>
                  ) : (
                    <span className={o.margen_sobre_contratado_pct < 10 ? 'font-semibold text-red-700' : 'text-slate-900'}>
                      {o.margen_sobre_contratado_pct.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-500">{o.n_comprobantes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Fuente única <code>obra_panel</code> — lo mismo que responde el chat. Un “—” significa que el dato no existe
        todavía, no que valga cero.
      </p>
    </section>
  )
}
