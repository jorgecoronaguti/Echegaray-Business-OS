import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { PageShell } from '@/shared/components/ui'
import { NavOperacion } from '@/features/integraciones/components/NavOperacion'
import { PedidosGlobal } from '@/features/integraciones/components/PedidosGlobal'
import {
  getActividadesDeObras,
  getPedidosGlobal,
  getPuenteObras,
  type PedidoGlobal,
} from '@/features/integraciones/services/operacionGlobalService'
import { asignarActividadPedidoAction } from '@/features/integraciones/services/pedidosActions'
import { fechaHora } from '@/shared/utils/fecha'

// OPERACIÓN · PEDIDOS — bloque 3b del handoff: la lista de la obra, sin acotar por obra.
//
// ═══ SI LA FUENTE FALLA, LA PANTALLA LO DICE CON EL MENSAJE DE LA FUENTE ═══
//
// Estos pedidos son el espejo en Postgres de un Sheet de AppSheet. Cuando la lectura falla —RLS sin
// sesión, la tabla caída— la lista NO se dibuja vacía: una lista vacía por error se lee como «esta
// empresa no pidió nada», que es lo contrario de lo que pasó. Se muestra el error y nada más.

export const dynamic = 'force-dynamic'

const APPSHEET_URL =
  process.env.NEXT_PUBLIC_APPSHEET_PEDIDOS_URL ||
  'https://www.appsheet.com/Template/AppDef?appName=PedidosdeMateriales-659097345'

async function cargar() {
  try {
    const supabase = await createClient()
    const puente = await getPuenteObras(supabase)
    if (puente.error !== null) return { error: puente.error, pedidos: [] as PedidoGlobal[], actividades: {} }
    const pedidos = await getPedidosGlobal(supabase, puente.data)
    if (pedidos.error !== null) return { error: pedidos.error, pedidos: [] as PedidoGlobal[], actividades: {} }
    const obraIds = [...new Set(pedidos.data.map((p) => p.obra_canonica_id).filter((o): o is string => !!o))]
    const actividades = await getActividadesDeObras(supabase, obraIds)
    // Que no se puedan leer las ACTIVIDADES no invalida la lista de pedidos: se pierde el selector
    // «para la actividad», no el dato. Se dice arriba y la lista se dibuja igual.
    return { error: actividades.error, pedidos: pedidos.data, actividades: actividades.data ?? {} }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error al conectar con Supabase', pedidos: [], actividades: {} }
  }
}

export default async function PedidosMaterialesPage() {
  const { error, pedidos, actividades } = await cargar()
  const obras = [...new Set(pedidos.map((p) => p.obra_texto).filter((o): o is string => !!o))].sort()
  const ultimoSync = pedidos.reduce<string | null>(
    (acc, p) => (!acc || p.sincronizado_en > acc ? p.sincronizado_en : acc),
    null,
  )

  return (
    <PageShell
      title="Operación"
      subtitle="Lo pedido, lo que hay en obra y lo que se movió, en todas las obras. Cada fila dice a qué obra pertenece."
      right={
        <a
          href={APPSHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12.5px] text-muted transition-colors hover:text-ink"
        >
          Abrir la app de AppSheet ↗
        </a>
      }
    >
      <div className="space-y-5">
        <NavOperacion activa="pedidos" cuenta={error && pedidos.length === 0 ? null : pedidos.length} />

        {error && (
          <Aviso tono="neg" titulo="No se pudo leer todo lo de esta pantalla." testid="page-error">
            {error}
          </Aviso>
        )}

        {!(error && pedidos.length === 0) && (
          <PedidosGlobal
            pedidos={pedidos}
            obras={obras}
            actividadesPorObra={actividades}
            asignarActividad={asignarActividadPedidoAction}
          />
        )}

        {ultimoSync && (
          <p className="text-[11.5px] text-faint">Última sincronización desde AppSheet: {fechaHora(ultimoSync)}</p>
        )}
      </div>
    </PageShell>
  )
}
