'use client'

// Los botones que abren un panel desde una pantalla que se dibuja en el servidor. Los nombres son los
// del teléfono (`ACCION`): la misma acción se llama igual en las dos caras (paridad, dueño 23/09).

import type { CSSProperties, ReactNode } from 'react'
import { ACCION } from '../logica/acciones-lugar'
import { useHerramientas } from './Espacio'
import { botonPrimario, botonSecundario } from './estilo'
import { IcoFlecha } from './iconos'

export function BotonMover({ ids, destino, origen, children, primario = true, testid = 'registrar-movimiento', style }: {
  ids: string[]
  destino?: string
  /** Desde qué lugar: los lotes repartidos salen de ahí. */
  origen?: string
  children?: ReactNode
  primario?: boolean
  testid?: string
  style?: CSSProperties
}) {
  const { abrir } = useHerramientas()
  return (
    <button type="button" data-testid={testid} onClick={() => abrir({ tipo: 'mover', ids, destino, origen })} style={{ ...(primario ? botonPrimario : botonSecundario), ...style }}>
      {primario && <IcoFlecha tam={13} />}
      {children ?? 'Registrar movimiento'}
    </button>
  )
}

export function BotonAlta({ primario = false, destino }: { primario?: boolean; destino?: string }) {
  const { abrir } = useHerramientas()
  return (
    <button type="button" data-testid="nuevo-activo" onClick={() => abrir({ tipo: 'alta', destino })} style={primario ? botonPrimario : botonSecundario}>
      {ACCION.alta}
    </button>
  )
}

export function BotonReportar({ ids, children }: { ids: string[]; children?: ReactNode }) {
  const { abrir } = useHerramientas()
  return (
    <button type="button" data-testid="reportar-problema" onClick={() => abrir({ tipo: 'reportar', ids })} style={botonSecundario}>
      {children ?? ACCION.reportar}
    </button>
  )
}
