import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Shell } from '../Shell'
import { sesionDelPortal } from '../sesion'
import { obrasDelClientePara } from '../datos'

// EL PORTAL ES OTRA APLICACIÓN. Vive fuera de `(main)` a propósito: no hereda el header del OS, ni el
// sidebar, ni el buscador global. Un cliente que ve un pedazo del chrome interno ve algo que no es
// suyo, y no hay forma de "ocultarlo un poco".
//
// ═══ SE ENTRA COMO UN CLIENTE, Y SE VE LO QUE ESE CLIENTE VE ═══
//
// Quién es se decide en la puerta y viaja en la cookie firmada. Adentro no hay selector de cliente ni
// nada distinto para el dueño: el pedido fue «quiero verlo como lo ve el cliente, no algo adaptado a
// mí», y una pantalla que se comporta distinto según quién mira no prueba nada de lo que muestra.

export const metadata = { title: 'Echegaray Construcciones · Su obra' }

// SIN CACHÉ. Lo que ve un cliente depende de su cookie; una página cacheada se le serviría a otro.
export const dynamic = 'force-dynamic'

export default async function LayoutPortal({ children }: { children: ReactNode }) {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')

  const obras = await obrasDelClientePara(sesion.mail, sesion.clienteId)
  // El nombre sale de las obras y no de una consulta aparte: si el mail perdió el alcance a este
  // cliente, no hay obras, no hay nombre, y la pantalla lo dice en vez de dibujar un encabezado vacío.
  return (
    <Shell cliente={obras[0]?.clienteNombre ?? 'Su obra'} obras={obras.length}>
      {children}
    </Shell>
  )
}
