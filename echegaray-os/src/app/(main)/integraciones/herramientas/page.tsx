import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHerramientas } from '@/features/integraciones/services/herramientasService'
import { HerramientasManager } from '@/features/integraciones/components/HerramientasManager'

export const dynamic = 'force-dynamic'

async function loadData() {
  try {
    const supabase = await createClient()
    return { res: await getHerramientas(supabase) }
  } catch (err) {
    return { res: { data: null, error: err instanceof Error ? err.message : 'Error' } as const }
  }
}

export default async function HerramientasPage() {
  const { res } = await loadData()
  const herramientas = res.data ?? []
  const ubicaciones = [...new Set(herramientas.map((h) => h.ubicacion_actual).filter((u): u is string => !!u))].sort()

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

      <HerramientasManager herramientas={herramientas} ubicaciones={ubicaciones} />
    </div>
  )
}
