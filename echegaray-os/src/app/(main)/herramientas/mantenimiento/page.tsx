import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaMantenimiento } from '@/features/herramientas/components/VistaMantenimiento'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'

// D07 · MANTENIMIENTO, etapa 1 — la cola; la orden de reparación externa es etapa 2.
// `?revision=<código>` abre la ficha de revisión de un rodado o máquina (23/09).
export const dynamic = 'force-dynamic'

export default async function MantenimientoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const lectura = await leerParque()
  const crudo = Array.isArray(sp.activo) ? sp.activo[0] : sp.activo
  const rev = Array.isArray(sp.revision) ? sp.revision[0] : sp.revision
  return <Marco lectura={lectura}>{() => <VistaMantenimiento activo={crudo ? normalizarCodigo(crudo) : null} revision={rev ? normalizarCodigo(rev) : null} />}</Marco>
}
