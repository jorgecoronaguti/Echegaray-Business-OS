import { createClient } from '@/lib/supabase/server'
import { getPendingOperations } from '@/features/aprobaciones/services/aprobacionesService'
import { OperacionCard } from '@/features/aprobaciones/components/OperacionCard'
import type { PendingOperation } from '@/features/aprobaciones/types'

// Cola de aprobación (PRP-014 F5). Los especialistas dejan acá las operaciones de
// efecto externo (Nivel E: mail.send / drive.write) con su borrador real. Dirección
// aprueba/rechaza; al aprobar, el worker ejecuta de forma diferida e idempotente.

export const dynamic = 'force-dynamic'

export default async function AprobacionesPage() {
  let ops: PendingOperation[] = []
  let error: string | null = null
  try {
    const supabase = await createClient()
    const res = await getPendingOperations(supabase)
    if (res.error) error = res.error
    else ops = res.data ?? []
  } catch (err) {
    error = err instanceof Error ? err.message : 'Error al conectar con Supabase'
  }

  const isAuthError = error?.toLowerCase().includes('permission denied') ?? false
  const pendientes = ops.filter((o) => o.status === 'awaiting_approval')
  const resto = ops.filter((o) => o.status !== 'awaiting_approval')

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Aprobaciones</h1>
        <p className="text-sm text-slate-500">
          Operaciones de efecto externo (enviar mail, editar un archivo) que los especialistas prepararon y esperan
          tu decisión. Nada se ejecuta sin tu aprobación.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {isAuthError ? 'Iniciá sesión para operar la cola de aprobación.' : `No se pudo cargar: ${error}`}
        </div>
      )}

      <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pendientes ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-slate-400">No hay operaciones esperando aprobación.</p>
        ) : (
          <ul className="space-y-4">
            {pendientes.map((op) => (
              <OperacionCard key={op.id} op={op} />
            ))}
          </ul>
        )}
      </section>

      {resto.length > 0 && (
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Historial reciente</h2>
          <ul className="space-y-4">
            {resto.map((op) => (
              <OperacionCard key={op.id} op={op} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
