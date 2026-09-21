'use client'

// Los botones que abren un panel desde una pantalla que se dibuja en el servidor.

import type { CSSProperties, ReactNode } from 'react'
import { useHerramientas } from './Espacio'
import { botonPrimario, botonSecundario } from './estilo'
import { IcoFlecha } from './iconos'

export function BotonMover({ ids, destino, children, primario = true, testid = 'registrar-movimiento', style }: {
  ids: string[]
  destino?: string
  children?: ReactNode
  primario?: boolean
  testid?: string
  style?: CSSProperties
}) {
  const { abrir } = useHerramientas()
  return (
    <button type="button" data-testid={testid} onClick={() => abrir({ tipo: 'mover', ids, destino })} style={{ ...(primario ? botonPrimario : botonSecundario), ...style }}>
      {primario && <IcoFlecha tam={13} />}
      {children ?? 'Registrar movimiento'}
    </button>
  )
}

export function BotonAlta({ primario = false }: { primario?: boolean }) {
  const { abrir } = useHerramientas()
  return (
    <button type="button" data-testid="nuevo-activo" onClick={() => abrir({ tipo: 'alta' })} style={primario ? botonPrimario : botonSecundario}>
      Nuevo activo
    </button>
  )
}

export function BotonReportar({ ids, children }: { ids: string[]; children?: ReactNode }) {
  const { abrir } = useHerramientas()
  return (
    <button type="button" data-testid="reportar-problema" onClick={() => abrir({ tipo: 'reportar', ids })} style={botonSecundario}>
      {children ?? 'Reportar problema'}
    </button>
  )
}
