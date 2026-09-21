import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaRodados } from '@/features/herramientas/components/VistaRodados'

// D11 · RODADOS, etapa 1 — la lista con lo que hay; km, papeles y service «sin cargar».
export const dynamic = 'force-dynamic'

export default async function RodadosPage() {
  const lectura = await leerParque()
  return <Marco lectura={lectura}>{(l) => <VistaRodados parque={l.parque} />}</Marco>
}
