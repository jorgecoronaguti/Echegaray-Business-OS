// PRESUPUESTO NUEVO — el arranque conversacional del cotizador («Presupuestos v5 · entorno xsas»).
//
// La pantalla de un presupuesto EXISTENTE ya es el entorno (conversación + cola + tabla + cascada).
// Lo que faltaba era el nacimiento: acá se conversa con XSAS hasta que el borrador existe, y la
// pantalla navega sola a `/presupuestos/[id]`. La carga manual clásica sigue viva y enlazada:
// una capacidad nueva no rompe el camino que ya funcionaba.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { ArranqueXsas } from '@/features/presupuestos/components/ArranqueXsas'
import { Aviso } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Presupuesto nuevo' }

export default async function PresupuestoNuevoPage() {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) {
    return (
      <div className="px-4 py-6 lg:px-10">
        <Aviso tono="warn" titulo="Sin permiso" testid="sin-permiso">
          El presupuesto es precio de punta a punta: lo arman Dirección y Administración.
        </Aviso>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Presupuesto nuevo</h1>
        <Link
          href="/presupuestos?nuevo=1"
          data-testid="carga-manual"
          className="text-xs text-slate-500 underline hover:text-slate-800"
        >
          cargarlo a mano
        </Link>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Cotizar es una conversación contra un presupuesto vivo. XSAS lee los planos, computa con
        evidencia y arma el borrador; lo que el plano no dice queda como faltante con nombre — nunca
        como un cero.
      </p>
      <ArranqueXsas />
    </div>
  )
}
