import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getObraDetalle, pedidoPendiente } from '@/features/control-obras/services/controlObrasService'
import { ObraTabs } from '@/features/control-obras/components/ObraTabs'

export const dynamic = 'force-dynamic'

export default async function ObraDetallePage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra: obraParam } = await params
  const nombre = decodeURIComponent(obraParam)

  let error: string | null = null
  let detalle = null
  try {
    const supabase = await createClient()
    const res = await getObraDetalle(supabase, nombre)
    error = res.error
    detalle = res.data
  } catch (err) {
    error = err instanceof Error ? err.message : 'Error desconocido'
  }

  const pendientes = detalle?.pedidos.filter((p) => pedidoPendiente(p.estado)).length ?? 0

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div>
        <Link href="/control-obras" className="text-sm font-medium text-gray-400 hover:text-gray-900">
          ← Todas las obras
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{nombre}</h1>
          {pendientes > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              {pendientes} pedido{pendientes === 1 ? '' : 's'} pendiente{pendientes === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">al día</span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">Vista operativa de la obra. El avance físico y el económico llegan en las próximas fases.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">No se pudo leer la obra.</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {detalle && <ObraTabs detalle={detalle} />}
    </div>
  )
}
