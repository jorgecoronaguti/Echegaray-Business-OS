import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPedidosMateriales } from '@/features/integraciones/services/pedidosMaterialesService'
import { PedidosManager } from '@/features/integraciones/components/PedidosManager'

export const dynamic = 'force-dynamic'

// URL del AppSheet (editor que pasó el dueño). Configurable por env para el runtime embebido.
const APPSHEET_URL =
  process.env.NEXT_PUBLIC_APPSHEET_PEDIDOS_URL ||
  'https://www.appsheet.com/Template/AppDef?appName=PedidosdeMateriales-659097345'
const APPSHEET_EMBED = process.env.NEXT_PUBLIC_APPSHEET_PEDIDOS_EMBED || null

async function loadData() {
  try {
    const supabase = await createClient()
    return { res: await getPedidosMateriales(supabase) }
  } catch (err) {
    return { res: { data: null, error: err instanceof Error ? err.message : 'Error' } as const }
  }
}

export default async function PedidosMaterialesPage() {
  const { res } = await loadData()
  const pedidos = res.data ?? []
  const obras = [...new Set(pedidos.map((p) => p.obra_texto).filter((o): o is string => !!o))].sort()
  const ultimoSync = pedidos.reduce<string | null>((acc, p) => (!acc || p.sincronizado_en > acc ? p.sincronizado_en : acc), null)

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">
            <Link href="/integraciones" className="underline">
              Integraciones
            </Link>{' '}
            / Pedidos de Materiales
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Pedidos de Materiales</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Módulo nativo del OS: cargá, editá y seguí los pedidos acá mismo. La app AppSheet sigue disponible durante la
            transición; lo que gestionás en el OS no lo pisa la sincronización.
          </p>
        </div>
        <a
          href={APPSHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Abrir AppSheet ↗
        </a>
      </div>

      {res.error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
          <p className="font-semibold">No se pudo leer pedidos (¿sesión / RLS?).</p>
          <p className="mt-1 text-sm">{res.error}</p>
        </div>
      )}

      {ultimoSync && (
        <p className="text-xs text-gray-400">Última sincronización desde AppSheet: {new Date(ultimoSync).toLocaleString('es-AR')}</p>
      )}

      <PedidosManager pedidos={pedidos} obras={obras} />

      {APPSHEET_EMBED && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">App en vivo (AppSheet)</h2>
          <iframe
            src={APPSHEET_EMBED}
            className="h-[720px] w-full rounded-lg border"
            title="Pedidos de Materiales (AppSheet)"
          />
        </div>
      )}
    </div>
  )
}
