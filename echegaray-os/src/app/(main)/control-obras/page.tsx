import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getResumenPorObra, type ResumenObra } from '@/features/integraciones/services/resumenPorObraService'

export const dynamic = 'force-dynamic'

// CONTROL DE OBRAS — cartera (Fase 1 del roadmap aprobado). La obra como columna vertebral:
// una foto operativa de todas las obras (herramientas + pedidos pendientes), y desde cada una
// se baja al detalle. Reusa getResumenPorObra (deriva de datos reales, cero SQL nuevo). El
// avance físico y el económico llegan en las Fases 2-4.

async function load() {
  try {
    const supabase = await createClient()
    return await getResumenPorObra(supabase)
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' } as const
  }
}

export default async function ControlObrasPage() {
  const { data, error } = await load()
  const obras: ResumenObra[] = data ?? []
  const conPendientes = obras.filter((o) => o.pedidosPendientes > 0).length
  const totalHerr = obras.reduce((a, o) => a + o.herramientas, 0)

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Control de obras</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Todas las obras de un vistazo, por actividad operativa. Tocá una obra para ver su avance físico,
            herramientas, pedidos, movimientos y el costo real.
          </p>
        </div>
        <Link
          href="/control-obras/costos"
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-gray-900"
        >
          Asignar costos (ARCA) →
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">No se pudieron leer las obras.</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {!error && (
        <div className="flex flex-wrap gap-3">
          <Kpi n={obras.length} label="Obras con actividad" />
          <Kpi n={conPendientes} label="Con pedidos pendientes" tone={conPendientes > 0 ? 'amber' : 'gray'} />
          <Kpi n={totalHerr} label="Herramientas en obra" />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {obras.map((o) => {
          const alerta = o.pedidosPendientes > 0
          return (
            <Link
              key={o.obra}
              href={`/control-obras/${encodeURIComponent(o.obra)}`}
              prefetch={false}
              className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-900"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${alerta ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <div className="flex items-start justify-between gap-2 pl-2">
                <h2 className="text-lg font-semibold text-gray-900">{o.obra}</h2>
                {alerta ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    {o.pedidosPendientes} pendiente{o.pedidosPendientes === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    al día
                  </span>
                )}
              </div>
              <div className="mt-4 flex gap-6 border-t border-gray-100 pt-3 pl-2">
                <Dato k="Herramientas" v={o.herramientas} />
                <Dato k="Pedidos" v={o.pedidosTotal} />
              </div>
              <span className="mt-3 block pl-2 text-sm font-medium text-gray-400 group-hover:text-gray-900">
                Ver obra →
              </span>
            </Link>
          )
        })}
        {!error && obras.length === 0 && (
          <p className="text-gray-400">Todavía no hay obras con actividad operativa registrada.</p>
        )}
      </div>
    </div>
  )
}

function Kpi({ n, label, tone = 'gray' }: { n: number; label: string; tone?: 'gray' | 'amber' }) {
  const cls = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-50 text-gray-700'
  return (
    <div className={`rounded-lg border px-4 py-2 ${cls}`}>
      <div className="text-2xl font-bold tabular-nums">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] tracking-wide text-gray-400 uppercase">{k}</span>
      <span className="text-lg font-bold tabular-nums text-gray-900">{v}</span>
    </div>
  )
}
