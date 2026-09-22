import { notFound, redirect } from 'next/navigation'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { C, R } from '@/shared/components/movil/tokens'
import { BASE_MI_RECIBO, cargarMiRecibo } from '@/features/recibos/miRecibo'
import { motivoParaNo, periodoCorto } from '@/features/recibos/logica'
import { Enlace, ReciboEnEspera, ReciboFirmado, TarjetaDelRecibo } from '@/features/recibos/components/Movil'
import { NoCoincide } from '@/features/recibos/components/NoCoincide'
import Link from 'next/link'

// M09 · MI RECIBO DE PAGO — lo que me pagan esta quincena, antes de firmarlo.
//
// El importe es la foto del recibo que emitió Administración (la liquidación sellada), nunca un cálculo
// de esta pantalla. «No coincide» se avisa ANTES de firmar; después, el reclamo va por otra vía. Si ya
// está firmado, la pantalla es la de M10 (firmado).

export const dynamic = 'force-dynamic'

const VOLVER = { href: '/mi-informacion/recibos', label: 'Mis recibos' }

export default async function MiReciboDePagoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await cargarMiRecibo(id)
  if (m.que === 'sin-sesion') redirect('/login')
  if (m.que === 'no-esta') notFound()
  if (m.que === 'sin-vinculo') {
    return <PantallaEmpleado titulo="Mi recibo" volver={{ ...VOLVER }}><SinVinculo que="tus recibos" disponible={m.disponible} /></PantallaEmpleado>
  }
  if (m.que === 'error') {
    return <PantallaEmpleado titulo="Mi recibo" volver={{ ...VOLVER }}><AvisoError testid="mi-recibo-error">{m.error}</AvisoError></PantallaEmpleado>
  }
  const { r, anteriores } = m
  const base = BASE_MI_RECIBO(r.id)
  const periodo = <span style={{ fontSize: 12.5, color: C.muted, paddingRight: 6 }}>{periodoCorto(r.desde, r.hasta)}</span>

  if (['firmado_telefono', 'firmado_papel', 'archivado'].includes(r.estado)) {
    return (
      <PantallaEmpleado titulo="Recibo firmado" volver={{ ...VOLVER }} acciones={<span style={{ fontSize: 12.5, color: C.pos, paddingRight: 6 }}>listo</span>}>
        <ReciboFirmado r={r} anteriores={anteriores} base={base} />
      </PantallaEmpleado>
    )
  }

  const noFirma = motivoParaNo('firmar', r, 'persona')
  return (
    <PantallaEmpleado titulo="Mi recibo" volver={{ ...VOLVER }} acciones={periodo}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TarjetaDelRecibo r={r} />
        <Enlace href={`${base}/completo`} testid="ver-recibo-completo">Ver el recibo completo</Enlace>
        {r.estado === 'observado' && (
          <ReciboEnEspera titulo="Avisaste que no coincide">
            {r.observacion} — Administración lo revisa y te manda uno nuevo para firmar.
          </ReciboEnEspera>
        )}
        {r.estado !== 'observado' && noFirma && (
          <ReciboEnEspera titulo="Todavía no se puede firmar">
            {r.desactualizado ? 'La liquidación cambió después de emitirlo: Administración va a mandar uno nuevo.' : noFirma}
          </ReciboEnEspera>
        )}
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
          Si algo no coincide con lo que trabajaste, se avisa antes de firmar: después de firmar, el reclamo se hace por otra vía.
        </div>
        {!noFirma && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link href={`${base}/firmar`} data-testid="firmar-recibo" style={{
              height: 56, background: C.marca, color: C.ink, borderRadius: R.control, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 16, fontWeight: 600, textDecoration: 'none',
            }}>Estoy de acuerdo · firmar</Link>
            <NoCoincide recibo={r.id} />
            <Link href={`${base}/papel`} data-testid="subir-papel-recibo" style={{ textAlign: 'center', fontSize: 13, color: C.muted, padding: '6px 0' }}>
              Lo firmé en papel · subir la foto
            </Link>
          </div>
        )}
      </div>
    </PantallaEmpleado>
  )
}
