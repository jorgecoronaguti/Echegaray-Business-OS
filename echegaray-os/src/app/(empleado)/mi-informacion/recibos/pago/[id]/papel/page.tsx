import { notFound, redirect } from 'next/navigation'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { C, R } from '@/shared/components/movil/tokens'
import { BASE_MI_RECIBO, cargarMiRecibo } from '@/features/recibos/miRecibo'
import { miles, motivoParaNo } from '@/features/recibos/logica'
import { ReciboEnEspera } from '@/features/recibos/components/Movil'
import { SubirPapel } from '@/features/recibos/components/SubirPapel'

// M11 · SUBIR EL RECIBO DE PAPEL — para quien firma el papel: la foto del recibo ya firmado.
//
// Papel y firma con el dedo conviven (dueño, 22/09/2026): se puede subir el papel aunque ya haya
// firmado en el teléfono. Administración lo verifica y lo archiva en el legajo (D13).

export const dynamic = 'force-dynamic'

export default async function PapelDeMiReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await cargarMiRecibo(id)
  if (m.que === 'sin-sesion') redirect('/login')
  if (m.que === 'no-esta') notFound()
  const volver = { href: BASE_MI_RECIBO(id), label: 'Mi recibo' }
  if (m.que === 'sin-vinculo') {
    return <PantallaEmpleado titulo="Recibo en papel" volver={{ ...volver }}><SinVinculo que="tus recibos" disponible={m.disponible} /></PantallaEmpleado>
  }
  if (m.que === 'error') {
    return <PantallaEmpleado titulo="Recibo en papel" volver={{ ...volver }}><AvisoError>{m.error}</AvisoError></PantallaEmpleado>
  }
  const { r } = m
  const noSube = motivoParaNo('subir_papel', r, 'persona')
  return (
    <PantallaEmpleado titulo="Recibo en papel" volver={{ ...volver }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100dvh - 220px)' }}>
        <div style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }} data-testid="papel-quien">{r.personaNombre} · $ {miles(r.total)}</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Para quien firma el papel: se saca la foto del recibo ya firmado y se sube acá.</div>
        </div>
        {noSube
          ? <ReciboEnEspera titulo="No se puede subir el papel">{noSube}</ReciboEnEspera>
          : <SubirPapel recibo={r.id} volverA={BASE_MI_RECIBO(r.id)} />}
      </div>
    </PantallaEmpleado>
  )
}
