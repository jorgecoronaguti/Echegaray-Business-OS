// EL TOTAL DE UNA COLUMNA DE PAPELES: «$90.750.000 · 2 OC».
//
// Vive aparte porque lo dibujan la lista (`/clientes`) y la ficha del cliente, y dos formatos
// parecidos del mismo número se separan en cuanto uno aprende algo. Es lo mismo que ya pasó con las
// dos tablas de cartera que decían distinto del mismo cliente.
//
// `null` NO ES CERO: una orden sin importe cargado no es una orden por $ 0 —eso sería una
// afirmación falsa sobre un contrato— y cuando alguna del grupo no lo tiene, el total lleva «·»
// para decir que suma sólo las que sí. Es la misma marca que el margen parcial de la cartera.
//
// EL PUNTO SOLO ERA UNA CIFRA SIN RÓTULO (10/09/2026). ARCOR dibuja «$ 524.163.838 · 148 OC ·» y
// noventa de esas ciento cuarenta y ocho no declaran importe en el PDF: el punto final se lee como
// un tipeo, no como «este total no está completo». Ahora la marca lleva su frase en el `title`.

import { pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import type { Total } from '../services/papelesCliente'

/** Qué dice el «·» del final. La frase no puede decir CUÁNTAS faltan: `Total` guarda el importe
 *  sumado y el conteo, no cuántas lo traían. Decirlo sin el número es mejor que no decirlo. */
const PARCIAL = 'El total suma SÓLO las órdenes cuyo PDF declara un importe. Alguna de este grupo '
  + 'no lo trae, y no se cuenta como $ 0: una orden por cero sería una afirmación falsa sobre un '
  + 'contrato. El detalle, orden por orden, está en la ficha del cliente.'

/** Un total en cero papeles: constante, para no crear un objeto por fila. */
export const SIN_PAPELES: Total = { n: 0, importe: null, parcial: false }

export function TotalDePapeles({ total, sigla, tam = '12px', testid, vacio = null, veEconomia = false, numero = null, apilado = false }: {
  total: Total
  sigla: 'OC' | 'OP'
  tam?: string
  testid?: string
  /** Qué escribir cuando no hay ninguno. `null` = no dibujar nada. */
  vacio?: string | null
  /**
   * EL NÚMERO, CUANDO HAY UNA SOLA. «OC 2173» identifica el papel; «1 OC» sólo lo cuenta, y un
   * conteo de uno no identifica nada. Con dos o más se vuelve al conteo —«5 OC»— porque enumerarlas
   * en la celda es lo que hacía ilegible la fila; ahí el número se lee en el panel.
   *
   * `null` = no se sabe, o hay más de una. La celda NO decide eso: se lo dan hecho.
   */
  numero?: string | null
  /** EL IMPORTE DE UNA OC ES EL PRECIO DE VENTA DE LA OBRA. Sin permiso económico se dice cuántas
   *  hay y nada más: qué papel existe es operativo, cuánto se cobra por él no. Nace en `false` —un
   *  olvido tiene que dejar la pantalla pobre, no abierta. */
  veEconomia?: boolean
  /**
   * LA CIFRA ARRIBA Y EL RÓTULO DEBAJO. En la celda de 120px de la OP del trabajo, «$ 4.300.876 OP
   * 4807» en un renglón se partía donde el navegador quería —«$ 4.300.876 OP» / «4807»— y se leía
   * como un número roto (dueño, 11/09/2026). Apilado, cada línea es una cosa entera.
   */
  apilado?: boolean
}) {
  // «OC 2173» con una sola; «5 OC» con varias. Se calcula UNA vez: los dos caminos de abajo —con y
  // sin permiso económico— tienen que decir lo mismo.
  const rotulo = total.n === 1 && numero ? `${sigla} ${numero}` : `${total.n} ${sigla}`
  if (!total.n) {
    return vacio === null
      ? null
      : <span data-testid={testid} style={{ fontSize: tam, color: V.tenue }}>{vacio}</span>
  }
  if (!veEconomia) {
    return (
      <span className="font-mono tabular-nums" data-testid={testid} style={{ fontSize: tam, color: V.tenue }}>
        {rotulo}
      </span>
    )
  }
  return (
    <span
      className="font-mono tabular-nums" data-testid={testid}
      style={apilado
        ? { fontSize: tam, color: V.apagado, display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, whiteSpace: 'nowrap' }
        : { fontSize: tam, color: V.apagado, whiteSpace: 'nowrap' }}
    >
      {total.importe === null ? 'sin importe' : pesos(total.importe)}
      {/* EL SUFIJO ES PARTE DE LA CIFRA Y VA EN SU MISMA FAMILIA. «$ 233.366.292» en mono y
          «16 OC» en la tipografía del texto son dos tipografías en UNA celda, que es la mezcla que
          el dueño marcó el 10/09/2026 («hay mezcla de diseño»). */}
      <span
        className="font-mono tabular-nums"
        style={{ color: V.tenue, marginLeft: apilado ? 0 : 6, fontSize: '10.5px' }}
        title={total.parcial ? PARCIAL : undefined}
      >
        {rotulo}{total.parcial ? ' ·' : ''}
      </span>
    </span>
  )
}
