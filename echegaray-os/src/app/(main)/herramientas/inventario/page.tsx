import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaInventario } from '@/features/herramientas/components/VistaInventario'
import { filtrosDeURL } from '@/features/herramientas/logica/inventario'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'

// D02 · INVENTARIO — lista + ficha en split. `?activo=<código>` abre la ficha (lo usa `/h/<código>`).
export const dynamic = 'force-dynamic'

export default async function InventarioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const lectura = await leerParque()
  const crudo = Array.isArray(sp.activo) ? sp.activo[0] : sp.activo
  const activo = crudo ? normalizarCodigo(crudo) : null
  return (
    <Marco lectura={lectura}>
      {() => <VistaInventario filtros={filtrosDeURL(sp)} activo={activo} />}
    </Marco>
  )
}
