// EL TOTAL DE UNA COLUMNA DE PAPELES: «$90.750.000 · 2 OC».
//
// Vive aparte porque lo dibujan la lista (`/clientes`) y la ficha del cliente, y dos formatos
// parecidos del mismo número se separan en cuanto uno aprende algo. Es lo mismo que ya pasó con las
// dos tablas de cartera que decían distinto del mismo cliente.
//
// `null` NO ES CERO: una orden sin importe cargado no es una orden por $ 0 —eso sería una
// afirmación falsa sobre un contrato— y cuando alguna del grupo no lo tiene, el total lleva «·»
// para decir que suma sólo las que sí. Es la misma marca que el margen parcial de la cartera.

import { pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import type { Total } from '../services/papelesCliente'

/** Un total en cero papeles: constante, para no crear un objeto por fila. */
export const SIN_PAPELES: Total = { n: 0, importe: null, parcial: false }

export function TotalDePapeles({ total, sigla, tam = '12px', testid, vacio = null, veEconomia = false }: {
  total: Total
  sigla: 'OC' | 'OP'
  tam?: string
  testid?: string
  /** Qué escribir cuando no hay ninguno. `null` = no dibujar nada. */
  vacio?: string | null
  /** EL IMPORTE DE UNA OC ES EL PRECIO DE VENTA DE LA OBRA. Sin permiso económico se dice cuántas
   *  hay y nada más: qué papel existe es operativo, cuánto se cobra por él no. Nace en `false` —un
   *  olvido tiene que dejar la pantalla pobre, no abierta. */
  veEconomia?: boolean
}) {
  if (!total.n) {
    return vacio === null
      ? null
      : <span data-testid={testid} style={{ fontSize: tam, color: V.tenue }}>{vacio}</span>
  }
  if (!veEconomia) {
    return (
      <span className="tabular-nums" data-testid={testid} style={{ fontSize: tam, color: V.tenue }}>
        {total.n} {sigla}
      </span>
    )
  }
  return (
    <span className="font-mono tabular-nums" data-testid={testid} style={{ fontSize: tam, color: V.apagado }}>
      {total.importe === null ? 'sin importe' : pesos(total.importe)}
      <span style={{ color: V.tenue, marginLeft: 6, fontSize: '10.5px' }}>
        {total.n} {sigla}{total.parcial ? ' ·' : ''}
      </span>
    </span>
  )
}
