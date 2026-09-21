import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaResumen } from '@/features/herramientas/components/VistaResumen'

// D01 · RESUMEN — lo que necesita una decisión hoy.
export const dynamic = 'force-dynamic'

export default async function HerramientasResumenPage() {
  const lectura = await leerParque()
  return <Marco lectura={lectura}>{(l) => <VistaResumen parque={l.parque} />}</Marco>
}
