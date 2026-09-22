import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { AvisoError, Tarjeta } from '@/shared/components/movil/Piezas'
import { C } from '@/shared/components/movil/tokens'
import { SubirPapelDelRecibo } from '@/features/empleado/components/MiReciboDeQuincena'
import { getMiReciboDeQuincena, periodoCorto } from '@/features/empleado/services/miReciboDeQuincena'
import { pesos } from '@/features/empleado/services/recibos'

// M11 · SUBIR EL RECIBO DE PAPEL — para quien firma el papel.
//
// CONVIVE CON LA FIRMA DEL DEDO (dueño, 22/09): no se elige una. Quien ya firmó con el dedo puede subir el
// papel igual, y al revés; la base guarda las dos y Administración archiva con cualquiera.

export const dynamic = 'force-dynamic'

export default async function PapelDelReciboPage({ searchParams }: {
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
      <PantallaEmpleado titulo="Recibo en papel" volver={{ href: volverA, label: 'Mi recibo' }}>
        <AvisoError testid="papel-no-leido">{error}</AvisoError>
      </PantallaEmpleado>
    )
  }
  if (!r) notFound()
  // ARCHIVADO: ya se verificó y se guardó. Subir otra foto no cambiaría nada y lo rechaza la base.
  if (r.estado === 'archivado') redirect(volverA)

  return (
    <PantallaEmpleado titulo="Recibo en papel" sub={periodoCorto(r)} volver={{ href: volverA, label: 'Mi recibo' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Tarjeta relleno={18} testid="papel-de-quien">
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {r.nombre}{r.total == null ? '' : ` · ${pesos(r.total)}`}
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginTop: 8 }}>
            Para quien firma el papel: se saca la foto del recibo ya firmado y se sube acá.
          </div>
        </Tarjeta>
        {r.papelSubidoEn && (
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }} data-testid="papel-ya-hay">
            Ya habías subido una foto. Si subís otra, queda la nueva.
          </div>
        )}
        <SubirPapelDelRecibo recibo={r.id} volverA={volverA} />
      </div>
    </PantallaEmpleado>
  )
}
