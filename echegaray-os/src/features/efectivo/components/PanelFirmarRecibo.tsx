'use client'

// EL PANEL «FIRMAR RECIBO» DE LA FICHA (01/10/2026): se abre al costado, como «Rendir sin foto». Quien rinde le
// alcanza la pantalla al proveedor del servicio y éste firma ahí. En el teléfono el panel ocupa la pantalla entera.

import { FirmarRecibo } from './FirmarRecibo'
import { Cerrar, PANEL_CLASE } from './Piezas'
import { panel } from './estilo'

export function PanelFirmarRecibo({ rendicion, frase, cerrarHref, codigo }: {
  rendicion: string
  frase: string
  cerrarHref: string
  codigo: string
}) {
  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Firmar recibo" data-testid="panel-firmar-recibo">
      <Cerrar titulo="Firmar recibo" bajada={`Gasto rendido contra ${codigo}. Firma quien prestó el servicio.`} href={cerrarHref} />
      <FirmarRecibo rendicion={rendicion} frase={frase} volverA={cerrarHref} />
    </aside>
  )
}
