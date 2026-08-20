import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { anchoSplit } from '@/shared/components/ds/split-servidor'
import { PageShell } from '@/shared/components/ui'
import { NavOperacion } from '@/features/integraciones/components/NavOperacion'
import { HerramientasWorkspace } from '@/features/integraciones/components/HerramientasWorkspace'
import {
  getHerramientasGlobal,
  getMovimientosGlobal,
  getPuenteObras,
  type HerramientaGlobal,
} from '@/features/integraciones/services/operacionGlobalService'
import type { MovimientoConHerramienta } from '@/features/integraciones/services/movimientosService'

// OPERACIÓN · HERRAMIENTAS — bloque 3c: el inventario y la ficha del equipo.
//
// Los movimientos se leen ACÁ y se agrupan por herramienta: la ficha necesita el historial de la que
// está seleccionada, y pedirlo por herramienta serían 149 consultas para pintar una pantalla.

export const dynamic = 'force-dynamic'

async function cargar() {
  const vacio = { error: null as string | null, herramientas: [] as HerramientaGlobal[], movs: [] as MovimientoConHerramienta[] }
  try {
    const supabase = await createClient()
    const puente = await getPuenteObras(supabase)
    if (puente.error !== null) return { ...vacio, error: puente.error }
    const [herramientas, movimientos] = await Promise.all([
      getHerramientasGlobal(supabase, puente.data),
      getMovimientosGlobal(supabase, puente.data),
    ])
    if (herramientas.error !== null) return { ...vacio, error: herramientas.error }
    // Que fallen los MOVIMIENTOS no invalida el inventario: se pierde el historial de la ficha, no
    // la lista. Se dice arriba y el inventario se dibuja igual.
    return { error: movimientos.error, herramientas: herramientas.data, movs: movimientos.data ?? [] }
  } catch (err) {
    return { ...vacio, error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}

export default async function HerramientasPage() {
  const { error, herramientas, movs } = await cargar()
  const ancho = await anchoSplit('herramientas', 400, 340, 520)

  const movimientosPorHerramienta: Record<string, MovimientoConHerramienta[]> = {}
  for (const m of movs) (movimientosPorHerramienta[m.id_herramienta] ??= []).push(m)

  const roto = Boolean(error) && herramientas.length === 0

  return (
    <PageShell
      title="Operación"
      subtitle="Qué herramientas hay, dónde están y quién las tiene. El responsable sale del último movimiento registrado."
    >
      <div className="space-y-5">
        <NavOperacion activa="herramientas" cuenta={roto ? null : herramientas.length} />

        {error && (
          <Aviso tono="neg" titulo="No se pudo leer todo lo de esta pantalla." testid="page-error">
            {error}
          </Aviso>
        )}

        {!roto && (
          <HerramientasWorkspace
            herramientas={herramientas}
            movimientosPorHerramienta={movimientosPorHerramienta}
            anchoInicial={ancho}
          />
        )}
      </div>
    </PageShell>
  )
}
