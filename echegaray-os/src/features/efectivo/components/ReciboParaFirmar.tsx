// EL RECIBO DE CADA RENDICIÓN MANUAL EN LA FICHA DE LA ENTREGA: «Firmar recibo» si falta, «Recibo firmado» si ya está.
//
// Acción secundaria: texto chico con subrayado, igual que «Editar». «Firmar recibo» abre el panel de firma de la
// misma ficha (el proveedor firma ahí, en la pantalla de quien rinde); «Recibo firmado» abre el PDF con la firma
// estampada. El permiso NO lo da este enlace: lo verifican la base (firmar) y la ruta del servidor (PDF).

import Link from 'next/link'
import { urlEfectivo } from '../logica/url'
import { V } from './estilo'

export const urlReciboFirmado = (rendicionId: string): string => `/administracion/compras/recibo-efectivo/${rendicionId}`

const enlace = { fontSize: '12.5px', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 2 } as const

export function ReciboParaFirmar({ rendicion, entrega, firmado }: { rendicion: string; entrega: string; firmado: boolean }) {
  if (firmado) {
    return <a href={urlReciboFirmado(rendicion)} target="_blank" rel="noopener" style={enlace} data-testid="recibo-firmado">Recibo firmado</a>
  }
  return (
    <Link href={urlEfectivo({ entrega, panel: 'recibo', item: rendicion })} prefetch={false} scroll={false} style={enlace} data-testid="recibo-para-firmar">
      Firmar recibo
    </Link>
  )
}
