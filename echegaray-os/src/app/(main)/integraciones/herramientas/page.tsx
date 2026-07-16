import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHerramientas } from '@/features/integraciones/services/herramientasService'
import { getMovimientos, type MovimientoConHerramienta } from '@/features/integraciones/services/movimientosService'
import { HerramientasManager } from '@/features/integraciones/components/HerramientasManager'

export const dynamic = 'force-dynamic'

async function loadData() {
  try {
    const supabase = await createClient()
    const [res, movs] = await Promise.all([getHerramientas(supabase), getMovimientos(supabase, 1000)])
    return { res, movs }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error'
    return { res: { data: null, error } as const, movs: { data: null, error } as const }
  }
}

export default async function HerramientasPage() {
  const { res, movs } = await loadData()
  const herramientas = res.data ?? []
  const ubicaciones = [...new Set(herramientas.map((h) => h.ubicacion_actual).filter((u): u is string => !!u))].sort()
  // Movimientos agrupados por herramienta (para el timeline en cada card).
  const movimientosPorHerramienta: Record<string, MovimientoConHerramienta[]> = {}
  for (const m of movs.data ?? []) {
    ;(movimientosPorHerramienta[m.id_herramienta] ??= []).push(m)
  }

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div>
        <div className="text-sm text-gray-500">
          <Link href="/integraciones" className="underline">
            Integraciones
          </Link>{' '}
          / Herramientas
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Herramientas</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Inventario nativo con <strong>foto</strong> y ubicación actual de cada herramienta. Sacá la foto desde el
          celular y queda cargada. Lo que gestionás acá no lo pisa la sincronización del AppSheet.
        </p>
      </div>

      {res.error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
          <p className="font-semibold">No se pudieron leer las herramientas (¿sesión / RLS?).</p>
          <p className="mt-1 text-sm">{res.error}</p>
        </div>
      )}

      <HerramientasManager herramientas={herramientas} ubicaciones={ubicaciones} movimientosPorHerramienta={movimientosPorHerramienta} />
    </div>
  )
}
