import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Shell } from '../Shell'
import { sesionDelPortal } from '../sesion'
import { accesoDelPortal, obrasDelCliente } from '../datos'

// EL PORTAL ES OTRA APLICACIÓN. Vive fuera de `(main)` a propósito: no hereda el header del OS, ni el
// sidebar, ni el buscador global. Un cliente que ve un pedazo del chrome interno ve algo que no es
// suyo, y no hay forma de "ocultarlo un poco".
//
// ═══ SE ENTRA COMO UN CLIENTE, Y SE VE LO QUE ESE CLIENTE VE ═══
//
// Quién es se decide en la puerta y viaja en la cookie firmada. Adentro no hay selector de cliente ni
// nada distinto para el dueño: el pedido fue «quiero verlo como lo ve el cliente, no algo adaptado a
// mí», y una pantalla que se comporta distinto según quién mira no prueba nada de lo que muestra.
//
// ═══ EL ACCESO SE VUELVE A PREGUNTAR ACÁ ═══
//
// La cookie dice quién es; `cliente_acceso` dice si todavía puede entrar. Un acceso revocado en la
// ficha del cliente cae a la puerta en la pantalla siguiente, sin esperar a que venza la cookie.

export const metadata = { title: 'Echegaray Construcciones · Su obra' }

// SIN CACHÉ. Lo que ve un cliente depende de su cookie; una página cacheada se le serviría a otro.
export const dynamic = 'force-dynamic'

export default async function LayoutPortal({ children }: { children: ReactNode }) {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')

  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  const obras = await obrasDelCliente(acceso)
  return (
    <Shell cliente={acceso.clienteNombre} obras={obras.length} previa={sesion.previa === true}>
      {children}
    </Shell>
  )
}
