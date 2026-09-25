import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaUbicaciones, elegirUbicacion, type FiltroLugar } from '@/features/herramientas/components/VistaUbicaciones'

// D04 · UBICACIONES — el parque por dónde está. `?u=<ubicación>`, `?tipo=<tipo>` elige la primera de ese tipo,
// `?cliente=<cliente_id>` abre el cliente entero (todas sus obras: es el mismo predio, 25/09/2026).
export const dynamic = 'force-dynamic'

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null

export default async function UbicacionesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const lectura = await leerParque()
  const f = uno(sp.f)
  const filtro: FiltroLugar = f === 'problema' || f === 'viejas' ? f : 'todo'
  return (
    <Marco lectura={lectura}>
      {(l) => <VistaUbicaciones parque={l.parque} ubicacion={elegirUbicacion(l.parque, uno(sp.u), uno(sp.tipo))} filtro={filtro} cliente={uno(sp.cliente)} />}
    </Marco>
  )
}
