import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { BASE_MI_RECIBO, cargarMiRecibo } from '@/features/recibos/miRecibo'
import { HojaImprimible } from '@/features/recibos/components/HojaImprimible'

// «VER EL RECIBO COMPLETO» (M09) y «DESCARGAR EL PDF» (M10): el mismo documento que ve Administración
// (D12), en la hoja imprimible. El PDF lo guarda el navegador desde el diálogo de impresión.

export const dynamic = 'force-dynamic'

export default async function MiReciboCompletoPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ pdf?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const m = await cargarMiRecibo(id)
  if (m.que === 'sin-sesion') redirect('/login')
  if (m.que === 'no-esta') notFound()
  const volver = { href: BASE_MI_RECIBO(id), label: 'Mi recibo' }
  if (m.que === 'sin-vinculo') {
    return <PantallaEmpleado titulo="El recibo" volver={{ ...volver }}><SinVinculo que="tus recibos" disponible={m.disponible} /></PantallaEmpleado>
  }
  if (m.que === 'error') {
    return <PantallaEmpleado titulo="El recibo" volver={{ ...volver }}><AvisoError>{m.error}</AvisoError></PantallaEmpleado>
  }
  return (
    <HojaImprimible recibos={[m.r]} titulo={m.r.codigo} pdf={sp.pdf === '1'}
      volver={<Link href={BASE_MI_RECIBO(id)} style={{ fontSize: 13 }}>Volver</Link>} />
  )
}
