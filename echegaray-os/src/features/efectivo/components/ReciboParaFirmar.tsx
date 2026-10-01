// «RECIBO PARA FIRMAR» — el enlace discreto de cada rendición MANUAL de la ficha de la entrega.
//
// Abre el PDF en otra pestaña (en el teléfono lo abre el visor del sistema, que ofrece guardar o imprimir).
// Acción secundaria: texto chico con subrayado, igual que «Editar». El permiso NO lo da este enlace: lo
// verifica la ruta en el servidor, con la sesión de quien pide.

import { V } from './estilo'

export const urlReciboParaFirmar = (rendicionId: string): string => `/administracion/compras/recibo-efectivo/${rendicionId}`

export function ReciboParaFirmar({ rendicion }: { rendicion: string }) {
  return (
    <a
      href={urlReciboParaFirmar(rendicion)} target="_blank" rel="noopener"
      style={{ fontSize: '12.5px', color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 2 }}
      data-testid="recibo-para-firmar"
    >
      Recibo para firmar
    </a>
  )
}
