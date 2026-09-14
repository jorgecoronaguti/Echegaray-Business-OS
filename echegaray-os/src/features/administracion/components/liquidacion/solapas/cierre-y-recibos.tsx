// «CIERRE Y RECIBOS»: lo que traba el sello, el sello, y los recibos que ese sello respalda.
//
// Recibos se monta tal cual (`recibos.tsx` lo está rehaciendo otra rama): acá sólo se decide el orden.
// Va debajo porque se mira después de cerrar, y en la misma sección porque «Horas» y «Recibos» ya no
// tienen entrada propia en «Más» — `?solapa=recibos` resuelve a esta clave.

import type { PropsDeSolapa } from './index'
import { SolapaCierre } from './cierre'
import { SolapaRecibos } from './recibos'

export async function SolapaCierreYRecibos(props: PropsDeSolapa) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 32 }}>
      {/* La ruta ya cortó con notFound() a quien no liquida: llegar acá es poder cerrar. */}
      {await SolapaCierre({ quincenaPedida: props.quincenaPedida, hoy: props.hoy, hrefDe: props.hrefDe, puedeCerrar: true })}
      <section id="recibos" data-testid="seccion-recibos">
        {await SolapaRecibos({ quincenaPedida: props.quincenaPedida, hoy: props.hoy })}
      </section>
    </div>
  )
}
