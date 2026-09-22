// «CIERRE Y RECIBOS»: lo que traba el sello, el sello, y los recibos que ese sello respalda.
//
// Recibos se monta tal cual (`recibos.tsx` lo está rehaciendo otra rama): acá sólo se decide el orden.
// Va debajo porque se mira después de cerrar, y en la misma sección porque «Horas» y «Recibos» ya no
// tienen entrada propia en «Más» — `?solapa=recibos` resuelve a esta clave.

import type { PropsDeSolapa } from './index'
import { SolapaCierre } from './cierre'
import { SolapaRecibos } from './recibos'
import { SeccionRecibosDePago } from '@/features/recibos/components/SeccionRecibosDePago'

export async function SolapaCierreYRecibos(props: PropsDeSolapa) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 32 }}>
      {/* La ruta ya cortó con notFound() a quien no liquida: llegar acá es poder cerrar. */}
      {await SolapaCierre({ quincenaPedida: props.quincenaPedida, hoy: props.hoy, hrefDe: props.hrefDe, puedeCerrar: true })}
      {/* `hrefDe` Y `parametros` VIAJAN (QA, 14/09/2026): sin ellos los cuatro enlaces del recorte salían con
          `href="#"` —no filtraban— y, como el enlace era su clave, React avisaba «two children with the
          same key» en cada carga de esta sección. */}
      {/* LOS RECIBOS DE PAGO (D11, 22/09/2026): lo que la empresa paga —banco + efectivo— y la persona firma.
          Van antes que los del estudio porque salen del sello de arriba; los del estudio son otro papel. */}
      <section id="recibos-pago">
        {await SeccionRecibosDePago({ quincenaPedida: props.quincenaPedida, hoy: props.hoy })}
      </section>
      <section id="recibos" data-testid="seccion-recibos">
        {await SolapaRecibos({ quincenaPedida: props.quincenaPedida, hoy: props.hoy, hrefDe: props.hrefDe, parametros: props.parametros })}
      </section>
    </div>
  )
}
