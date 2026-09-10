'use client'

// EL PANEL DE LAS ÓRDENES DE UNA OBRA — lo que el chip «OC ·11» promete que hay adentro.
//
// ═══ POR QUÉ EL CHIP ES UN BOTÓN Y NO UN ENLACE ═══
//
// La fila de la obra ES un `<Link>` a la obra. Un `<a>` dentro de otro `<a>` es HTML inválido: el
// navegador desarma el anidado y la fila queda con zonas que navegan a cualquier lado. El chip
// abre el panel con un `<button>` que corta la propagación y empuja la URL a mano.
//
// EL PANEL VIVE EN LA URL (`?ordenes=<obra_id>` / `?ordenes=cliente:<id>`): se comparte por chat, se
// cierra con el botón de atrás y lo dibuja el SERVIDOR, que es quien puede leer `cliente_orden` con
// la RLS de quien mira. Este componente no lee nada: recibe la lista ya resuelta.
//
// LO QUE SE DIBUJA ADENTRO ES `ListaOrdenes`, COMPARTIDO con la solapa Documentos de la ficha de
// la obra: la misma orden se mira desde el cliente y desde la obra, y dos listas parecidas se
// separan en cuanto una aprende algo. Este componente es el CAJÓN; la lista es el contenido.

import { useRouter } from 'next/navigation'
import { Drawer } from '@/shared/components/ds'
import { ListaOrdenes } from './ListaOrdenes'
import type { OrdenDetallada } from '../services/ordenesCliente'

export function PanelOrdenes({
  titulo, ordenes, veEconomia, cerrarHref, de = 'del cliente',
}: {
  titulo: string
  /** De quién son los papeles que se listan. Un panel abierto desde un TRABAJO no puede decir «del
   *  cliente»: son dos recortes distintos y el subtítulo es lo único que los distingue. */
  de?: 'del cliente' | 'de este trabajo'
  /** `null` = la lectura falló. «No pude leerlas» no se dibuja como «no hay ninguna». */
  ordenes: OrdenDetallada[] | null
  /** El campo y el jefe de obra no ven precios: el importe de la orden ES precio de venta. */
  veEconomia: boolean
  cerrarHref: string
}) {
  const router = useRouter()
  return (
    <Drawer
      titulo={titulo}
      subtitulo={ordenes === null
        ? 'no se pudieron leer'
        : `${ordenes.length} documento${ordenes.length === 1 ? '' : 's'} ${de}`}
      onCerrar={() => router.push(cerrarHref)}
      testid="panel-ordenes"
    >
      <ListaOrdenes ordenes={ordenes} veEconomia={veEconomia} />
    </Drawer>
  )
}
