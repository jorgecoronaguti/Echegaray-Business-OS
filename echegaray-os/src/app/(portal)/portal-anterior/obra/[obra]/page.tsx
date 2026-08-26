import type { Metadata } from 'next'
import { PortalCliente } from '@/features/portal/components/PortalCliente'
import { cargarPortal } from '@/features/portal/services/cargarPortal'

// LA MISMA PANTALLA DEL `29`, CON UNA OBRA ELEGIDA.
//
// No es otra pantalla ni otro componente: es `/portal` con `obraId`. Existe para que el cliente con
// dos obras pueda guardar el enlace de la que mira todos los días y para que el selector del header
// tenga a dónde llevar.
//
// QUE LA URL NOMBRE UNA OBRA NO LA ABRE. Si el acceso no la tiene entre las suyas, el service
// devuelve la que sí corresponde o nada: el portero está en la base (`cliente_de_sesion()` y
// `cliente_acceso.obras`), no en el parámetro de la ruta.

export const metadata: Metadata = {
  title: 'Su obra · Echegaray Construcciones',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ObraDelPortalPage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra } = await params
  const datos = await cargarPortal(obra)
  return <PortalCliente {...datos} />
}
