// PRESUPUESTO NUEVO — el entorno de LECTURA DEL PLANO. Pedido textual del dueño (03/09/2026):
// «en el mockup del diseño aparece una parte más conversacional que va determinando los 7 pasos que
// deberían conformar un presupuesto y a la derecha como se va conformando a medida que la
// conversación progresa».
//
// LO QUE ESTO REEMPLAZA: un formulario que mandaba el legajo y esperaba la respuesta ENTERA en el
// mismo request — el timeout que se reportó. `EntornoLecturaPlano` encola con
// `POST /api/presupuestos/cotizar` (contesta con un `id` en <3 s) y arma la lectura sondeando
// `GET /api/presupuestos/cotizar/<id>`: la conversación de la izquierda recibe un turno por paso a
// medida que el backend los publica, y a la derecha el presupuesto se va formando con cada uno.
//
// La pantalla del presupuesto YA EXISTENTE (`/presupuestos/[id]`) es un entorno distinto —conversa
// contra un presupuesto vivo que ya tiene número y versión— y no se toca: acá se hace nacer, ahí se
// trabaja.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { EntornoLecturaPlano } from '@/features/presupuestos/components/EntornoLecturaPlano'
import { Aviso } from '@/shared/components/ds'
import { C } from '@/shared/components/canon'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Presupuesto nuevo' }

/** El mismo alto de barra que usa `/presupuestos/[id]` — las dos columnas de abajo llenan el resto
 *  exacto de la ventana, igual que en el entorno ya existente. */
const BARRA = 45

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
    <div className="flex min-w-0 flex-col" style={{ background: C.fondo }}>
      <div
        data-testid="barra-nuevo"
        className="flex flex-none items-center gap-3 overflow-hidden border-b border-line px-5"
        style={{ height: BARRA - 1, background: C.superficie }}
      >
        <Link href="/presupuestos" className="text-[12px] text-muted">Cartera</Link>
        <span className="text-[12px] text-faint">/</span>
        <span className="text-[13px] font-semibold text-ink">Presupuesto nuevo</span>
        <div className="flex-1" />
        <Link href="/presupuestos?nuevo=1" data-testid="carga-manual" className="text-[12px] text-muted underline hover:text-ink">
          cargarlo a mano
        </Link>
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col" style={{ height: `calc(100dvh - var(--os-header-h) - ${BARRA}px)` }}>
        <EntornoLecturaPlano />
      </div>
    </div>
  )
}
