import { Suspense } from 'react'
import { leerParque } from '@/features/herramientas/services/datos'
import { Marco } from '@/features/herramientas/components/Marco'
import { VistaMovimientos } from '@/features/herramientas/components/VistaMovimientos'
import { FiltrosMovimientos, type Opcion } from '@/features/herramientas/components/FiltrosMovimientos'
import { claveUsuario } from '@/features/herramientas/logica/movimientos'
import { autorDe, rotuloUbicacion } from '@/features/herramientas/logica/parque'

// D06 · MOVIMIENTOS — el libro, con filtros de ventana, lugar y persona (en la URL).
export const dynamic = 'force-dynamic'

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const lectura = await leerParque()
  const d = uno(sp.dias)
  const dias = d === 'todo' ? null : [7, 30, 90].includes(Number(d)) ? Number(d) : 30
  const filtros = { dias, ubicacion: uno(sp.ubicacion), usuario: uno(sp.usuario) }

  let lugares: Opcion[] = []
  let personas: Opcion[] = []
  if (lectura.estado === 'ok') {
    const p = lectura.parque
    const usadas = new Set(p.movimientos.flatMap((m) => [m.origen_id, m.destino_id]).filter((x): x is string => !!x))
    lugares = [...usadas].map((id) => ({ v: id, t: rotuloUbicacion(p, id) })).sort((a, b) => a.t.localeCompare(b.t, 'es'))
    const pm = new Map<string, string>()
    for (const m of p.movimientos) { const k = claveUsuario(m); const n = autorDe(p, m); if (k && n) pm.set(k, n) }
    personas = [...pm].map(([v, t]) => ({ v, t })).sort((a, b) => a.t.localeCompare(b.t, 'es'))
  }

  return (
    <Marco lectura={lectura} derecha={<Suspense><FiltrosMovimientos lugares={lugares} personas={personas} /></Suspense>}>
      {(l) => <VistaMovimientos parque={l.parque} filtros={filtros} />}
    </Marco>
  )
}
