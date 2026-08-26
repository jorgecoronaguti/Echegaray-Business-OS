import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Shell } from './Shell'
import { sesionDelPortal } from './sesion'
import { obrasDelCliente, nombreDelCliente, obraElegida } from './datos'

// EL PORTAL ES OTRA APLICACIÓN. Vive fuera de `(main)` a propósito: no hereda el header del OS, ni el
// sidebar, ni el buscador global. Un cliente que ve un pedazo del chrome interno ve algo que no es
// suyo, y no hay forma de "ocultarlo un poco".

export const metadata = { title: 'Echegaray Construcciones · Su obra' }

// SIN CACHÉ. Lo que ve un cliente depende de su cookie; una página cacheada se le serviría a otro.
export const dynamic = 'force-dynamic'

export default async function LayoutPortal({
  children,
  // La obra elegida viaja en la URL y no en el estado: es compartible, sobrevive a un refresco y no
  // necesita un store para una sola decisión.
  searchParams,
}: {
  children: ReactNode
  searchParams?: Promise<{ obra?: string }>
}) {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')

  const [obras, cliente] = await Promise.all([obrasDelCliente(sesion.clienteId), nombreDelCliente(sesion.clienteId)])
  const activa = obraElegida(obras, (await searchParams)?.obra)

  return (
    <Shell obras={obras} obraActivaId={activa?.id ?? null} cliente={cliente}>
      {children}
    </Shell>
  )
}
