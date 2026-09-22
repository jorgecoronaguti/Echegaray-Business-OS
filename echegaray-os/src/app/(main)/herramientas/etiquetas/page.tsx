import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaEtiquetas } from '@/features/herramientas/components/VistaEtiquetas'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'

// D14 · ETIQUETAS — cola + hoja A4 de 24. `?codigos=AMO-001,AMO-002` imprime sólo esos.
export const dynamic = 'force-dynamic'

export default async function EtiquetasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const crudo = Array.isArray(sp.codigos) ? sp.codigos.join(',') : (sp.codigos ?? '')
  const pedidos = crudo.split(',').map((c) => normalizarCodigo(c)).filter((c): c is string => !!c).slice(0, 500)
  const lectura = await leerParque()
  return <Marco lectura={lectura}>{() => <VistaEtiquetas pedidos={pedidos} />}</Marco>
}
