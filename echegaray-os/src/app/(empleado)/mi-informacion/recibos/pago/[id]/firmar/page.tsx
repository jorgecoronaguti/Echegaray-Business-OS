import { notFound, redirect } from 'next/navigation'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { C } from '@/shared/components/movil/tokens'
import { BASE_MI_RECIBO, cargarMiRecibo } from '@/features/recibos/miRecibo'
import { miles, motivoParaNo, periodoCorto } from '@/features/recibos/logica'
import { ReciboEnEspera, ReciboFirmado } from '@/features/recibos/components/Movil'
import { FirmarRecibo } from '@/features/recibos/components/FirmarRecibo'

// M10 · FIRMAR EL RECIBO — el trazo con el dedo, y al confirmar, el estado «firmado».
//
// La firma con el dedo vale como conformidad interna (dueño, 22/09/2026). La base comprueba que quien
// firma es la persona del recibo y que el recibo sigue diciendo lo que dice la liquidación.

export const dynamic = 'force-dynamic'

export default async function FirmarMiReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await cargarMiRecibo(id)
  if (m.que === 'sin-sesion') redirect('/login')
  if (m.que === 'no-esta') notFound()
  const volver = { href: BASE_MI_RECIBO(id), label: 'Mi recibo' }
  if (m.que === 'sin-vinculo') {
    return <PantallaEmpleado titulo="Firmar el recibo" volver={{ ...volver }}><SinVinculo que="tus recibos" disponible={m.disponible} /></PantallaEmpleado>
  }
  if (m.que === 'error') {
    return <PantallaEmpleado titulo="Firmar el recibo" volver={{ ...volver }}><AvisoError>{m.error}</AvisoError></PantallaEmpleado>
  }
  const { r, anteriores } = m
  if (['firmado_telefono', 'firmado_papel', 'archivado'].includes(r.estado)) {
    return (
      <PantallaEmpleado titulo="Recibo firmado" volver={{ href: '/mi-informacion/recibos', label: 'Mis recibos' }}
        acciones={<span style={{ fontSize: 12.5, color: C.pos, paddingRight: 6 }}>listo</span>}>
        <ReciboFirmado r={r} anteriores={anteriores} base={BASE_MI_RECIBO(r.id)} />
      </PantallaEmpleado>
    )
  }
  const noFirma = motivoParaNo('firmar', r, 'persona')
  return (
    <PantallaEmpleado titulo="Firmar el recibo" volver={{ ...volver }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100dvh - 220px)' }}>
        <div style={{ fontSize: 13.5, color: C.inkSuave, lineHeight: 1.5 }} data-testid="firmar-resumen">
          {r.codigo} · quincena {periodoCorto(r.desde, r.hasta)} · $ {miles(r.total)}
        </div>
        {noFirma
          ? <ReciboEnEspera titulo="Todavía no se puede firmar">{noFirma}</ReciboEnEspera>
          : <FirmarRecibo recibo={r.id} />}
      </div>
    </PantallaEmpleado>
  )
}
