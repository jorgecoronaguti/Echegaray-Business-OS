import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPedidosMateriales, type PedidoMaterial } from '@/features/integraciones/services/pedidosMaterialesService'

export const dynamic = 'force-dynamic'

// URL del AppSheet (editor que pasó el dueño). Configurable por env para el runtime embebido.
const APPSHEET_URL =
  process.env.NEXT_PUBLIC_APPSHEET_PEDIDOS_URL ||
  'https://www.appsheet.com/Template/AppDef?appName=PedidosdeMateriales-659097345'
const APPSHEET_EMBED = process.env.NEXT_PUBLIC_APPSHEET_PEDIDOS_EMBED || null

const ESTADO_BADGE: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  ENTREGADO: 'bg-emerald-100 text-emerald-800',
}

function fechaAR(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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
  const pendientes = pedidos.filter((p) => (p.estado || '').toUpperCase() === 'PENDIENTE').length
  const sinObra = pedidos.filter((p) => !p.obra_id).length
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
          <h1 className="mt-1 text-3xl font-bold">Pedidos de Materiales</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            App de campo (AppSheet) que el OS tomó bajo su gestión. El OS espeja el Sheet de respaldo en su base, donde
            queda consultable y cruzable con las obras. La carga en campo sigue en la app; acá se ve y se gobierna.
          </p>
        </div>
        <a
          href={APPSHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Abrir en AppSheet ↗
        </a>
      </div>

      {res.error && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="page-error">
          <p className="font-semibold">No se pudo leer pedidos (¿sesión / RLS?).</p>
          <p className="mt-1 text-sm">{res.error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3" data-testid="resumen-pedidos">
        <Stat n={pedidos.length} label="Pedidos" />
        <Stat n={pendientes} label="Pendientes" tone="amber" />
        <Stat n={sinObra} label="Sin obra en el OS" tone={sinObra ? 'red' : 'gray'} />
      </div>
      {ultimoSync && (
        <p className="text-xs text-gray-400">
          Último sync desde el Sheet: {new Date(ultimoSync).toLocaleString('es-AR')}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm" data-testid="tabla-pedidos">
          <thead className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Obra</th>
              <th className="px-4 py-2">Material</th>
              <th className="px-4 py-2 text-right">Cant.</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p: PedidoMaterial) => (
              <tr key={p.id_pedido} className="border-b last:border-0">
                <td className="px-4 py-2 text-gray-400">{p.id_pedido}</td>
                <td className="px-4 py-2 whitespace-nowrap">{fechaAR(p.fecha)}</td>
                <td className="px-4 py-2">
                  {p.obra_texto || '—'}
                  {!p.obra_id && p.obra_texto && (
                    <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-600">sin match</span>
                  )}
                </td>
                <td className="px-4 py-2">{p.material || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.cantidad ?? '—'}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE[(p.estado || '').toUpperCase()] || 'bg-gray-100 text-gray-700'}`}
                  >
                    {p.estado || '—'}
                  </span>
                </td>
              </tr>
            ))}
            {pedidos.length === 0 && !res.error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Sin pedidos sincronizados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sinObra > 0 && (
        <p className="text-sm text-amber-700">
          {sinObra} pedido(s) apuntan a obras que no existen en el OS (la app usa nombres/códigos propios como
          &quot;San Francisco&quot;, &quot;OB1&quot;). Cruzarlos requiere unificar el maestro de obras.
        </p>
      )}

      {APPSHEET_EMBED && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">App en vivo</h2>
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

function Stat({ n, label, tone = 'gray' }: { n: number; label: string; tone?: 'gray' | 'amber' | 'red' }) {
  const cls = {
    gray: 'border-gray-200 bg-gray-50 text-gray-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  }[tone]
  return (
    <div className={`rounded-lg border px-4 py-2 ${cls}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  )
}
