import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaPlanilla } from '@/features/herramientas/components/VistaPlanilla'

// LA PLANILLA DE UNA OBRA (o de cualquier lugar): `?u=<ubicación>`. Sale de los movimientos.
export const dynamic = 'force-dynamic'

export default async function PlanillaPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const [{ u }, lectura] = await Promise.all([searchParams, leerParque()])
  return <Marco lectura={lectura}>{(l) => <VistaPlanilla parque={l.parque} ubicacionId={u ?? null} />}</Marco>
}
