import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { PageShell } from '@/shared/components/ui'
import { NavOperacion } from '@/features/integraciones/components/NavOperacion'
import { MovimientosGlobal } from '@/features/integraciones/components/MovimientosGlobal'
import {
  getMovimientosGlobal,
  getPuenteObras,
  type MovimientoGlobal,
} from '@/features/integraciones/services/operacionGlobalService'

// OPERACIÓN · MOVIMIENTOS — el historial de traslados, en todas las obras.

export const dynamic = 'force-dynamic'

async function cargar(): Promise<{ error: string | null; movimientos: MovimientoGlobal[] }> {
  try {
    const supabase = await createClient()
    const puente = await getPuenteObras(supabase)
    if (puente.error !== null) return { error: puente.error, movimientos: [] }
    const movs = await getMovimientosGlobal(supabase, puente.data)
    if (movs.error !== null) return { error: movs.error, movimientos: [] }
    return { error: null, movimientos: movs.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error al conectar con Supabase', movimientos: [] }
  }
}

export default async function MovimientosPage() {
  const { error, movimientos } = await cargar()

  return (
    <PageShell
      title="Operación"
      subtitle="Qué herramienta se movió, adónde y quién la movió. Un movimiento es un hecho con fecha: no se edita."
    >
      <div className="space-y-5">
        <NavOperacion activa="movimientos" cuenta={error ? null : movimientos.length} />

        {error ? (
          <Aviso tono="neg" titulo="No se pudo leer el historial de movimientos." testid="page-error">
            {error}
          </Aviso>
        ) : (
          <MovimientosGlobal movimientos={movimientos} />
        )}
      </div>
    </PageShell>
  )
}
