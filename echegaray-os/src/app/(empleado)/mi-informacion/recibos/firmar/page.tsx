import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { C } from '@/shared/components/movil/tokens'
import { FirmarMiRecibo } from '@/features/empleado/components/MiReciboDeQuincena'
import { getMiReciboDeQuincena, periodoCorto } from '@/features/empleado/services/miReciboDeQuincena'
import { sePuedeFirmar } from '@/shared/recibo/ciclo'
import { pesos } from '@/features/empleado/services/recibos'

// M10 · FIRMAR EL RECIBO CON EL DEDO.
//
// EL ID VA EN LA QUERY, no en el camino: `/mi-informacion/recibos/quincena/<id>` es el DETALLE del recibo, y
// una acción sobre él lleva su id como parámetro (la misma forma que `firmar?entrega=` del efectivo). Así el
// árbol de urls del teléfono no tiene dos ramas que signifiquen lo mismo.

export const dynamic = 'force-dynamic'

export default async function FirmarReciboPage({ searchParams }: {
  searchParams: Promise<{ recibo?: string }>
}) {
  const { recibo: id } = await searchParams
  if (!id) notFound()
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const { data: r, error } = await getMiReciboDeQuincena(supabase, id)
  const volverA = `/mi-informacion/recibos/quincena/${id}`
  if (error) {
    return (
      <PantallaEmpleado titulo="Firmar" volver={{ href: volverA, label: 'Mi recibo' }}>
        <AvisoError testid="firmar-no-leido">{error}</AvisoError>
      </PantallaEmpleado>
    )
  }
  if (!r) notFound()
  // YA FIRMADO: no se dibuja el lienzo. Firmar dos veces lo rechaza la base, pero una pantalla que invita a
  // hacerlo y después dice que no, miente primero.
  if (!sePuedeFirmar(r)) redirect(volverA)

  return (
    <PantallaEmpleado titulo="Firmar el recibo" sub={periodoCorto(r)} volver={{ href: volverA, label: 'Mi recibo' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div data-testid="firmar-que-firmo" style={{ fontSize: 13.5, color: C.inkSuave, lineHeight: 1.5 }}>
          {r.total == null
            ? 'Estás firmando el recibo de esta quincena.'
            : `Estás firmando el recibo de esta quincena por ${pesos(r.total)}.`}
        </div>
        <FirmarMiRecibo recibo={r.id} volverA={volverA} />
      </div>
    </PantallaEmpleado>
  )
}
