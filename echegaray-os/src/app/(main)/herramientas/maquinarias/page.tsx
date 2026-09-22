import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaMaquinarias } from '@/features/herramientas/components/VistaMaquinarias'

// MAQUINARIAS — las máquinas con operador, solapa propia entre Mantenimiento y Rodados (dueño, 22/09/2026).
export const dynamic = 'force-dynamic'

export default async function MaquinariasPage() {
  const lectura = await leerParque()
  return <Marco lectura={lectura}>{(l) => <VistaMaquinarias parque={l.parque} />}</Marco>
}
