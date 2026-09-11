// EL ACUMULADO DE HORAS DEL CLIENTE, EN EL PIE DE SU TABLA DE TRABAJOS.
//
// «Un acumulado HH del CLIENTE (suma de sus obras)» (dueño, 11/09/2026 18:38). Va acá y no en la
// fila de cifras del titular por una razón de verdad y no de diseño: `hh_obra` viaja SÓLO en la cara
// Obras —es la única que las dibuja— y en las otras ocho caras la cifra tendría que decir «no las
// tengo», que a la velocidad con que se lee una fila de KPIs se lee como un cero.
//
// NO ES UNA TARJETA: es una línea de total alineada a la derecha, como la de cualquier tabla. La
// skill de diseño prohíbe una card por dato con nombre.
//
// `null` NO ES CERO: sin permiso la línea dice que no puede leerlas. Un «0 HH» sobre un cliente con
// 13.221 horas cargadas es la peor de las dos respuestas posibles.

import { V } from '@/shared/components/v2/patron'
import { hh as formatoHH } from '@/shared/utils/format'

export function PieHHDelCliente({ total, obras }: {
  /** Σ de las HH de los trabajos del cliente. `null` = no se pudieron leer. */
  total: number | null
  obras: number
}) {
  return (
    <p
      data-testid="hh-del-cliente"
      title="Suma de las horas hombre de todos los trabajos de este cliente. Cada trabajo publica las
 suyas: un adicional no suma a su obra mayor, así que ninguna hora se cuenta dos veces."
      style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8,
        fontSize: '11.5px', color: V.apagado, padding: '10px 16px 0 0',
      }}
    >
      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: V.tenue }}>
        HH acumuladas del cliente
      </span>
      <span className="font-mono tabular-nums" style={{ fontSize: '12.5px', color: V.tinta }}>
        {total == null ? 'no puedo leerlas' : formatoHH(total)}
      </span>
      <span style={{ color: V.tenue }}>
        {obras === 1 ? 'en su único trabajo' : `en sus ${obras} trabajos`}
      </span>
    </p>
  )
}
