import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMovimientos } from '@/features/integraciones/services/movimientosService'

export const dynamic = 'force-dynamic'

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

async function loadData() {
  try {
    const supabase = await createClient()
    return { res: await getMovimientos(supabase) }
  } catch (err) {
    return { res: { data: null, error: err instanceof Error ? err.message : 'Error' } as const }
  }
}

export default async function MovimientosPage() {
  const { res } = await loadData()
  const movs = res.data ?? []

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div>
        <div className="text-sm text-gray-500">
          <Link href="/integraciones/herramientas" className="underline">
            Herramientas
          </Link>{' '}
          / Movimientos
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Movimientos de herramientas</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Historial de traslados: qué herramienta, adónde y quién la movió. Cada movimiento registrado en el OS actualiza
          la ubicación actual de la herramienta.
        </p>
      </div>

      {res.error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
          <p className="font-semibold">No se pudo leer el historial (¿sesión / RLS?).</p>
          <p className="mt-1 text-sm">{res.error}</p>
        </div>
      )}

      {movs.length === 0 && !res.error ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
          Sin movimientos registrados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Herramienta</th>
                <th className="px-4 py-2.5">Destino</th>
                <th className="px-4 py-2.5">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movs.map((m) => (
                <tr key={m.id_movimiento} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">{fechaHora(m.fecha)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{m.herramienta_nombre || m.id_herramienta}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">{m.destino || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{m.responsable || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-center text-xs text-gray-400">{movs.length} movimiento(s)</p>
    </div>
  )
}
